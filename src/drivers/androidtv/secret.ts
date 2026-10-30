import forge from 'node-forge';
import { binaryToBytes, bytesToBinary, hexToBytes } from '../../core/bytes';

export interface RsaPublicNumbers {
  /** Hex strings, with or without 0x prefix. */
  modulus: string;
  exponent: string;
}

/**
 * Pairing secret = SHA-256(client modulus, client exponent, server modulus, server exponent,
 * last 4 hex digits of the code). The first byte of the hash must equal the first 2 hex digits
 * of the code, which lets us reject typos before talking to the TV.
 */
export function computePairingSecret(
  client: RsaPublicNumbers,
  server: RsaPublicNumbers,
  code: string,
): Uint8Array {
  const pin = code.trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(pin)) throw new Error('Mã phải gồm đúng 6 ký tự (0-9, A-F)');

  const md = forge.md.sha256.create();
  for (const hex of [client.modulus, client.exponent, server.modulus, server.exponent]) {
    md.update(bytesToBinary(hexToBytes(hex)));
  }
  md.update(bytesToBinary(hexToBytes(pin.slice(2))));
  const hash = binaryToBytes(md.digest().getBytes());
  if (hash[0] !== parseInt(pin.slice(0, 2), 16)) {
    throw new Error('Mã không đúng, hãy kiểm tra lại mã trên TV');
  }
  return hash;
}
