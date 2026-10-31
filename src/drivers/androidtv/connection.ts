import { DelimitedReader, frameDelimited, ProtoMessage } from '../../core/protobuf';
import { RawSocket } from '../../net/tcp';
import type { ClientIdentity } from './cert';

/** TLS socket with the client certificate, exchanging varint-delimited protobuf messages. */
export class ProtoConnection {
  onMessage: (msg: ProtoMessage) => void = () => {};
  onClose: (error?: Error) => void = () => {};
  private reader = new DelimitedReader();

  private constructor(readonly socket: RawSocket) {
    socket.onData = (chunk) => {
      for (const raw of this.reader.push(chunk)) {
        let msg: ProtoMessage;
        try {
          msg = ProtoMessage.decode(raw);
        } catch {
          continue; // Ignore messages we cannot parse instead of dropping the connection.
        }
        this.onMessage(msg);
      }
    };
    socket.onClose = (err) => this.onClose(err);
  }

  static async open(host: string, port: number, identity: ClientIdentity): Promise<ProtoConnection> {
    const socket = await RawSocket.open({
      host,
      port,
      tls: true,
      cert: identity.certPem,
      key: identity.keyPem,
      certAlias: 'dvdremote-atv-cert',
      keyAlias: 'dvdremote-atv-key',
      timeoutMs: 6000,
    });
    return new ProtoConnection(socket);
  }

  send(payload: Uint8Array): void {
    this.socket.write(frameDelimited(payload));
  }

  close(): void {
    this.socket.close();
  }
}
