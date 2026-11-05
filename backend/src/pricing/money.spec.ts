import { InvoiceStatus, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { computeBalances, excessForPayment } from './balances.js';
import { isAcceptedPaymentPair, isPriceCurrency } from './catalog.js';
import {
  convertFiat,
  cryptoForFiat,
  fiatPerCoin,
  percentOfBps,
  roundMoney,
  valueOfCrypto,
} from './money.js';

const D = (v: string) => new Prisma.Decimal(v);

describe('money math (design doc 5.1 examples, 5 Nov figures)', () => {
  it('computes fiat per coin as coin USD price x fiat per USD', () => {
    expect(fiatPerCoin('1.000000000000000', '1375').toFixed()).toBe('1375');
    expect(fiatPerCoin('1.000000000000000', '0.75').toFixed()).toBe('0.75');
    expect(fiatPerCoin('0.999862311183132', '0.75').toFixed()).toBe('0.749896733387349');
  });

  it('rounds crypto amounts up to the coin precision', () => {
    // NGN 500,000 at 1375 per USDT is 363.6363... USDT.
    expect(cryptoForFiat('500000', '1375', 2).toFixed()).toBe('363.64');
    // GBP 1,000 at 0.75 per USDT is 1,333.333... USDT.
    expect(cryptoForFiat('1000', '0.75', 2).toFixed()).toBe('1333.34');
    // GBP 1,000 at 0.749896733387349 per USDC.
    expect(cryptoForFiat('1000', '0.749896733387349', 2).toFixed()).toBe('1333.52');
    // Exact amounts are not pushed up.
    expect(cryptoForFiat('750', '0.75', 2).toFixed()).toBe('1000');
  });

  it('never leaves the business short when the quoted amount is paid at the quoted rate', () => {
    const cases: Array<[string, string]> = [
      ['500000', '1375'],
      ['1000', '0.75'],
      ['1000', '0.749896733387349'],
      ['550', '0.75'],
      ['12.3', '12.3'],
      ['999999.99', '0.92'],
      ['0.01', '1375'],
    ];
    for (const [price, rate] of cases) {
      const crypto = cryptoForFiat(price, rate, 2);
      const value = valueOfCrypto(crypto, rate);
      expect(value.greaterThanOrEqualTo(price)).toBe(true);
    }
  });

  it('values received crypto at full precision beyond 20 significant digits', () => {
    // 1333.52 x 0.749896733387349 = 1000.00229190669763848 exactly.
    expect(valueOfCrypto('1333.52', '0.749896733387349').toFixed()).toBe(
      '1000.00229190669763848',
    );
    // Design doc 5.4 example: 600 USDT at 0.75 is GBP 450.
    expect(valueOfCrypto('600', '0.75').toFixed()).toBe('450');
  });

  it('converts between fiat currencies through their USD rates', () => {
    // GBP 450 -> NGN at 0.75 and 1375 per USD.
    expect(convertFiat('450', '0.75', '1375').toFixed()).toBe('825000');
    expect(roundMoney(convertFiat('100', '1375', '0.75')).toFixed()).toBe('0.05');
  });

  it('computes tolerance from basis points without floats', () => {
    expect(percentOfBps('1000', 50).toFixed()).toBe('5');
    expect(percentOfBps('333.33', 50).toFixed()).toBe('1.66665');
    expect(() => percentOfBps('1', 0.5)).toThrow();
  });

  it('rejects zero or negative rates', () => {
    expect(() => cryptoForFiat('10', '0', 2)).toThrow();
    expect(() => fiatPerCoin('-1', '1375')).toThrow();
  });
});

describe('balances (design doc 5.3 tolerance and overpayment rules)', () => {
  const base = {
    amount: D('1000'),
    currency: 'GBP',
    shortfallToleranceBps: 50,
    currentStatus: InvoiceStatus.PENDING,
  };

  it('keeps the current status with nothing received', () => {
    const result = computeBalances({ ...base, received: D('0') });
    expect(result.status).toBe(InvoiceStatus.PENDING);
    expect(result.amountOutstanding.toFixed()).toBe('1000');
  });

  it('marks partial payments and leaves the rest owed (5.4 example)', () => {
    const result = computeBalances({ ...base, received: D('450') });
    expect(result.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(result.amountOutstanding.toFixed()).toBe('550');
    // The next quote for GBP 550 at 0.75 asks for 733.34 USDT.
    expect(cryptoForFiat(result.amountOutstanding, '0.75', 2).toFixed()).toBe('733.34');
  });

  it('counts a shortfall under 0.5% as paid with nothing owed', () => {
    const result = computeBalances({ ...base, received: D('995.01') });
    expect(result.status).toBe(InvoiceStatus.PAID);
    expect(result.amountOutstanding.toFixed()).toBe('0');
  });

  it('does not count a shortfall of exactly 0.5% as paid', () => {
    const result = computeBalances({ ...base, received: D('995') });
    expect(result.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(result.amountOutstanding.toFixed()).toBe('5');
  });

  it('honours a zero tolerance', () => {
    const short = computeBalances({ ...base, shortfallToleranceBps: 0, received: D('999.99') });
    expect(short.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    const exact = computeBalances({ ...base, shortfallToleranceBps: 0, received: D('1000') });
    expect(exact.status).toBe(InvoiceStatus.PAID);
  });

  it('ignores an excess under one minor unit', () => {
    const tiny = computeBalances({ ...base, received: D('1000.00229190669763848') });
    expect(tiny.status).toBe(InvoiceStatus.PAID);
    expect(tiny.amountOverpaid.toFixed()).toBe('0');
    const ngn = computeBalances({ ...base, currency: 'NGN', received: D('1000.99') });
    expect(ngn.amountOverpaid.toFixed()).toBe('0');
  });

  it('reports an excess of one minor unit or more', () => {
    const over = computeBalances({ ...base, received: D('1000.01') });
    expect(over.amountOverpaid.toFixed()).toBe('0.01');
    const ngn = computeBalances({ ...base, currency: 'NGN', received: D('1001') });
    expect(ngn.amountOverpaid.toFixed()).toBe('1');
  });

  it('attributes only the new part of an overpayment to each payment', () => {
    expect(excessForPayment(D('0'), D('1200'), D('1000'), 'USD').toFixed()).toBe('200');
    expect(excessForPayment(D('1200'), D('1300'), D('1000'), 'USD').toFixed()).toBe('100');
    expect(excessForPayment(D('400'), D('900'), D('1000'), 'USD').toFixed()).toBe('0');
    expect(excessForPayment(D('0'), D('1000.004'), D('1000'), 'USD').toFixed()).toBe('0');
  });
});

describe('catalog', () => {
  it('accepts only the three payment pairs', () => {
    expect(isAcceptedPaymentPair('USDT', 'trc20')).toBe(true);
    expect(isAcceptedPaymentPair('USDT', 'bep20')).toBe(true);
    expect(isAcceptedPaymentPair('USDC', 'base')).toBe(true);
    expect(isAcceptedPaymentPair('USDT', 'erc20')).toBe(false);
    expect(isAcceptedPaymentPair('USDC', 'trc20')).toBe(false);
    expect(isAcceptedPaymentPair('BTC', 'bitcoin')).toBe(false);
  });

  it('accepts only the five price currencies', () => {
    for (const code of ['NGN', 'USD', 'GBP', 'EUR', 'GHS']) {
      expect(isPriceCurrency(code)).toBe(true);
    }
    expect(isPriceCurrency('KES')).toBe(false);
    expect(isPriceCurrency('usd')).toBe(false);
  });
});
