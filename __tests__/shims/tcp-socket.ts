// Node implementation of the react-native-tcp-socket API surface we use, for integration tests.
import net from 'net';
import tls from 'tls';

function createConnection(opts: { host: string; port: number }, cb: () => void) {
  return net.connect({ host: opts.host, port: opts.port }, cb);
}

function connectTLS(opts: any, cb: () => void) {
  const socket: any = tls.connect(
    { host: opts.host, port: opts.port, rejectUnauthorized: false, cert: opts.cert, key: opts.key },
    cb,
  );
  const nodePeer = socket.getPeerCertificate.bind(socket);
  // Same shape as the native module: hex modulus and "0x"-prefixed exponent.
  socket.getPeerCertificate = async () => {
    const c = nodePeer();
    return c && c.modulus ? { modulus: c.modulus, exponent: c.exponent } : null;
  };
  return socket;
}

export default { createConnection, connectTLS };
