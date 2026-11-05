import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InvoiceKind, InvoiceStatus, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { computeBalances } from '../pricing/balances.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CheckoutsService } from './checkouts.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const NOW = new Date('2026-11-05T15:00:00.000Z');

const input = (overrides = {}) => ({
  amount: '25000',
  currency: 'NGN',
  cryptoAsset: 'USDT',
  network: 'trc20',
  ...overrides,
});

describe('CheckoutsService', () => {
  const prismaMock = {
    business: { findUnique: vi.fn() },
    invoice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    transaction: { findMany: vi.fn() },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  let service: CheckoutsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUnique.mockResolvedValue({ shortfallToleranceBps: 50 });
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    prismaMock.invoice.create.mockImplementation(async ({ data }: any) => ({
      id: 'chk-1',
      amountReceived: D('0'),
      amountOverpaid: D('0'),
      paymentAddress: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...data,
    }));
    prismaMock.transaction.findMany.mockResolvedValue([]);
    service = new CheckoutsService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
    );
  });

  it('creates a PENDING checkout that expires after 24 hours by default', async () => {
    const { checkout, created } = await service.create('biz-1', input({ orderId: '1042' }), NOW);
    expect(created).toBe(true);
    const data = prismaMock.invoice.create.mock.calls[0][0].data;
    expect(data.kind).toBe(InvoiceKind.CHECKOUT);
    expect(data.status).toBe(InvoiceStatus.PENDING);
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + 24 * 60 * 60_000));
    expect(data.amountOutstanding.equals(D('25000'))).toBe(true);
    expect(data.shortfallToleranceBps).toBe(50);
    expect(data.externalOrderId).toBe('1042');
    expect(data.invoiceNumber).toMatch(/^CHK-20261105-[0-9A-F]{8}$/);
    expect(data.paymentReference).toMatch(/^pay_[0-9a-f]{32}$/);
    expect(checkout.id).toBe('chk-1');
  });

  it('returns the same checkout when the same orderId is sent again', async () => {
    const existing = {
      id: 'chk-existing',
      amount: D('25000'),
      currency: 'NGN',
      cryptoAsset: 'USDT',
      network: 'trc20',
    };
    prismaMock.invoice.findFirst.mockResolvedValue(existing);
    const { checkout, created } = await service.create('biz-1', input({ orderId: '1042' }), NOW);
    expect(created).toBe(false);
    expect(checkout.id).toBe('chk-existing');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', externalOrderId: '1042', kind: InvoiceKind.CHECKOUT },
    });
  });

  it('refuses an orderId reused with a different price (409)', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'chk-existing',
      amount: D('20000'),
      currency: 'NGN',
      cryptoAsset: 'USDT',
      network: 'trc20',
    });
    await expect(service.create('biz-1', input({ orderId: '1042' }), NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('resolves a race on the same orderId to the checkout that won', async () => {
    prismaMock.invoice.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'chk-winner',
      amount: D('25000'),
      currency: 'NGN',
      cryptoAsset: 'USDT',
      network: 'trc20',
    });
    prismaMock.invoice.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const { checkout, created } = await service.create('biz-1', input({ orderId: '1042' }), NOW);
    expect(created).toBe(false);
    expect(checkout.id).toBe('chk-winner');
  });

  it('rejects unsupported currencies and pairs', async () => {
    await expect(service.create('biz-1', input({ currency: 'KES' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('biz-1', input({ network: 'erc20' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('scopes reads to the business and hides other kinds (404)', async () => {
    await expect(service.findForBusiness('biz-1', 'inv-or-foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'inv-or-foreign', businessId: 'biz-1', kind: InvoiceKind.CHECKOUT },
    });
  });

  it('shows the shop how much is missing on a part-paid checkout', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'chk-1',
      kind: InvoiceKind.CHECKOUT,
      status: InvoiceStatus.PARTIALLY_PAID,
      paymentReference: 'pay_x',
      invoiceNumber: 'CHK-1',
      amount: D('25000'),
      currency: 'NGN',
      amountReceived: D('13750'),
      amountOutstanding: D('11250'),
      amountOverpaid: D('0'),
      cryptoAsset: 'USDT',
      network: 'trc20',
      expiresAt: new Date(NOW.getTime() - 1000),
      externalOrderId: '1042',
    });
    const detail = await service.findForBusinessByOrderId('biz-1', '1042');
    expect(detail.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(detail.amountOutstanding).toBe('11250');
    expect(detail.orderId).toBe('1042');
    // Part-paid checkouts are never expired, so the order is not failed.
    expect(prismaMock.invoice.updateMany).not.toHaveBeenCalled();
  });
});

describe('checkout full-amount rule (design doc 5.5)', () => {
  const checkout = {
    amount: D('25000'),
    currency: 'NGN',
    shortfallToleranceBps: 50,
    currentStatus: InvoiceStatus.PENDING,
  };

  it('is PAID only when the full amount is in, within the shortfall tolerance', () => {
    expect(computeBalances({ ...checkout, received: D('25000') }).status).toBe(InvoiceStatus.PAID);
    // 0.4% short counts as paid with nothing owed.
    const nearly = computeBalances({ ...checkout, received: D('24900') });
    expect(nearly.status).toBe(InvoiceStatus.PAID);
    expect(nearly.amountOutstanding.toFixed()).toBe('0');
  });

  it('shows a bigger shortfall as part paid with the missing amount', () => {
    const short = computeBalances({ ...checkout, received: D('24875') });
    expect(short.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(short.amountOutstanding.toFixed()).toBe('125');
  });

  it('needs the exact amount when the shop sets the tolerance to zero', () => {
    const strict = computeBalances({ ...checkout, shortfallToleranceBps: 0, received: D('24999') });
    expect(strict.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(strict.amountOutstanding.toFixed()).toBe('1');
  });
});
