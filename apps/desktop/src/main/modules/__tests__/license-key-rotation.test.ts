import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyWithAnyKey } from '../license-validator';

const data = Buffer.from('bundle-hash');
const a = generateKeyPairSync('ed25519');
const b = generateKeyPairSync('ed25519');
const stranger = generateKeyPairSync('ed25519');

describe('verifyWithAnyKey', () => {
  it('accepts a signature from either trusted key', () => {
    const keys = [a.publicKey, b.publicKey];
    expect(verifyWithAnyKey(data, sign(null, data, a.privateKey), keys)).toBe(true);
    expect(verifyWithAnyKey(data, sign(null, data, b.privateKey), keys)).toBe(true);
  });

  it('rejects a signature from an untrusted key', () => {
    expect(verifyWithAnyKey(data, sign(null, data, stranger.privateKey), [a.publicKey, b.publicKey])).toBe(false);
  });

  it('rejects an untrusted signature against the embedded keys', () => {
    expect(verifyWithAnyKey(data, sign(null, data, stranger.privateKey))).toBe(false);
  });
});
