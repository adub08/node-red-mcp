/**
 * AES-256-GCM helpers for encrypting secrets at rest.
 * Key from NR_MCP_ENCRYPTION_KEY (32 bytes, base64 or hex).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const PREFIX = 'v1';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer|null}
 */
export function resolveEncryptionKey(env = process.env) {
  const raw = env.NR_MCP_ENCRYPTION_KEY;
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();

  let key = Buffer.from(s, 'base64');
  if (key.length === 32) return key;

  if (/^[0-9a-fA-F]+$/.test(s)) {
    key = Buffer.from(s, 'hex');
    if (key.length === 32) return key;
  }

  throw new Error(
    'NR_MCP_ENCRYPTION_KEY must decode to 32 bytes (use: openssl rand -base64 32)'
  );
}

/**
 * @param {string} plaintext
 * @param {Buffer} key
 * @returns {string}
 */
export function encryptSecret(plaintext, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64')
  ].join(':');
}

/**
 * @param {string} blob
 * @param {Buffer} key
 * @returns {string}
 */
export function decryptSecret(blob, key) {
  const parts = String(blob).split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Invalid encrypted secret format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
