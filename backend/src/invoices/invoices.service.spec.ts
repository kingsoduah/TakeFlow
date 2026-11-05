import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InvoicesService } from './invoices.service.js';

function uniqueViolation(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

// USDT on erc20 is no longer an accepted pair (design doc 4), so the
// fixture uses trc20.
const baseDto = {
  amount: '1500.00',
  currency: 'USD',
  cryptoAsset: 'USDT',
  network: 'trc20',
  dueDate: '2026-12-31T00:00:00.000Z',
};

describe('InvoicesService', () => {
  const prismaMock = {
    client: { findFirst: vi.fn() },
    invoice: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  let service: InvoicesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    service = new InvoicesService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
    );
  });

  it('creates a DRAFT invoice with outstanding equal to amount', async () => {
    prismaMock.invoice.create.mockImplementation(async ({ data }: any) => ({
      id: 'inv-1',
      ...data,
    }));

    const result = await service.create('owner-1', 'biz-1', { ...baseDto });

    expect(businessesMock.assertOwnership).toHaveBeenCalledWith('owner-1', 'biz-1');
    expect(result.status).toBe(InvoiceStatus.DRAFT);
    expect(result.amount.equals(new Prisma.Decimal('1500.00'))).toBe(true);
    expect(result.amountOutstanding.equals(new Prisma.Decimal('1500.00'))).toBe(
      true,
    );
    expect(result.invoiceNumber).toMatch(/^INV-/);
    expect(result.paymentReference).toMatch(/^pay_/);
  });

  it('copies the business shortfall tolerance and marks the row as an invoice', async () => {
    businessesMock.assertOwnership.mockResolvedValueOnce({ id: 'biz-1', shortfallToleranceBps: 0 });
    prismaMock.invoice.create.mockImplementation(async ({ data }: any) => ({ id: 'inv-1', ...data }));
    const result = await service.create('owner-1', 'biz-1', { ...baseDto, currency: 'GBP' });
    expect(result.shortfallToleranceBps).toBe(0);
    expect(result.kind).toBe('INVOICE');
    expect(result.currency).toBe('GBP');
  });

  it('rejects unsupported price currencies and coin/network pairs (400)', async () => {
    for (const bad of [
      { currency: 'KES' },
      { network: 'erc20' },
      { cryptoAsset: 'USDC', network: 'trc20' },
      { cryptoAsset: 'BTC', network: 'bitcoin' },
    ]) {
      const error = await service.create('owner-1', 'biz-1', { ...baseDto, ...bad }).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
    }
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('lists only invoices, not shop checkouts', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([]);
    prismaMock.invoice.count.mockResolvedValue(0);
    await service.findAll('owner-1', 'biz-1', {});
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'biz-1', kind: 'INVOICE' } }),
    );
  });

  it('keeps balances right when the amount of a part-paid invoice changes', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.PARTIALLY_PAID,
      currency: 'GBP',
      shortfallToleranceBps: 50,
      amountReceived: new Prisma.Decimal('450'),
    });
    prismaMock.invoice.update.mockImplementation(async ({ data }: any) => data);
    const lowered = await service.update('owner-1', 'biz-1', 'inv-1', { amount: '400' });
    expect(lowered.amountOutstanding.toFixed()).toBe('0');
    expect(lowered.amountOverpaid.toFixed()).toBe('50');
    expect(lowered.status).toBe(InvoiceStatus.PAID);
  });

  it('rejects an invoice referencing another business client (404)', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const error = await service
      .create('owner-1', 'biz-1', { ...baseDto, clientId: 'c-foreign' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects PAID status at creation (400)', async () => {
    const error = await service
      .create('owner-1', 'biz-1', { ...baseDto, status: InvoiceStatus.PAID })
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate invoice number for the business (409)', async () => {
    prismaMock.invoice.create.mockRejectedValue(
      uniqueViolation(['businessId', 'invoiceNumber']),
    );
    const error = await service
      .create('owner-1', 'biz-1', { ...baseDto, invoiceNumber: 'INV-DUP' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
  });

  it('recalculates outstanding with Decimal arithmetic on amount change', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.DRAFT,
      amountReceived: new Prisma.Decimal('0'),
    });
    prismaMock.invoice.update.mockImplementation(async ({ data }: any) => data);

    const result = await service.update('owner-1', 'biz-1', 'inv-1', {
      amount: '2000.50',
    });
    expect(result.amountOutstanding.equals(new Prisma.Decimal('2000.50'))).toBe(
      true,
    );
  });

  it('allows DRAFT to PENDING but not DRAFT to PAID', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.DRAFT,
      amountReceived: new Prisma.Decimal('0'),
    });
    prismaMock.invoice.update.mockImplementation(async ({ data }: any) => data);

    await service.update('owner-1', 'biz-1', 'inv-1', {
      status: InvoiceStatus.PENDING,
    });
    expect(prismaMock.invoice.update).toHaveBeenCalled();

    vi.clearAllMocks();
    const error = await service
      .update('owner-1', 'biz-1', 'inv-1', { status: InvoiceStatus.PAID })
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('refuses any transition out of a terminal PAID invoice', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.PAID,
      amountReceived: new Prisma.Decimal('100'),
    });
    const error = await service
      .update('owner-1', 'biz-1', 'inv-1', { status: InvoiceStatus.PENDING })
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('deletes drafts but refuses to delete issued invoices', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.DRAFT,
    });
    await service.remove('owner-1', 'biz-1', 'inv-1');
    expect(prismaMock.invoice.delete).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
    });

    prismaMock.invoice.findFirst.mockResolvedValue({
      id: 'inv-2',
      status: InvoiceStatus.PENDING,
    });
    const error = await service.remove('owner-1', 'biz-1', 'inv-2').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
  });
});
