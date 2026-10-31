// Fake TVs speaking the real protocols, used to exercise the drivers end-to-end in Node.
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import forge from 'node-forge';
import tls from 'tls';
import { WebSocketServer } from 'ws';
import { DelimitedReader, frameDelimited, ProtoMessage, ProtoWriter } from '../src/core/protobuf';

export function selfSignedCert(cn: string): { key: string; cert: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048); // native in Node, fast
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 365);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: cn }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) };
}

function hexBuf(h: string) {
  const clean = h.replace(/^0x/i, '');
  return Buffer.from(clean.length % 2 ? '0' + clean : clean, 'hex');
}

/** Android TV Remote Service v2 (pairing on 6467, remote on 6466). */
export class FakeAndroidTv {
  displayedCode = '';
  readonly paired = new Set<string>();
  readonly keys: number[] = [];
  readonly appLinks: string[] = [];
  readonly texts: string[] = [];
  private servers: tls.Server[] = [];
  private tlsCreds = selfSignedCert('fake-android-tv');
  private serverPub = crypto.createPublicKey(this.tlsCreds.cert).export({ format: 'jwk' }) as any;

  async start() {
    const opts = { ...this.tlsCreds, requestCert: true, rejectUnauthorized: false };
    const pairing = tls.createServer(opts, (s) => this.handlePairing(s));
    const remote = tls.createServer(opts, (s) => this.handleRemote(s));
    await Promise.all([listen(pairing, 6467), listen(remote, 6466)]);
    this.servers = [pairing, remote];
  }

  stop() {
    this.servers.forEach((s) => s.close());
  }

  private outer(field: number, body: ProtoWriter, status = 200) {
    return frameDelimited(new ProtoWriter().uint(1, 2).uint(2, status).message(field, body).finish());
  }

  private handlePairing(socket: tls.TLSSocket) {
    const reader = new DelimitedReader();
    socket.on('error', () => {});
    socket.on('data', (chunk: Buffer) => {
      for (const raw of reader.push(chunk)) {
        const msg = ProtoMessage.decode(raw);
        if (msg.has(10)) socket.write(this.outer(11, new ProtoWriter().string(1, 'BRAVIA')));
        else if (msg.has(20)) socket.write(this.outer(20, new ProtoWriter().uint(3, 1)));
        else if (msg.has(30)) {
          const peer = socket.getPeerCertificate() as { modulus: string; exponent: string };
          const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
          const hash = this.expectedHash(peer.modulus, peer.exponent, suffix);
          this.displayedCode = hash[0].toString(16).padStart(2, '0').toUpperCase() + suffix;
          socket.write(this.outer(31, new ProtoWriter()));
        } else if (msg.has(40)) {
          const peer = socket.getPeerCertificate() as { modulus: string; exponent: string };
          const secret = Buffer.from(msg.message(40)!.bytes(1)!);
          const expected = this.expectedHash(peer.modulus, peer.exponent, this.displayedCode.slice(2));
          if (secret.equals(expected)) {
            this.paired.add(peer.modulus.toUpperCase());
            socket.write(this.outer(41, new ProtoWriter().bytesField(1, secret)));
          } else {
            socket.write(this.outer(41, new ProtoWriter(), 402));
          }
        }
      }
    });
  }

  private expectedHash(clientMod: string, clientExp: string, suffix: string) {
    const serverMod = Buffer.from(this.serverPub.n, 'base64url');
    const serverExp = Buffer.from(this.serverPub.e, 'base64url');
    const h = crypto.createHash('sha256');
    h.update(hexBuf(clientMod));
    h.update(hexBuf(clientExp));
    h.update(serverMod);
    h.update(serverExp);
    h.update(Buffer.from(suffix, 'hex'));
    return h.digest();
  }

  private handleRemote(socket: tls.TLSSocket) {
    socket.on('error', () => {});
    const peer = socket.getPeerCertificate();
    if (!peer?.modulus || !this.paired.has(peer.modulus.toUpperCase())) {
      socket.destroy(); // Unknown client certificate, like a real TV.
      return;
    }
    const send = (w: ProtoWriter) => socket.write(frameDelimited(w.finish()));
    const reader = new DelimitedReader();
    socket.on('data', (chunk: Buffer) => {
      for (const raw of reader.push(chunk)) {
        const msg = ProtoMessage.decode(raw);
        if (msg.has(1)) send(new ProtoWriter().message(2, new ProtoWriter().uint(1, 622)));
        else if (msg.has(2)) send(new ProtoWriter().message(8, new ProtoWriter().uint(1, 7).uint(2, 1)));
        else if (msg.has(9) && msg.message(9)!.uint(1) === 7) {
          send(new ProtoWriter().message(40, new ProtoWriter().bool(1, true)));
        } else if (msg.has(10)) this.keys.push(msg.message(10)!.uint(1));
        else if (msg.has(90)) this.appLinks.push(msg.message(90)!.string(1));
        else if (msg.has(21)) this.texts.push(msg.message(21)!.message(3)!.message(2)!.string(3));
      }
    });
    const info = new ProtoWriter().string(1, 'BRAVIA 4K').string(2, 'Sony');
    send(new ProtoWriter().message(1, new ProtoWriter().uint(1, 622).message(2, info)));
  }
}

/** LG webOS SSAP over wss:3001 with a pointer input socket. */
export class FakeLgTv {
  readonly calls: string[] = [];
  readonly buttons: string[] = [];
  registrations = 0;
  private server?: https.Server;
  private wss?: WebSocketServer;

  async start() {
    this.server = https.createServer(selfSignedCert('fake-lg'));
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws, req) => {
      if (req.url?.includes('netinput.pointer.sock')) {
        ws.on('message', (data) => {
          const m = /name:(\w+)/.exec(data.toString());
          if (m) this.buttons.push(m[1]);
        });
        return;
      }
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const reply = (o: object) => ws.send(JSON.stringify({ id: msg.id, ...o }));
        if (msg.type === 'register') {
          this.registrations++;
          if (msg.payload['client-key'] === 'KEY123') {
            reply({ type: 'registered', payload: { 'client-key': 'KEY123' } });
          } else {
            reply({ type: 'response', payload: { pairingType: 'PROMPT', returnValue: true } });
            setTimeout(() => reply({ type: 'registered', payload: { 'client-key': 'KEY123' } }), 50);
          }
          return;
        }
        this.calls.push(msg.uri);
        if (msg.uri.endsWith('connectionmanager/getinfo')) {
          reply({ type: 'response', payload: { returnValue: true, wiredInfo: { macAddress: 'aa:bb:cc:dd:ee:ff' } } });
        } else if (msg.uri.endsWith('getPointerInputSocket')) {
          reply({
            type: 'response',
            payload: { returnValue: true, socketPath: 'wss://127.0.0.1:3001/resources/x/netinput.pointer.sock' },
          });
        } else {
          reply({ type: 'response', payload: { returnValue: true } });
        }
      });
    });
    await listen(this.server, 3001);
  }

  stop() {
    this.wss?.clients.forEach((c) => c.terminate());
    this.wss?.close();
    this.server?.close();
  }
}

/** Samsung Tizen 2016-2017 style: plain ws on 8001, no TLS port. */
export class FakeSamsungTv {
  readonly messages: any[] = [];
  private server?: http.Server;
  private wss?: WebSocketServer;

  async start() {
    this.server = http.createServer();
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws, req) => {
      if (!req.url?.startsWith('/api/v2/channels/samsung.remote.control?name=')) return ws.close();
      ws.on('message', (data) => this.messages.push(JSON.parse(data.toString())));
      ws.send(JSON.stringify({ event: 'ms.channel.connect', data: { token: '55667788' } }));
    });
    await listen(this.server, 8001);
  }

  stop() {
    this.wss?.clients.forEach((c) => c.terminate());
    this.wss?.close();
    this.server?.close();
  }
}

function listen(server: { listen: (port: number, host: string, cb: () => void) => void }, port: number) {
  return new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
}
