import crypto from 'crypto';
import { base64Encode, hexToBytes, utf8Decode, utf8Encode } from '../src/core/bytes';
import { DelimitedReader, encodeVarint, frameDelimited, ProtoMessage, ProtoWriter } from '../src/core/protobuf';
import { classifyPorts, isValidIPv4, subnetHosts } from '../src/discovery/classify';
import {
  pairingConfiguration,
  pairingOptions,
  pairingRequest,
  remoteAppLink,
  remoteKeyInject,
  remotePingResponse,
} from '../src/drivers/androidtv/messages';
import { computePairingSecret } from '../src/drivers/androidtv/secret';
import { buildMagicPacket } from '../src/net/magicPacket';
import { encodeFrame, FrameParser, MessageAssembler, OP_TEXT, parseWsUrl } from '../src/net/wsframes';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('bytes', () => {
  it('encodes UTF-8 like Node, including Vietnamese and emoji', () => {
    const text = 'Xin chào Việt Nam 📺 ạ';
    expect(Buffer.from(utf8Encode(text))).toEqual(Buffer.from(text, 'utf8'));
    expect(utf8Decode(Buffer.from(text, 'utf8'))).toBe(text);
  });

  it('base64 matches Node', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'DVD Remote', 'Tiếng Việt']) {
      expect(base64Encode(utf8Encode(s))).toBe(Buffer.from(s, 'utf8').toString('base64'));
    }
  });

  it('pads odd hex', () => {
    expect(Array.from(hexToBytes('0x10001'))).toEqual([1, 0, 1]);
  });
});

describe('protobuf', () => {
  it('encodes varints', () => {
    expect(encodeVarint(1)).toEqual([1]);
    expect(encodeVarint(300)).toEqual([0xac, 0x02]);
    expect(encodeVarint(622)).toEqual([0xee, 0x04]);
  });

  it('round-trips nested messages', () => {
    const buf = new ProtoWriter()
      .uint(1, 622)
      .message(2, new ProtoWriter().string(1, 'model').string(2, 'Sony'))
      .bytesField(3, Uint8Array.from([1, 2, 3]))
      .finish();
    const msg = ProtoMessage.decode(buf);
    expect(msg.uint(1)).toBe(622);
    expect(msg.message(2)?.string(2)).toBe('Sony');
    expect(Array.from(msg.bytes(3)!)).toEqual([1, 2, 3]);
  });

  it('reassembles length-delimited messages split across chunks', () => {
    const a = frameDelimited(new Uint8Array(200).fill(7));
    const b = frameDelimited(Uint8Array.from([1, 2]));
    const stream = Buffer.concat([a, b]);
    const reader = new DelimitedReader();
    const out = [...reader.push(stream.subarray(0, 1)), ...reader.push(stream.subarray(1, 150)), ...reader.push(stream.subarray(150))];
    expect(out.map((m) => m.length)).toEqual([200, 2]);
  });
});

describe('Android TV messages (byte-exact vs. protobuf wire format)', () => {
  it('key inject: RemoteMessage{remote_key_inject(10){key_code=26, direction=SHORT}}', () => {
    expect(hex(remoteKeyInject(26))).toBe('5204081a1003');
  });

  it('ping response', () => {
    expect(hex(remotePingResponse(5))).toBe('4a020805');
  });

  it('app link', () => {
    expect(hex(remoteAppLink('ab'))).toBe('d20504' + '0a026162');
  });

  it('pairing request carries protocol 2, status 200, service + client name', () => {
    // 08 02 | 10 c8 01 | 52 len { 0a 09 "atvremote" 12 01 "x" }
    expect(hex(pairingRequest('x'))).toBe('080210c801520e0a0961747672656d6f74651201' + '78');
  });

  it('options and configuration ask for 6 hex digits as input role', () => {
    expect(hex(pairingOptions())).toBe('080210c801a201080a04080310061801');
    expect(hex(pairingConfiguration())).toBe('080210c801f201080a04080310061001');
  });
});

describe('pairing secret', () => {
  // Independent reference implementation following androidtvremote2 (Python).
  function reference(cm: string, ce: number, sm: string, se: number, suffix: string) {
    const h = crypto.createHash('sha256');
    h.update(Buffer.from(cm, 'hex'));
    h.update(Buffer.from('0' + ce.toString(16), 'hex'));
    h.update(Buffer.from(sm, 'hex'));
    h.update(Buffer.from('0' + se.toString(16), 'hex'));
    h.update(Buffer.from(suffix, 'hex'));
    return h.digest();
  }

  const clientMod = crypto.randomBytes(256).toString('hex').replace(/^./, 'C');
  const serverMod = crypto.randomBytes(256).toString('hex').replace(/^./, 'D');

  it('matches the reference and validates the check byte', () => {
    const expected = reference(clientMod, 0x10001, serverMod, 0x10001, '1a2b');
    const code = expected[0].toString(16).padStart(2, '0') + '1A2B';
    const secret = computePairingSecret(
      { modulus: clientMod, exponent: '10001' },
      { modulus: serverMod.toUpperCase(), exponent: '0x10001' },
      code.toLowerCase(),
    );
    expect(Buffer.from(secret)).toEqual(expected);
  });

  it('rejects a mistyped code', () => {
    const expected = reference(clientMod, 0x10001, serverMod, 0x10001, '1a2b');
    const wrong = ((expected[0] + 1) % 256).toString(16).padStart(2, '0') + '1A2B';
    expect(() =>
      computePairingSecret({ modulus: clientMod, exponent: '10001' }, { modulus: serverMod, exponent: '10001' }, wrong),
    ).toThrow();
    expect(() =>
      computePairingSecret({ modulus: clientMod, exponent: '10001' }, { modulus: serverMod, exponent: '10001' }, '12345'),
    ).toThrow();
  });
});

describe('WebSocket framing', () => {
  it('masks client frames', () => {
    const frame = encodeFrame(OP_TEXT, utf8Encode('Hi'), Uint8Array.from([1, 2, 3, 4]));
    expect(hex(frame)).toBe('8182' + '01020304' + (0x48 ^ 1).toString(16) + (0x69 ^ 2).toString(16));
  });

  it('parses unmasked server frames, extended lengths and fragments', () => {
    const big = Buffer.alloc(300, 0x61);
    const f1 = Buffer.concat([Buffer.from([0x01, 0x7e, 0x01, 0x2c]), big]); // text, not final, len 300
    const f2 = Buffer.concat([Buffer.from([0x80, 0x02]), Buffer.from('ok')]); // continuation, final
    const parser = new FrameParser();
    const asm = new MessageAssembler();
    const frames = [...parser.push(f1.subarray(0, 10)), ...parser.push(Buffer.concat([f1.subarray(10), f2]))];
    expect(frames).toHaveLength(2);
    expect(asm.add(frames[0])).toBeNull();
    const msg = asm.add(frames[1])!;
    expect(utf8Decode(msg.data)).toBe('a'.repeat(300) + 'ok');
  });

  it('parses URLs', () => {
    expect(parseWsUrl('wss://192.168.1.5:3001/resources/x/netinput.pointer.sock')).toEqual({
      secure: true,
      host: '192.168.1.5',
      port: 3001,
      path: '/resources/x/netinput.pointer.sock',
    });
  });
});

describe('discovery helpers', () => {
  it('classifies by open ports', () => {
    expect(classifyPorts(new Set([6466, 8008]))).toBe('androidtv');
    expect(classifyPorts(new Set([3001]))).toBe('webos');
    expect(classifyPorts(new Set([8002]))).toBe('tizen');
    expect(classifyPorts(new Set([6095]))).toBe('xiaomi-legacy');
    expect(classifyPorts(new Set([80]))).toBeNull();
  });

  it('lists the /24 subnet without our own address', () => {
    const hosts = subnetHosts('192.168.1.42');
    expect(hosts).toHaveLength(253);
    expect(hosts).not.toContain('192.168.1.42');
    expect(() => subnetHosts('0.0.0.0')).toThrow();
    expect(isValidIPv4('10.0.0.255')).toBe(true);
    expect(isValidIPv4('10.0.0.256')).toBe(false);
  });

  it('builds Wake-on-LAN magic packets', () => {
    const p = buildMagicPacket('A1:B2:C3:D4:E5:F6');
    expect(p).toHaveLength(102);
    expect(hex(p.subarray(0, 12))).toBe('ffffffffffffa1b2c3d4e5f6');
    expect(hex(p.subarray(96))).toBe('a1b2c3d4e5f6');
  });
});
