import * as Network from 'expo-network';
import Zeroconf from 'react-native-zeroconf';
import type { DeviceKind, TvDevice } from '../core/types';
import { RawSocket } from '../net/tcp';
import { makeDeviceId } from '../storage/devices';
import { classifyPorts, PROBE_PORTS, subnetHosts } from './classify';

const MDNS_SCAN_MS = 6000;
const PROBE_TIMEOUT_MS = 700;
const CONCURRENCY = 32;

export interface ScanProgress {
  found: TvDevice[];
  done: number;
  total: number;
}

/** Android TVs advertise the remote service over mDNS, which also gives us their names. */
function scanMdns(onFound: (d: TvDevice) => void): () => void {
  let zeroconf: Zeroconf | null = null;
  try {
    zeroconf = new Zeroconf();
    zeroconf.on('resolved', (service) => {
      const host = service.ipv4?.[0] ?? service.addresses?.find((a) => a.includes('.'));
      if (!host) return;
      onFound({
        id: makeDeviceId(host, 'androidtv'),
        name: service.name || 'Android TV',
        host,
        kind: 'androidtv',
        brand: service.txt?.mf || undefined,
        model: service.txt?.md || undefined,
      });
    });
    zeroconf.on('error', () => {});
    zeroconf.scan({ type: 'androidtvremote2', protocol: 'tcp', domain: 'local.' });
  } catch {
    zeroconf = null;
  }
  return () => {
    try {
      zeroconf?.stop();
      zeroconf?.removeDeviceListeners();
    } catch {
      // ignore
    }
  };
}

async function describeSamsung(host: string): Promise<Partial<TvDevice>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`http://${host}:8001/api/v2/`, { signal: controller.signal });
    const json = await res.json();
    const d = json?.device ?? {};
    return {
      name: d.name || json?.name || 'Samsung TV',
      model: d.modelName,
      mac: d.wifiMac && d.wifiMac !== '00:00:00:00:00:00' ? d.wifiMac : undefined,
    };
  } catch {
    return { name: 'Samsung TV' };
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULT_NAMES: Record<DeviceKind, { name: string; brand?: string }> = {
  androidtv: { name: 'Android TV' },
  webos: { name: 'LG webOS TV', brand: 'LG' },
  tizen: { name: 'Samsung TV', brand: 'Samsung' },
  'xiaomi-legacy': { name: 'Xiaomi Mi TV', brand: 'Xiaomi' },
};

async function probeHost(host: string): Promise<TvDevice | null> {
  const open = new Set<number>();
  await Promise.all(
    PROBE_PORTS.map(async (port) => {
      if (await RawSocket.probe(host, port, PROBE_TIMEOUT_MS)) open.add(port);
    }),
  );
  const kind = classifyPorts(open);
  if (!kind) return null;
  const base: TvDevice = { id: makeDeviceId(host, kind), host, kind, ...DEFAULT_NAMES[kind] };
  if (kind === 'tizen') Object.assign(base, await describeSamsung(host));
  return base;
}

/**
 * Finds TVs on the local Wi-Fi: mDNS for Android TV plus a port scan of the /24 subnet
 * (works on both iOS and Android without the multicast entitlement SSDP would need).
 */
export async function scanNetwork(
  onProgress: (p: ScanProgress) => void,
  shouldStop: () => boolean,
): Promise<TvDevice[]> {
  const started = Date.now();
  const found = new Map<string, TvDevice>(); // keyed by host
  let done = 0;
  let total = 0;
  const emit = () => onProgress({ found: [...found.values()], done, total });

  const add = (d: TvDevice) => {
    const existing = found.get(d.host);
    if (!existing) {
      found.set(d.host, d);
    } else if (existing.kind === d.kind) {
      // The same TV found by mDNS and by the port scan: keep the most specific details.
      const isDefault = (name: string) => name === DEFAULT_NAMES[d.kind].name;
      found.set(d.host, {
        ...d,
        ...existing,
        name: isDefault(existing.name) ? d.name : existing.name,
        brand: existing.brand ?? d.brand,
        model: existing.model ?? d.model,
      });
    }
    emit();
  };

  const stopMdns = scanMdns(add);
  try {
    const ip = await Network.getIpAddressAsync();
    const hosts = subnetHosts(ip);
    total = hosts.length;
    emit();
    let index = 0;
    const worker = async () => {
      while (index < hosts.length && !shouldStop()) {
        const host = hosts[index++];
        const device = await probeHost(host);
        done++;
        if (device) add(device);
        else emit();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // Give mDNS its full window even if the port scan was quick.
    while (Date.now() - started < MDNS_SCAN_MS && !shouldStop()) {
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    stopMdns();
  }
  return [...found.values()];
}
