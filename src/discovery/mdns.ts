/**
 * mDNS service types that point at TVs. Only Android TV advertises its remote service; the
 * others tell us where a TV is, and a port probe then says which protocol it speaks.
 * LG webOS (2018+) advertises AirPlay; most Android TVs and some others advertise Chromecast.
 */
export const MDNS_REMOTE_TYPE = 'androidtvremote2';
export const MDNS_CANDIDATE_TYPES = ['airplay', 'googlecast'] as const;

export interface MdnsServiceLike {
  name?: string;
  addresses?: string[];
  ipv4?: string[];
  txt?: Record<string, string>;
}

/** The IPv4 address of a resolved service, if any. */
export function serviceHost(service: MdnsServiceLike): string | null {
  return service.ipv4?.[0] ?? service.addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) ?? null;
}

/** The name people see on the TV, from a resolved service. */
export function serviceName(type: string, service: MdnsServiceLike): string | null {
  // Chromecast service names are ids like "Chromecast-1a2b..."; the friendly name is in TXT "fn".
  const name = type === 'googlecast' ? service.txt?.fn || service.name : service.name;
  // LG names its AirPlay service "[LG] webOS TV OLED55C1"; keep the model, drop the tag.
  const clean = name?.replace(/^\[LG\]\s*/i, '').trim();
  return clean || null;
}
