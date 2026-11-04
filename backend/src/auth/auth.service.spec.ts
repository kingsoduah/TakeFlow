import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService', () => {
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  const jwtMock = { sign: vi.fn(() => 'test-access-token') };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtMock as unknown as JwtService,
    );
  });

  it('registers a new user without exposing the password hash', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }: any) => ({
      id: 'user-1',
      fullName: data.fullName,
      email: data.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.register({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'supersecret1',
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ada@example.com' },
      select: { id: true },
    });
    const created = prismaMock.user.create.mock.calls[0][0];
    expect(created.data.passwordHash).toBeDefined();
    expect(created.data.passwordHash).not.toBe('supersecret1');
    expect(result.accessToken).toBe('test-access-token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe('ada@example.com');
  });

  it('rejects duplicate email registration with 409', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing' });

    const error = await service
      .register({ fullName: 'A', email: 'dup@example.com', password: 'supersecret1' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('logs in with correct credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      passwordHash: await hash('correct-horse', 4),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.login({
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    expect(result.accessToken).toBe('test-access-token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects wrong password with 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      fullName: 'Ada',
      email: 'ada@example.com',
      passwordHash: await hash('correct-horse', 4),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const error = await service
      .login({ email: 'ada@example.com', password: 'wrong-password' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown email with 401 (no account enumeration)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const error = await service
      .login({ email: 'nobody@example.com', password: 'whatever123' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.message).toBe('Invalid credentials');
  });
});
