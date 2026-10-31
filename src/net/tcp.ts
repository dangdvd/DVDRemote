import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';

export interface PeerCertificate {
  modulus: string;
  exponent: string;
}

export interface OpenOptions {
  host: string;
  port: number;
  tls?: boolean;
  /** Client certificate / key in PEM (Android TV). */
  cert?: string;
  key?: string;
  certAlias?: string;
  keyAlias?: string;
  timeoutMs?: number;
}

/** Thin promise based wrapper around react-native-tcp-socket (plain TCP or TLS). */
export class RawSocket {
  onData: (chunk: Uint8Array) => void = () => {};
  onClose: (error?: Error) => void = () => {};
  private closed = false;

  private constructor(private readonly socket: any) {
    socket.on('data', (data: Buffer | string) => {
      const chunk = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      this.onData(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length));
    });
    socket.on('error', (err: Error) => this.finish(err));
    socket.on('close', () => this.finish());
  }

  static open(opts: OpenOptions): Promise<RawSocket> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const base = { host: opts.host, port: opts.port, connectTimeout: opts.timeoutMs ?? 5000 };
      const onReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeListener('error', onError);
        resolve(new RawSocket(socket));
      };
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(err);
      };
      const socket: any = opts.tls
        ? TcpSocket.connectTLS(
            {
              ...base,
              // TVs use self-signed certificates, so trust is established by pairing instead.
              rejectUnauthorized: false,
              ...(opts.cert && opts.key
                ? { cert: opts.cert, key: opts.key, certAlias: opts.certAlias, keyAlias: opts.keyAlias }
                : {}),
            } as any,
            onReady,
          )
        : TcpSocket.createConnection(base, onReady);
      socket.once('error', onError);
      const timer = setTimeout(
        () => onError(new Error(`Hết thời gian kết nối ${opts.host}:${opts.port}`)),
        (opts.timeoutMs ?? 5000) + 1000,
      );
    });
  }

  /** Quick reachability check used by the network scanner. */
  static probe(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(ok);
      };
      const socket = TcpSocket.createConnection({ host, port, connectTimeout: timeoutMs }, () => finish(true));
      socket.on('error', () => finish(false));
      const timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  write(data: Uint8Array | string): void {
    if (this.closed) throw new Error('Kết nối đã đóng');
    this.socket.write(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  }

  async peerCertificate(): Promise<PeerCertificate | null> {
    if (typeof this.socket.getPeerCertificate !== 'function') return null;
    return this.socket.getPeerCertificate();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
  }

  private finish(err?: Error) {
    if (this.closed && !err) return;
    const wasClosed = this.closed;
    this.closed = true;
    if (!wasClosed) this.onClose(err);
  }
}
