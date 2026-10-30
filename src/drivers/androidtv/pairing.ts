import type { ProtoMessage } from '../../core/protobuf';
import type { ClientIdentity } from './cert';
import { ProtoConnection } from './connection';
import {
  Pairing,
  PAIRING_PORT,
  pairingConfiguration,
  pairingOptions,
  pairingRequest,
  pairingSecret,
  pairingStatusOk,
} from './messages';
import { computePairingSecret } from './secret';

const STEP_TIMEOUT_MS = 10000;

/**
 * Pairing on port 6467: request -> options -> configuration. The TV then shows a 6 digit
 * hex code which the user types on the phone; we answer with the derived secret.
 */
export async function pairAndroidTv(
  host: string,
  identity: ClientIdentity,
  clientName: string,
  askCode: (retry: boolean) => Promise<string | null>,
): Promise<boolean> {
  const conn = await ProtoConnection.open(host, PAIRING_PORT, identity);
  const queue: ProtoMessage[] = [];
  let waiter: ((msg: ProtoMessage | Error) => void) | null = null;
  let closedError: Error | null = null;

  conn.onMessage = (msg) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(msg);
    } else queue.push(msg);
  };
  conn.onClose = (err) => {
    closedError = err ?? new Error('TV đã đóng kết nối ghép nối');
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(closedError);
    }
  };

  const next = (expectedField: number): Promise<ProtoMessage> =>
    new Promise((resolve, reject) => {
      const handle = (msg: ProtoMessage | Error) => {
        clearTimeout(timer);
        if (msg instanceof Error) return reject(msg);
        if (!pairingStatusOk(msg)) {
          return reject(new Error(`TV trả lỗi ghép nối (mã ${msg.uint(Pairing.STATUS)})`));
        }
        if (!msg.has(expectedField)) return reject(new Error('Phản hồi ghép nối không mong đợi'));
        resolve(msg);
      };
      const timer = setTimeout(() => {
        waiter = null;
        reject(new Error('TV không phản hồi khi ghép nối'));
      }, STEP_TIMEOUT_MS);
      const queued = queue.shift();
      if (queued) handle(queued);
      else if (closedError) handle(closedError);
      else waiter = handle;
    });

  try {
    conn.send(pairingRequest(clientName));
    await next(Pairing.PAIRING_REQUEST_ACK);
    conn.send(pairingOptions());
    await next(Pairing.OPTIONS);
    conn.send(pairingConfiguration());
    await next(Pairing.CONFIGURATION_ACK);

    const server = await conn.socket.peerCertificate();
    if (!server?.modulus || !server.exponent) {
      throw new Error('Không đọc được chứng chỉ của TV');
    }

    // Let the user retry typos locally: the hash check catches wrong codes before sending.
    let retry = false;
    for (;;) {
      const code = await askCode(retry);
      if (code === null) return false;
      try {
        const secret = computePairingSecret(identity.publicNumbers, server, code);
        conn.send(pairingSecret(secret));
        break;
      } catch (err) {
        retry = true;
        if (conn.socket.isClosed) throw err;
      }
    }
    await next(Pairing.SECRET_ACK);
    return true;
  } finally {
    conn.close();
  }
}
