import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiKey, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_KEY_PATTERN, API_KEY_PREFIX, API_KEY_PREFIX_LENGTH } from './api-key.constants.js';

export interface ApiKeyPrincipal {
  apiKeyId: string;
  businessId: string;
}

// lastUsedAt is written at most once a minute per key.
const LAST_USED_WRITE_MS = 60_000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

// tfk_<12 hex>_<48 hex>: 48 bits to find the key, 192 secret bits.
export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(6).toString('hex')}_${randomBytes(24).toString('hex')}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX_LENGTH), keyHash: hashApiKey(key) };
}

function toKeyView(row: ApiKey) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

// Website API keys (design doc 5.6). A key is shown once at creation and
// stored only as a sha256 hash. Lookup is by the non-secret prefix, then the
// hashes are compared in constant time.
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async create(ownerId: string, businessId: string, name: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { key, prefix, keyHash } = generateApiKey();
      try {
        const row = await this.prisma.apiKey.create({
          data: { businessId, name, prefix, keyHash },
        });
        // The only time the full key leaves the server.
        return { ...toKeyView(row), key };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException('Could not create a unique API key');
  }

  async list(ownerId: string, businessId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const rows = await this.prisma.apiKey.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toKeyView);
  }

  // Idempotent: revoking a revoked key keeps its first revocation time.
  async revoke(ownerId: string, businessId: string, id: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const row = await this.prisma.apiKey.findFirst({ where: { id, businessId } });
    if (!row) throw new NotFoundException('API key not found');
    if (!row.revokedAt) {
      await this.prisma.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    }
  }

  // The business a presented key belongs to, or null for a missing,
  // malformed, unknown, wrong or revoked key.
  async verify(presented: string, now: Date = new Date()): Promise<ApiKeyPrincipal | null> {
    if (!API_KEY_PATTERN.test(presented)) return null;
    const row = await this.prisma.apiKey.findUnique({
      where: { prefix: presented.slice(0, API_KEY_PREFIX_LENGTH) },
    });
    if (!row) return null;
    const expected = Buffer.from(row.keyHash, 'hex');
    const actual = createHash('sha256').update(presented, 'utf8').digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    if (row.revokedAt) return null;

    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_WRITE_MS) {
      await this.prisma.apiKey
        .update({ where: { id: row.id }, data: { lastUsedAt: now } })
        .catch(() => undefined);
    }
    return { apiKeyId: row.id, businessId: row.businessId };
  }
}
