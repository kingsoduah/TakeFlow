import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_KEY_PATTERN } from './api-key.constants.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeysService, generateApiKey, hashApiKey } from './api-keys.service.js';

const NOW = new Date('2026-11-05T15:00:00.000Z');

describe('ApiKeysService', () => {
  const prismaMock = {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  let service: ApiKeysService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.apiKey.create.mockImplementation(async ({ data }: any) => ({
      id: 'key-1',
      createdAt: NOW,
      lastUsedAt: null,
      revokedAt: null,
      ...data,
    }));
    prismaMock.apiKey.update.mockResolvedValue({});
    service = new ApiKeysService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
    );
  });

  it('generates keys in the documented format', () => {
    const { key, prefix, keyHash } = generateApiKey();
    expect(key).toMatch(API_KEY_PATTERN);
    expect(prefix).toBe(key.slice(0, 16));
    expect(keyHash).toBe(hashApiKey(key));
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('shows the key once and stores only its hash', async () => {
    const created = await service.create('owner-1', 'biz-1', 'Shop website');
    expect(businessesMock.assertOwnership).toHaveBeenCalledWith('owner-1', 'biz-1');
    expect(created.key).toMatch(API_KEY_PATTERN);
    const stored = prismaMock.apiKey.create.mock.calls[0][0].data;
    expect(stored).toEqual({
      businessId: 'biz-1',
      name: 'Shop website',
      prefix: created.key.slice(0, 16),
      keyHash: hashApiKey(created.key),
    });
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(created).not.toHaveProperty('keyHash');
  });

  it('lists keys without the secret or the hash', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Shop',
        prefix: 'tfk_1a2b3c4d5e6f',
        keyHash: 'abc',
        createdAt: NOW,
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
    const [listed] = await service.list('owner-1', 'biz-1');
    expect(listed).not.toHaveProperty('keyHash');
    expect(listed).not.toHaveProperty('key');
    expect(listed.prefix).toBe('tfk_1a2b3c4d5e6f');
  });

  it('revokes a key of the business and 404s foreign ones', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue({ id: 'key-1', revokedAt: null });
    await service.revoke('owner-1', 'biz-1', 'key-1');
    expect(prismaMock.apiKey.findFirst).toHaveBeenCalledWith({ where: { id: 'key-1', businessId: 'biz-1' } });
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { revokedAt: expect.any(Date) },
    });
    prismaMock.apiKey.findFirst.mockResolvedValue(null);
    await expect(service.revoke('owner-1', 'biz-1', 'key-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('verify', () => {
    const { key, prefix, keyHash } = generateApiKey();
    const row = (overrides = {}) => ({
      id: 'key-1',
      businessId: 'biz-1',
      prefix,
      keyHash,
      revokedAt: null,
      lastUsedAt: null,
      ...overrides,
    });

    it('accepts the right key and returns its business', async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue(row());
      expect(await service.verify(key, NOW)).toEqual({ apiKeyId: 'key-1', businessId: 'biz-1' });
      expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith({ where: { prefix } });
      expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { lastUsedAt: NOW },
      });
    });

    it('rejects a wrong secret behind a real prefix', async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue(row());
      const forged = `${prefix}_${'0'.repeat(48)}`;
      expect(await service.verify(forged, NOW)).toBeNull();
    });

    it('rejects revoked, unknown and malformed keys', async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue(row({ revokedAt: NOW }));
      expect(await service.verify(key, NOW)).toBeNull();
      prismaMock.apiKey.findUnique.mockResolvedValue(null);
      expect(await service.verify(key, NOW)).toBeNull();
      prismaMock.apiKey.findUnique.mockClear();
      expect(await service.verify('not-a-key', NOW)).toBeNull();
      expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
    });

    it('writes lastUsedAt at most once a minute', async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue(row({ lastUsedAt: new Date(NOW.getTime() - 30_000) }));
      await service.verify(key, NOW);
      expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
    });
  });
});

describe('ApiKeyGuard', () => {
  const verify = vi.fn();
  const guard = new ApiKeyGuard({ verify } as unknown as ApiKeysService);
  const contextWith = (headers: Record<string, unknown>) => {
    const request: Record<string, unknown> = { headers };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  };

  beforeEach(() => verify.mockReset());

  it('401s without a key header', async () => {
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('401s when the key does not verify', async () => {
    verify.mockResolvedValue(null);
    const { ctx } = contextWith({ 'x-api-key': 'tfk_bad' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the key business to the request', async () => {
    verify.mockResolvedValue({ apiKeyId: 'key-1', businessId: 'biz-1' });
    const { ctx, request } = contextWith({ 'x-api-key': '  tfk_good  ' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('tfk_good');
    expect(request.apiKey).toEqual({ apiKeyId: 'key-1', businessId: 'biz-1' });
  });

  it('ignores a repeated header instead of guessing which value to use', async () => {
    const { ctx } = contextWith({ 'x-api-key': ['tfk_a', 'tfk_b'] });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });
});
