import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateCheckoutDto } from '../checkouts/dto/checkout.dto.js';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto.js';
import { StartProductCheckoutDto } from '../payments/dto/public-payment.dto.js';

async function errorsFor<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, fields: errors.map((error) => error.property) };
}

const invoice = {
  amount: '1000',
  currency: 'gbp',
  cryptoAsset: 'usdt',
  network: 'TRC20',
  dueDate: '2026-12-31T00:00:00.000Z',
};

describe('pricing validators on request bodies', () => {
  it('accepts the five currencies and three pairs, case-insensitively', async () => {
    const { instance, fields } = await errorsFor(CreateInvoiceDto, invoice);
    expect(fields).toEqual([]);
    expect(instance.currency).toBe('GBP');
    expect(instance.cryptoAsset).toBe('USDT');
    expect(instance.network).toBe('trc20');
    for (const pair of [
      { cryptoAsset: 'USDT', network: 'bep20' },
      { cryptoAsset: 'USDC', network: 'base' },
    ]) {
      expect((await errorsFor(CreateInvoiceDto, { ...invoice, ...pair })).fields).toEqual([]);
    }
  });

  it('rejects other currencies and pairs', async () => {
    expect((await errorsFor(CreateInvoiceDto, { ...invoice, currency: 'KES' })).fields).toContain('currency');
    expect((await errorsFor(CreateInvoiceDto, { ...invoice, network: 'erc20' })).fields).toContain('network');
    expect(
      (await errorsFor(CreateInvoiceDto, { ...invoice, cryptoAsset: 'USDC', network: 'bep20' })).fields,
    ).toContain('network');
    expect(
      (await errorsFor(CreateCheckoutDto, { ...invoice, dueDate: undefined, cryptoAsset: 'BTC', network: 'bitcoin' }))
        .fields,
    ).toContain('network');
  });

  it('only allows http(s) return URLs on checkouts', async () => {
    const base = { amount: '5000', currency: 'NGN', cryptoAsset: 'USDT', network: 'trc20' };
    expect((await errorsFor(CreateCheckoutDto, { ...base, returnUrl: 'https://shop.example/thanks' })).fields).toEqual([]);
    expect((await errorsFor(CreateCheckoutDto, { ...base, returnUrl: 'javascript:alert(1)' })).fields).toContain(
      'returnUrl',
    );
  });

  it('treats blank buyer fields as skipped', async () => {
    const { instance, fields } = await errorsFor(StartProductCheckoutDto, { buyerName: '  ', buyerEmail: '' });
    expect(fields).toEqual([]);
    expect(instance.buyerName).toBeUndefined();
    expect(instance.buyerEmail).toBeUndefined();
    const named = await errorsFor(StartProductCheckoutDto, { buyerEmail: ' Chidi@Example.com ' });
    expect(named.instance.buyerEmail).toBe('chidi@example.com');
    expect((await errorsFor(StartProductCheckoutDto, { buyerEmail: 'nope' })).fields).toContain('buyerEmail');
  });
});
