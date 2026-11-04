import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Official Roqqu wallet-deposit webhook encryption (authoritative per
// project webhook reference):
// - Algorithm: aes-256-ctr.
// - Ciphertext: webhook body field `hash`, hex encoded.
// - Key: first 32 characters of the applicable Roqqu API key.
// - IV: hex-decoded value of the incoming webhook's `x-api-key` header.
// - Decrypted content parses as JSON.
// Key/IV byte lengths are validated before use. Staging vs live key
// interchangeability is UNVERIFIED — the operator selects the key via
// ROQQU_WEBHOOK_API_KEY (staging key for staging events).
export function decryptWebhookBody(args: {
  encryptedHex: string;
  ivHex: string;
  apiKey: string;
}): string {
  const { encryptedHex, ivHex, apiKey } = args;
  if (!apiKey || apiKey.length < 32) {
    throw new Error('Webhook API key must be at least 32 characters');
  }
  const key = Buffer.from(apiKey.slice(0, 32), 'utf8');
  if (key.length !== 32) {
    throw new Error('Webhook key must be exactly 32 bytes');
  }
  if (!/^[0-9a-fA-F]+$/.test(ivHex)) {
    throw new Error('Webhook IV must be hex encoded');
  }
  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== 16) {
    throw new Error('Webhook IV must decode to 16 bytes');
  }
  if (!encryptedHex || !/^[0-9a-fA-F]+$/.test(encryptedHex)) {
    throw new Error('Webhook payload must be a non-empty hex string');
  }
  const ciphertext = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Test/fixture helper only (mirrors the documented algorithm). Never used on
// live traffic.
export function encryptWebhookBody(args: {
  plaintext: string;
  ivHex: string;
  apiKey: string;
}): string {
  const key = Buffer.from(args.apiKey.slice(0, 32), 'utf8');
  const iv = Buffer.from(args.ivHex, 'hex');
  const cipher = createCipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([
    cipher.update(Buffer.from(args.plaintext, 'utf8')),
    cipher.final(),
  ]).toString('hex');
}

export function randomWebhookIvHex(): string {
  return randomBytes(16).toString('hex');
}
