import { Buffer } from 'buffer';
import dgram from 'react-native-udp';
import { buildMagicPacket } from './magicPacket';

/** Sends Wake-on-LAN packets so TVs in standby (LG, Samsung, some Android TVs) turn on. */
export function wakeOnLan(mac: string, host?: string): Promise<void> {
  const packet = Buffer.from(buildMagicPacket(mac));
  const targets = ['255.255.255.255'];
  if (host) {
    const parts = host.split('.');
    if (parts.length === 4) targets.push(`${parts[0]}.${parts[1]}.${parts[2]}.255`, host);
  }
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4' });
    socket.once('error', (err: Error) => {
      socket.close();
      reject(err);
    });
    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        // Some platforms do not need/allow this; sending may still work.
      }
      let pending = targets.length * 2;
      const done = () => {
        if (--pending === 0) {
          socket.close();
          resolve();
        }
      };
      for (const target of targets) {
        for (const port of [9, 7]) socket.send(packet, 0, packet.length, port, target, done);
      }
    });
  });
}
