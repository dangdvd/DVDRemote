// Minimal protobuf wire-format encoder/decoder, enough for the Android TV Remote v2 protocol.
import { utf8Decode, utf8Encode } from './bytes';

const WIRE_VARINT = 0;
const WIRE_LEN = 2;

export function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let v = value;
  if (v < 0) {
    // int32 negatives are encoded as 10-byte two's complement. Not used by us, but keep it correct.
    v = v + 2 ** 64;
  }
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
  return out;
}

/** Returns [value, nextOffset] or null if the buffer ends mid-varint. */
export function decodeVarint(buf: Uint8Array, offset: number): [number, number] | null {
  let result = 0;
  let mul = 1;
  let i = offset;
  for (;;) {
    if (i >= buf.length) return null;
    const b = buf[i++];
    result += (b & 0x7f) * mul;
    if (b < 0x80) return [result, i];
    mul *= 0x80;
    if (i - offset > 10) throw new Error('Varint quá dài');
  }
}

export class ProtoWriter {
  private bytes: number[] = [];

  uint(field: number, value: number): this {
    this.bytes.push(...encodeVarint((field << 3) | WIRE_VARINT), ...encodeVarint(value));
    return this;
  }

  bool(field: number, value: boolean): this {
    return this.uint(field, value ? 1 : 0);
  }

  bytesField(field: number, value: Uint8Array): this {
    this.bytes.push(...encodeVarint((field << 3) | WIRE_LEN), ...encodeVarint(value.length));
    for (const b of value) this.bytes.push(b);
    return this;
  }

  string(field: number, value: string): this {
    return this.bytesField(field, utf8Encode(value));
  }

  message(field: number, msg: ProtoWriter): this {
    return this.bytesField(field, msg.finish());
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export type ProtoValue = number | Uint8Array;

/** Decoded message: field number -> list of raw values (repeated fields keep every value). */
export class ProtoMessage {
  constructor(readonly fields: Map<number, ProtoValue[]>) {}

  static decode(buf: Uint8Array): ProtoMessage {
    const fields = new Map<number, ProtoValue[]>();
    let i = 0;
    while (i < buf.length) {
      const key = decodeVarint(buf, i);
      if (!key) throw new Error('Thông điệp protobuf bị cắt');
      i = key[1];
      const field = Math.floor(key[0] / 8);
      const wire = key[0] & 7;
      let value: ProtoValue;
      if (wire === WIRE_VARINT) {
        const v = decodeVarint(buf, i);
        if (!v) throw new Error('Thông điệp protobuf bị cắt');
        value = v[0];
        i = v[1];
      } else if (wire === WIRE_LEN) {
        const len = decodeVarint(buf, i);
        if (!len) throw new Error('Thông điệp protobuf bị cắt');
        i = len[1];
        value = buf.subarray(i, i + len[0]);
        i += len[0];
      } else if (wire === 5) {
        value = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24);
        i += 4;
      } else if (wire === 1) {
        value = 0; // fixed64 is not used by these protocols; skip it.
        i += 8;
      } else {
        throw new Error(`Kiểu wire không hỗ trợ: ${wire}`);
      }
      const list = fields.get(field);
      if (list) list.push(value);
      else fields.set(field, [value]);
    }
    return new ProtoMessage(fields);
  }

  has(field: number): boolean {
    return this.fields.has(field);
  }

  uint(field: number, fallback = 0): number {
    const v = this.fields.get(field)?.[0];
    return typeof v === 'number' ? v : fallback;
  }

  bytes(field: number): Uint8Array | undefined {
    const v = this.fields.get(field)?.[0];
    return v instanceof Uint8Array ? v : undefined;
  }

  string(field: number): string {
    const v = this.bytes(field);
    return v ? utf8Decode(v) : '';
  }

  message(field: number): ProtoMessage | undefined {
    const v = this.bytes(field);
    return v ? ProtoMessage.decode(v) : undefined;
  }
}

/** Prefix a message with its varint length, as both Android TV sockets expect. */
export function frameDelimited(payload: Uint8Array): Uint8Array {
  const len = encodeVarint(payload.length);
  const out = new Uint8Array(len.length + payload.length);
  out.set(len, 0);
  out.set(payload, len.length);
  return out;
}

/** Accumulates stream bytes and yields complete length-delimited messages. */
export class DelimitedReader {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
    const out: Uint8Array[] = [];
    for (;;) {
      const len = decodeVarint(this.buffer, 0);
      if (!len) break;
      const end = len[1] + len[0];
      if (this.buffer.length < end) break;
      out.push(this.buffer.slice(len[1], end));
      this.buffer = this.buffer.slice(end);
    }
    return out;
  }
}
