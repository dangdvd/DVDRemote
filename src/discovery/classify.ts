import type { DeviceKind } from '../core/types';

/** Ports that identify each TV platform. */
export const PROBE_PORTS = [6466, 3000, 3001, 8001, 8002, 6095];

export function classifyPorts(open: Set<number>): DeviceKind | null {
  // Android TV first: a Google TV may also expose other services.
  if (open.has(6466)) return 'androidtv';
  if (open.has(3000) || open.has(3001)) return 'webos';
  if (open.has(8001) || open.has(8002)) return 'tizen';
  if (open.has(6095)) return 'xiaomi-legacy';
  return null;
}

/** All host addresses of the phone's /24 network, excluding the phone itself. */
export function subnetHosts(ip: string): string[] {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m || ip === '0.0.0.0') {
    throw new Error('Không xác định được mạng Wi-Fi. Hãy kết nối điện thoại cùng Wi-Fi với TV.');
  }
  const prefix = `${m[1]}.${m[2]}.${m[3]}.`;
  const hosts: string[] = [];
  for (let i = 1; i < 255; i++) {
    if (i !== Number(m[4])) hosts.push(prefix + i);
  }
  return hosts;
}

export function isValidIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  return !!m && m.slice(1).every((p) => Number(p) <= 255);
}
