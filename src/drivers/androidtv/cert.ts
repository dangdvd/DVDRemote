import AsyncStorage from '@react-native-async-storage/async-storage';
import forge from 'node-forge';
import { Platform } from 'react-native';
import { bytesToBinary, bytesToHex } from '../../core/bytes';
import { randomBytes } from '../../net/random';
import { generateRsaPrivateKeyPem } from '../../net/rsa';
import type { RsaPublicNumbers } from './secret';

const STORAGE_KEY = 'dvdremote.androidtv.identity.v1';

export interface ClientIdentity {
  certPem: string;
  /** PKCS#8 for Android, PKCS#1 for iOS (what react-native-tcp-socket expects on each). */
  keyPem: string;
  publicNumbers: RsaPublicNumbers;
}

interface StoredIdentity {
  certPem: string;
  privateKeyPem: string;
}

function toIdentity(stored: StoredIdentity): ClientIdentity {
  const cert = forge.pki.certificateFromPem(stored.certPem);
  const privateKey = forge.pki.privateKeyFromPem(stored.privateKeyPem) as forge.pki.rsa.PrivateKey;
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  const keyPem =
    Platform.OS === 'ios'
      ? forge.pki.privateKeyToPem(privateKey)
      : forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey)));
  return {
    certPem: stored.certPem,
    keyPem,
    publicNumbers: { modulus: pub.n.toString(16), exponent: pub.e.toString(16) },
  };
}

let cached: Promise<ClientIdentity> | null = null;

/**
 * The client certificate identifies this phone to every Android TV. It is created once
 * (RSA 2048, which iOS requires) and reused, so TVs stay paired across app restarts.
 */
export function getClientIdentity(): Promise<ClientIdentity> {
  if (!cached) {
    cached = loadOrCreate().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

async function generateKeys(): Promise<forge.pki.rsa.KeyPair> {
  try {
    const privateKey = forge.pki.privateKeyFromPem(await generateRsaPrivateKeyPem(2048)) as forge.pki.rsa.PrivateKey;
    return { privateKey, publicKey: forge.pki.setRsaPublicKey(privateKey.n, privateKey.e) };
  } catch {
    // Native module unavailable: slow but working pure JS fallback.
    // Yield first so the UI can render its "generating" message.
    await new Promise((r) => setTimeout(r, 50));
    const prng = { getBytesSync: (n: number) => bytesToBinary(randomBytes(n)) };
    return forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001, prng } as any);
  }
}

async function loadOrCreate(): Promise<ClientIdentity> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) return toIdentity(JSON.parse(raw));

  const keys = await generateKeys();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  // Positive serial number: clear the top bit.
  const serial = randomBytes(16);
  serial[0] &= 0x7f;
  cert.serialNumber = bytesToHex(serial);
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 24 * 3600 * 1000);
  const attrs = [
    { name: 'commonName', value: 'atvremote' },
    { name: 'countryName', value: 'VN' },
    { name: 'organizationName', value: 'DVD Remote' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const stored: StoredIdentity = {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return toIdentity(stored);
}
