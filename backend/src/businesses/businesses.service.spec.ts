import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from './businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('BusinessesService', () => {
  const prismaMock = {
    business: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  let service: BusinessesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BusinessesService(prismaMock as unknown as PrismaService);
  });

  it('creates a business attached to the owner', async () => {
    prismaMock.business.create.mockResolvedValue({ id: 'b-1' });
    await service.create('owner-1', { businessName: 'Acme' });
    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: { businessName: 'Acme', ownerId: 'owner-1' },
    });
  });

  it('lists only the requesting owner businesses', async () => {
    prismaMock.business.findMany.mockResolvedValue([]);
    await service.findAll('owner-1');
    expect(prismaMock.business.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('retrieves an owned business', async () => {
    prismaMock.business.findFirst.mockResolvedValue({ id: 'b-1' });
    await service.findOne('owner-1', 'b-1');
    expect(prismaMock.business.findFirst).toHaveBeenCalledWith({
      where: { id: 'b-1', ownerId: 'owner-1' },
    });
  });

  it('returns 404 for a foreign business id (no ownership leak)', async () => {
    prismaMock.business.findFirst.mockResolvedValue(null);
    const error = await service.findOne('owner-2', 'b-1').catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getStatus()).toBe(404);
  });

  it('updates only after verifying ownership', async () => {
    prismaMock.business.findFirst.mockResolvedValue({ id: 'b-1' });
    prismaMock.business.update.mockResolvedValue({ id: 'b-1' });
    await service.update('owner-1', 'b-1', { businessName: 'New' });
    expect(prismaMock.business.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { businessName: 'New' },
    });
  });

  it('refuses to update a business owned by someone else', async () => {
    prismaMock.business.findFirst.mockResolvedValue(null);
    const error = await service
      .update('owner-2', 'b-1', { businessName: 'Hijacked' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(prismaMock.business.update).not.toHaveBeenCalled();
  });

  it('deletes only after verifying ownership', async () => {
    prismaMock.business.findFirst.mockResolvedValue({ id: 'b-1' });
    await service.remove('owner-1', 'b-1');
    expect(prismaMock.business.delete).toHaveBeenCalledWith({
      where: { id: 'b-1' },
    });
  });

  it('refuses to delete a business owned by someone else', async () => {
    prismaMock.business.findFirst.mockResolvedValue(null);
    const error = await service.remove('owner-2', 'b-1').catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(prismaMock.business.delete).not.toHaveBeenCalled();
  });
});
