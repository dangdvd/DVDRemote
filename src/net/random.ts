import * as Crypto from 'expo-crypto';

/** Cryptographically secure random bytes from the OS. */
export function randomBytes(length: number): Uint8Array {
  return Crypto.getRandomBytes(length);
}
