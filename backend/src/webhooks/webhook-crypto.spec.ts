import { describe, expect, it } from 'vitest';
import {
  decryptWebhookBody,
  encryptWebhookBody,
  randomWebhookIvHex,
} from './webhook-crypto.js';

const KEY = 'test-webhook-key-0123456789abcdef';
const IV = '00112233445566778899aabbccddeeff';
const PLAINTEXT = JSON.stringify({ event_id: 'evt_1', event_type: 'token_received' });

describe('webhook-crypto', () => {
  it('round-trips through the documented algorithm', () => {
    const encrypted = encryptWebhookBody({ plaintext: PLAINTEXT, ivHex: IV, apiKey: KEY });
    expect(decryptWebhookBody({ encryptedHex: encrypted, ivHex: IV, apiKey: KEY })).toBe(
      PLAINTEXT,
    );
  });

  it('is deterministic for a fixed key and IV (aes-256-ctr)', () => {
    const a = encryptWebhookBody({ plaintext: PLAINTEXT, ivHex: IV, apiKey: KEY });
    const b = encryptWebhookBody({ plaintext: PLAINTEXT, ivHex: IV, apiKey: KEY });
    expect(a).toBe(b);
    expect(/^[0-9a-f]+$/.test(a)).toBe(true);
  });

  it('uses only the first 32 key characters', () => {
    const encrypted = encryptWebhookBody({ plaintext: PLAINTEXT, ivHex: IV, apiKey: KEY });
    const decrypted = decryptWebhookBody({
      encryptedHex: encrypted,
      ivHex: IV,
      apiKey: `${KEY}-extra-trailing-material`,
    });
    expect(decrypted).toBe(PLAINTEXT);
  });

  it('rejects short keys, bad IVs and non-hex payloads', () => {
    expect(() =>
      decryptWebhookBody({ encryptedHex: 'aabb', ivHex: IV, apiKey: 'short' }),
    ).toThrow();
    expect(() =>
      decryptWebhookBody({ encryptedHex: 'aabb', ivHex: 'zz', apiKey: KEY }),
    ).toThrow();
    expect(() =>
      decryptWebhookBody({ encryptedHex: 'aabb', ivHex: 'aabb', apiKey: KEY }),
    ).toThrow();
    expect(() =>
      decryptWebhookBody({ encryptedHex: 'not-hex!!', ivHex: IV, apiKey: KEY }),
    ).toThrow();
  });

  it('generates 16-byte hex IVs', () => {
    expect(randomWebhookIvHex()).toMatch(/^[0-9a-f]{32}$/);
  });
});
