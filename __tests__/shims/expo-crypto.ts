import crypto from 'crypto';

export function getRandomBytes(n: number): Uint8Array {
  return new Uint8Array(crypto.randomBytes(n));
}
