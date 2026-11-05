import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedWindowLimiter, RateLimitGuard, sharedLimiter } from './rate-limit.js';

describe('FixedWindowLimiter', () => {
  it('allows up to the limit, then blocks until the window ends', () => {
    const limiter = new FixedWindowLimiter();
    const start = 1_000_000;
    expect(limiter.hit('a', 2, 60_000, start).allowed).toBe(true);
    expect(limiter.hit('a', 2, 60_000, start + 10).allowed).toBe(true);
    const blocked = limiter.hit('a', 2, 60_000, start + 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    // Other clients have their own counter.
    expect(limiter.hit('b', 2, 60_000, start + 20).allowed).toBe(true);
    // A new window starts afterwards.
    expect(limiter.hit('a', 2, 60_000, start + 60_001).allowed).toBe(true);
  });
});

describe('RateLimitGuard', () => {
  const setHeader = vi.fn();
  const context = (ip: string, rule: unknown) => {
    const reflector = { getAllAndOverride: () => rule } as unknown as Reflector;
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { guard: new RateLimitGuard(reflector), ctx };
  };

  beforeEach(() => {
    sharedLimiter.reset();
    setHeader.mockClear();
  });

  it('passes routes without a rule', () => {
    const { guard, ctx } = context('1.1.1.1', undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('answers 429 with Retry-After once a client is over the limit', () => {
    const rule = { bucket: 'test', limit: 1, windowMs: 60_000 };
    const { guard, ctx } = context('2.2.2.2', rule);
    expect(guard.canActivate(ctx)).toBe(true);
    const error = (() => {
      try {
        guard.canActivate(ctx);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    // A different client is not affected.
    expect(context('3.3.3.3', rule).guard.canActivate(context('3.3.3.3', rule).ctx)).toBe(true);
  });
});
