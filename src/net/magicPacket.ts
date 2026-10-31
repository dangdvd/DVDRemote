import { hexToBytes } from '../core/bytes';

/** Wake-on-LAN magic packet: 6 x 0xFF followed by the MAC address repeated 16 times. */
export function buildMagicPacket(mac: string): Uint8Array {
  const clean = mac.replace(/[:-]/g, '');
  if (!/^[0-9a-f]{12}$/i.test(clean)) throw new Error(`Địa chỉ MAC không hợp lệ: ${mac}`);
  const macBytes = hexToBytes(clean);
  const packet = new Uint8Array(102);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) packet.set(macBytes, 6 + i * 6);
  return packet;
}
