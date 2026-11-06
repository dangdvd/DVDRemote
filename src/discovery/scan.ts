import * as Network from 'expo-network';
import Zeroconf, { type Service } from 'react-native-zeroconf';
import type { DeviceKind, TvDevice } from '../core/types';
import { RawSocket } from '../net/tcp';
import { makeDeviceId } from '../storage/devices';
import { classifyPorts, PROBE_PORTS, subnetHosts } from './classify';
import { MDNS_CANDIDATE_TYPES, MDNS_REMOTE_TYPE, serviceHost, serviceName } from './mdns';

const MDNS_SCAN_MS = 8000;
/** TVs on Wi-Fi often answer slowly (power saving), so 700 ms missed some LG TVs. */
const PROBE_TIMEOUT_MS = 1200;
/** Hosts found by mDNS certainly exist, so they can be given longer. */
const CANDIDATE_TIMEOUT_MS = 2500;
/** Each host probes every port at once; 24 hosts keeps open sockets well under iOS's limit. */
const CONCURRENCY = 24;

export interface ScanProgress {
  found: TvDevice[];
  done: number;
  total: number;
}

/**
 * Browses mDNS. Android TVs advertise the remote service itself; AirPlay and Chromecast only
 * point at hosts worth probing (LG webOS advertises AirPlay), which also finds TVs outside the
 * phone's /24 and TVs too slow to answer the subnet scan.
 */
function scanMdns(onRemote: (d: TvDevice) => void, onCandidate: (host: string, name: string | null) => void): () => void {
  const instances: Zeroconf[] = [];
  const browse = (type: string, onResolved: (service: Service) => void) => {
    try {
      // One instance per type: scan() on an instance stops that instance's previous scan.
      const zeroconf = new Zeroconf();
      zeroconf.on('resolved', onResolved);
      zeroconf.on('error', () => {});
      zeroconf.scan({ type, protocol: 'tcp', domain: 'local.' });
      instances.push(zeroconf);
    } catch {
      // mDNS unavailable: the subnet scan still runs.
    }
  };

  browse(MDNS_REMOTE_TYPE, (service) => {
    const host = serviceHost(service);
    if (!host) return;
    onRemote({
      id: makeDeviceId(host, 'androidtv'),
      name: serviceName(MDNS_REMOTE_TYPE, service) || 'Android TV',
      host,
      kind: 'androidtv',
      brand: service.txt?.mf || undefined,
      model: service.txt?.md || undefined,
    });
  });
  for (const type of MDNS_CANDIDATE_TYPES) {
    browse(type, (service) => {
      const host = serviceHost(service);
      if (host) onCandidate(host, serviceName(type, service));
    });
  }

  return () => {
    for (const zeroconf of instances.splice(0)) {
      try {
        zeroconf.stop();
        zeroconf.removeDeviceListeners();
      } catch {
        // ignore
      }
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

async function probeHost(host: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<TvDevice | null> {
  const open = new Set<number>();
  await Promise.all(
    PROBE_PORTS.map(async (port) => {
      if (await RawSocket.probe(host, port, timeoutMs)) open.add(port);
    }),
  );
  const kind = classifyPorts(open);
  if (!kind) return null;
  const base: TvDevice = { id: makeDeviceId(host, kind), host, kind, ...DEFAULT_NAMES[kind] };
  if (kind === 'tizen') Object.assign(base, await describeSamsung(host));
  return base;
}

/**
 * Finds TVs on the local Wi-Fi: mDNS plus a port scan of the /24 subnet (works on both iOS and
 * Android without the multicast entitlement SSDP would need).
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

  const candidateProbes: Promise<void>[] = [];
  const probedCandidates = new Set<string>();
  const onCandidate = (host: string, name: string | null) => {
    if (probedCandidates.has(host)) return;
    probedCandidates.add(host);
    candidateProbes.push(
      probeHost(host, CANDIDATE_TIMEOUT_MS)
        .then((device) => {
          if (device) add(name ? { ...device, name } : device);
        })
        .catch(() => {}),
    );
  };

  const stopMdns = scanMdns(add, onCandidate);
  try {
    const ip = await Network.getIpAddressAsync();
    const hosts = subnetHosts(ip);
    const scanSubnet = async () => {
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
    };

    total = hosts.length;
    emit();
    await scanSubnet();
    if (!found.size && !shouldStop()) {
      // Nothing answered: on iPhone the first scan runs while the Local Network permission prompt
      // is still open, and sleepy Wi-Fi TVs can miss one round. One more round catches both.
      done = 0;
      emit();
      await scanSubnet();
    }
    // Give mDNS its full window even if the port scan was quick.
    while (Date.now() - started < MDNS_SCAN_MS && !shouldStop()) {
      await new Promise((r) => setTimeout(r, 300));
    }
    stopMdns();
    await Promise.all(candidateProbes);
  } finally {
    stopMdns();
  }
  return [...found.values()];
}
