import QuickCrypto from 'react-native-quick-crypto';

/**
 * Generates an RSA key pair natively (OpenSSL via react-native-quick-crypto). Pure JS
 * generation takes from 30 seconds to several minutes on a phone, native takes well under one.
 * Returns the private key as PKCS#1 PEM.
 */
export function generateRsaPrivateKeyPem(bits: number): Promise<string> {
  return new Promise((resolve, reject) => {
    QuickCrypto.generateKeyPair(
      'rsa',
      {
        modulusLength: bits,
        publicExponent: 0x10001,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      },
      (err, _pub, priv) => {
        if (err || typeof priv !== 'string') reject(err ?? new Error('Không tạo được khoá RSA'));
        else resolve(priv);
      },
    );
  });
}
