import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientsService } from './clients.service.js';

describe('ClientsService', () => {
  const prismaMock = {
    client: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  let service: ClientsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClientsService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
    );
  });

  it('creates a client under the owned business', async () => {
    prismaMock.client.create.mockResolvedValue({ id: 'c-1' });
    await service.create('owner-1', 'biz-1', { name: 'Globex' });
    expect(businessesMock.assertOwnership).toHaveBeenCalledWith('owner-1', 'biz-1');
    expect(prismaMock.client.create).toHaveBeenCalledWith({
      data: { name: 'Globex', businessId: 'biz-1' },
    });
  });

  it('lists clients scoped to the business', async () => {
    prismaMock.client.findMany.mockResolvedValue([]);
    await service.findAll('owner-1', 'biz-1');
    expect(prismaMock.client.findMany).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns 404 for a foreign client id', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const error = await service.findOne('owner-1', 'biz-1', 'c-x').catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('refuses to update a client from another business', async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);
    const error = await service
      .update('owner-1', 'biz-1', 'c-x', { name: 'Hijacked' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it('deletes an owned client (invoices keep records via SetNull)', async () => {
    prismaMock.client.findFirst.mockResolvedValue({ id: 'c-1' });
    await service.remove('owner-1', 'biz-1', 'c-1');
    expect(prismaMock.client.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });
});
