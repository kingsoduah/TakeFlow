import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitRule {
  // Requests sharing a bucket name share a counter per client.
  bucket: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'takeflow:rate-limit';

// Marks a route (or controller) with its limit. Used with RateLimitGuard.
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// Fixed window counter held in memory. Good enough for one instance at the
// hackathon; several instances would each keep their own counts.
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly maxKeys = 50_000) {}

  hit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
    this.sweep(now);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    const allowed = window.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - window.count),
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  reset() {
    this.windows.clear();
  }

  // Drops finished windows at most once a second, and caps memory use.
  private sweep(now: number) {
    if (now - this.lastSweep < 1000 && this.windows.size < this.maxKeys) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}

// One shared limiter for the whole app.
export const sharedLimiter = new FixedWindowLimiter();

// Limits each client address per bucket. The address is req.ip, which only
// trusts X-Forwarded-For when TRUST_PROXY_HOPS is set.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = sharedLimiter;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const client = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const result = this.limiter.hit(`${rule.bucket}:${client}`, rule.limit, rule.windowMs);
    if (!result.allowed) {
      const response = http.getResponse<Response>();
      response.setHeader?.('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        'Too many requests. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
