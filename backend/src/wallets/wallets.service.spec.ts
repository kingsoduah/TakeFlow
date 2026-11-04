import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoqquService } from '../roqqu/roqqu.service.js';
import { WalletsService } from './wallets.service.js';

describe('WalletsService', () => {
  const prismaMock = {
    invoice: { findFirst: vi.fn(), update: vi.fn() },
    wallet: { create: vi.fn() },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  const roqquMock = { generateWallet: vi.fn() };
  let service: WalletsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WalletsService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
      roqquMock as unknown as RoqquService,
    );
  });

  const invoiceRow = (overrides = {}) => ({
    id: 'inv-1',
    businessId: 'biz-1',
    network: 'erc20',
    paymentAddress: null,
    client: { name: 'Ada Lovelace', email: 'ada@example.com' },
    business: { businessName: 'Acme', businessEmail: 'acme@example.com' },
    ...overrides,
  });

  it('reuses an existing address without calling Roqqu', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoiceRow({ paymentAddress: '0xabc' }));
    const result = await service.getOrCreateAddress('owner-1', 'biz-1', 'inv-1');
    expect(result).toEqual({ address: '0xabc', network: 'erc20', reused: true });
    expect(roqquMock.generateWallet).not.toHaveBeenCalled();
    expect(prismaMock.wallet.create).not.toHaveBeenCalled();
  });

  it('generates, persists and assigns a new address', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(invoiceRow());
    roqquMock.generateWallet.mockResolvedValue({
      status: 'success',
      message: 'ok',
      data: { address: '0xnew' },
    });
    const result = await service.getOrCreateAddress('owner-1', 'biz-1', 'inv-1');
    expect(result).toEqual({ address: '0xnew', network: 'erc20', reused: false });
    expect(roqquMock.generateWallet).toHaveBeenCalledWith('erc20', {
      email: 'ada@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
    expect(prismaMock.wallet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ address: '0xnew', invoiceId: 'inv-1' }),
    });
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { paymentAddress: '0xnew' },
    });
  });

  it('falls back to business details when the invoice has no client', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(
      invoiceRow({ client: null, business: { businessName: 'Acme Ltd', businessEmail: 'a@acme.co' } }),
    );
    roqquMock.generateWallet.mockResolvedValue({
      status: 'success',
      message: 'ok',
      data: { address: '0xnew' },
    });
    await service.getOrCreateAddress('owner-1', 'biz-1', 'inv-1');
    expect(roqquMock.generateWallet).toHaveBeenCalledWith('erc20', {
      email: 'a@acme.co',
      first_name: 'Acme',
      last_name: 'Ltd',
    });
  });

  it('refuses generation without any contact email (400)', async () => {
    prismaMock.invoice.findFirst.mockResolvedValue(
      invoiceRow({ client: { name: 'No Mail', email: null }, business: { businessName: 'X', businessEmail: null } }),
    );
    const error = await service.getOrCreateAddress('owner-1', 'biz-1', 'inv-1').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(roqquMock.generateWallet).not.toHaveBeenCalled();
  });
});
