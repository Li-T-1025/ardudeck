/**
 * Offline Ed25519 license key + bundle signature verification.
 * Embeds the Hangar public key so no file system dependency is needed.
 */

import { verify, createPublicKey, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LicensePayload, ReceiptPayload } from '../../shared/module-types.js';
import { t } from '../../shared/i18n/index.js';

/**
 * Trusted Hangar Ed25519 public keys (SPKI PEM). A signature from any of them is accepted,
 * so the Hangar can move to the 2026-10 key while existing signatures keep verifying.
 */
const PUBLIC_KEY_PEMS = [
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+JX7ieaqUzi1WMTzPrWb3vAeUJOj8cbmFaYuZT5rnZ0=
-----END PUBLIC KEY-----`,
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA3z0sAoB7J05Jnd2zGcjWXmG7aGPiauBqcC5Q3B4inzI=
-----END PUBLIC KEY-----`,
];

let cachedPublicKeys: ReturnType<typeof createPublicKey>[] | null = null;

function getPublicKeys() {
  if (!cachedPublicKeys) {
    cachedPublicKeys = PUBLIC_KEY_PEMS.map((pem) => createPublicKey(pem));
  }
  return cachedPublicKeys;
}

export function verifyWithAnyKey(
  data: Buffer,
  signature: Buffer,
  keys = getPublicKeys(),
): boolean {
  return keys.some((key) => verify(null, data, key, signature));
}

/**
 * Verify a license key's Ed25519 signature and decode the payload.
 * Format: ARDUDECK.{base64url(payload)}.{base64url(signature)}
 * (dot separator: base64url alphabet contains `-` and `_` so they cannot split the key)
 */
/**
 * Whether a string even looks like a key, without touching crypto. A free
 * cargo can be installed with no key on record, and that is not a broken key,
 * it is a different install path.
 */
export function isLicenseKeyShaped(key: string | null | undefined): boolean {
  if (!key) return false;
  const parts = key.split('.');
  return parts.length === 3 && parts[0] === 'ARDUDECK' && !!parts[1] && !!parts[2];
}

export function verifyLicenseKey(
  key: string,
): { valid: boolean; payload?: LicensePayload; error?: string } {
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'ARDUDECK') {
    return { valid: false, error: t('main:licenseValidator.invalidKeyFormat') };
  }

  const payloadB64 = parts[1]!;
  const sigB64 = parts[2]!;

  try {
    const signature = Buffer.from(sigB64, 'base64url');
    const isValid = verifyWithAnyKey(Buffer.from(payloadB64, 'utf-8'), signature);

    if (!isValid) {
      return { valid: false, error: t('main:licenseValidator.invalidSignature') };
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as LicensePayload;

    // Check expiration if present
    if (payload.expiresAt) {
      const expiresAt = new Date(payload.expiresAt);
      if (expiresAt < new Date()) {
        return { valid: false, payload, error: t('main:licenseValidator.licenseExpired') };
      }
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: t('main:licenseValidator.verificationFailed', { error: String(err) }) };
  }
}

/**
 * Verify the Ed25519 signature of a downloaded module bundle (ZIP).
 * The signature signs the SHA256 hash of the file.
 */
export function verifyBundleSignature(
  bundlePath: string,
  signature: string,
): boolean {
  try {
    const bundleData = readFileSync(bundlePath);
    const hash = createHash('sha256').update(bundleData).digest();
    return verifyWithAnyKey(hash, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

const RECEIPT_PREFIX = 'ADRCPT';

export function verifyReceipt(
  receipt: string,
  deviceId: string,
  opts: { now?: Date; publicKeyPem?: string } = {},
): { valid: boolean; payload?: ReceiptPayload; error?: string } {
  const now = opts.now ?? new Date();
  const publicKeys = opts.publicKeyPem ? [createPublicKey(opts.publicKeyPem)] : getPublicKeys();
  const parts = receipt.split('.');
  if (parts.length !== 3 || parts[0] !== RECEIPT_PREFIX) {
    return { valid: false, error: 'Not a receipt' }; // i18n-exempt
  }
  const payloadB64 = parts[1]!;
  const sigB64 = parts[2]!;

  try {
    const ok = verifyWithAnyKey(
      Buffer.from(`receipt.v1.${payloadB64}`, 'utf-8'),
      Buffer.from(sigB64, 'base64url'),
      publicKeys,
    );
    if (!ok) return { valid: false, error: 'Invalid signature' }; // i18n-exempt

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as ReceiptPayload;

    if (payload.v !== 1) return { valid: false, payload, error: 'Unsupported receipt version' }; // i18n-exempt
    if (!Array.isArray(payload.slugs)) return { valid: false, payload, error: 'No slugs' }; // i18n-exempt
    if (payload.deviceId !== deviceId) {
      return { valid: false, payload, error: 'Receipt belongs to another device' }; // i18n-exempt
    }
    if (payload.expiresAt && new Date(payload.expiresAt) < now) {
      return { valid: false, payload, error: 'Receipt has expired' }; // i18n-exempt
    }
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err}` };
  }
}
