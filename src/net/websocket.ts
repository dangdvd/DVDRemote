import { base64Encode, concatBytes, utf8Decode, utf8Encode } from '../core/bytes';
import { randomBytes } from './random';
import { RawSocket } from './tcp';
import {
  encodeFrame,
  FrameParser,
  MessageAssembler,
  OP_BINARY,
  OP_CLOSE,
  OP_PING,
  OP_PONG,
  OP_TEXT,
  parseWsUrl,
} from './wsframes';

/**
 * Small WebSocket client on top of a raw TCP/TLS socket.
 *
 * React Native's built-in WebSocket refuses the self-signed certificates that LG (wss:3001)
 * and Samsung (wss:8002) TVs use, so we speak the protocol ourselves.
 */
export class MiniWebSocket {
  onClose: (error?: Error) => void = () => {};
  private handler: ((text: string) => void) | null = null;
  /** Messages that arrived before a handler was attached (TVs often greet right after the upgrade). */
  private backlog: string[] = [];
  private parser = new FrameParser();
  private assembler = new MessageAssembler();
  private closed = false;

  private constructor(private readonly socket: RawSocket) {}

  static async connect(url: string, timeoutMs = 6000): Promise<MiniWebSocket> {
    const { secure, host, port, path } = parseWsUrl(url);
    const socket = await RawSocket.open({ host, port, tls: secure, timeoutMs });
    const ws = new MiniWebSocket(socket);
    await ws.handshake(host, port, path, timeoutMs);
    return ws;
  }

  private handshake(host: string, port: number, path: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let header: Uint8Array = new Uint8Array(0);
      const timer = setTimeout(() => {
        this.socket.close();
        reject(new Error('Hết thời gian bắt tay WebSocket'));
      }, timeoutMs);

      this.socket.onClose = (err) => {
        clearTimeout(timer);
        reject(err ?? new Error('TV đã đóng kết nối'));
      };
      this.socket.onData = (chunk) => {
        header = concatBytes(header, chunk);
        const text = utf8Decode(header);
        const end = text.indexOf('\r\n\r\n');
        if (end < 0) return;
        clearTimeout(timer);
        const statusLine = text.slice(0, text.indexOf('\r\n'));
        if (!/^HTTP\/1\.1 101/.test(statusLine)) {
          this.socket.close();
          reject(new Error(`TV từ chối WebSocket: ${statusLine}`));
          return;
        }
        // The HTTP header is ASCII, so its char index equals its byte index. Anything after it
        // already belongs to the frame stream.
        const rest = header.slice(end + 4);
        this.socket.onData = (c) => this.handleData(c);
        this.socket.onClose = (err) => this.handleClose(err);
        if (rest.length) this.handleData(rest);
        resolve();
      };

      const key = base64Encode(randomBytes(16));
      this.socket.write(
        `GET ${path} HTTP/1.1\r\n` +
          `Host: ${host}:${port}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      );
    });
  }

  set onMessage(handler: (text: string) => void) {
    this.handler = handler;
    const queued = this.backlog;
    this.backlog = [];
    queued.forEach((m) => handler(m));
  }

  send(text: string): void {
    this.sendFrame(OP_TEXT, utf8Encode(text));
  }

  close(): void {
    if (this.closed) return;
    try {
      this.sendFrame(OP_CLOSE, Uint8Array.from([0x03, 0xe8]));
    } catch {
      // Socket already gone.
    }
    this.closed = true;
    this.socket.close();
  }

  get isOpen(): boolean {
    return !this.closed && !this.socket.isClosed;
  }

  private sendFrame(opcode: number, payload: Uint8Array) {
    this.socket.write(encodeFrame(opcode, payload, randomBytes(4)));
  }

  private handleData(chunk: Uint8Array) {
    for (const frame of this.parser.push(chunk)) {
      if (frame.opcode === OP_PING) {
        this.sendFrame(OP_PONG, frame.payload);
        continue;
      }
      if (frame.opcode === OP_PONG) continue;
      if (frame.opcode === OP_CLOSE) {
        this.handleClose();
        this.socket.close();
        return;
      }
      const msg = this.assembler.add(frame);
      if (msg && (msg.opcode === OP_TEXT || msg.opcode === OP_BINARY)) {
        const text = utf8Decode(msg.data);
        if (this.handler) this.handler(text);
        else this.backlog.push(text);
      }
    }
  }

  private handleClose(err?: Error) {
    if (this.closed) return;
    this.closed = true;
    this.onClose(err);
  }
}
