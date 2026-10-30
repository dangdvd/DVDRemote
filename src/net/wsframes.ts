// RFC 6455 framing, kept free of React Native imports so it can be unit tested.

export const OP_CONT = 0x0;
export const OP_TEXT = 0x1;
export const OP_BINARY = 0x2;
export const OP_CLOSE = 0x8;
export const OP_PING = 0x9;
export const OP_PONG = 0xa;

export interface Frame {
  fin: boolean;
  opcode: number;
  payload: Uint8Array;
}

/** Build a client frame. Clients must always mask their payload. */
export function encodeFrame(opcode: number, payload: Uint8Array, mask: Uint8Array): Uint8Array {
  const len = payload.length;
  const headerLen = len < 126 ? 2 : len < 65536 ? 4 : 10;
  const out = new Uint8Array(headerLen + 4 + len);
  out[0] = 0x80 | opcode;
  if (len < 126) {
    out[1] = 0x80 | len;
  } else if (len < 65536) {
    out[1] = 0x80 | 126;
    out[2] = len >> 8;
    out[3] = len & 0xff;
  } else {
    out[1] = 0x80 | 127;
    let v = len;
    for (let i = 9; i >= 2; i--) {
      out[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
  }
  out.set(mask.subarray(0, 4), headerLen);
  for (let i = 0; i < len; i++) out[headerLen + 4 + i] = payload[i] ^ mask[i % 4];
  return out;
}

/** Incremental frame parser for server -> client data. */
export class FrameParser {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): Frame[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const frames: Frame[] = [];
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) break;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (b.length < 4) break;
        len = (b[2] << 8) | b[3];
        offset = 4;
      } else if (len === 127) {
        if (b.length < 10) break;
        len = 0;
        for (let i = 2; i < 10; i++) len = len * 256 + b[i];
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (b.length < offset + maskLen + len) break;
      let payload = b.slice(offset + maskLen, offset + maskLen + len);
      if (masked) {
        const mask = b.subarray(offset, offset + 4);
        payload = payload.map((v, i) => v ^ mask[i % 4]);
      }
      frames.push({ fin, opcode, payload });
      this.buffer = b.slice(offset + maskLen + len);
    }
    return frames;
  }
}

/** Joins fragmented messages (text/binary + continuation frames). */
export class MessageAssembler {
  private parts: Uint8Array[] = [];
  private opcode = 0;

  /** Returns a complete message when the final fragment arrives. */
  add(frame: Frame): { opcode: number; data: Uint8Array } | null {
    if (frame.opcode !== OP_CONT) {
      this.opcode = frame.opcode;
      this.parts = [];
    }
    this.parts.push(frame.payload);
    if (!frame.fin) return null;
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const data = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts) {
      data.set(p, o);
      o += p.length;
    }
    this.parts = [];
    return { opcode: this.opcode, data };
  }
}

export function parseWsUrl(url: string): { secure: boolean; host: string; port: number; path: string } {
  const m = /^(wss?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/i.exec(url.trim());
  if (!m) throw new Error(`URL WebSocket không hợp lệ: ${url}`);
  const secure = m[1].toLowerCase() === 'wss';
  return {
    secure,
    host: m[2],
    port: m[3] ? parseInt(m[3], 10) : secure ? 443 : 80,
    path: m[4] || '/',
  };
}
