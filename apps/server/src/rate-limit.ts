import type { SessionRole } from '@sidepot/core';
import type { MiddlewareHandler } from 'hono';

export interface RateLimiterOptions {
  readonly windowMs: number;
  readonly maxRequests: number;
}

interface Bucket {
  count: number;
  resetAtMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, Bucket>();
  private lastCleanupMs = 0;

  public constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  public consume(clientKey: string, nowMs = Date.now()): {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retryAfterSeconds: number;
  } {
    if (nowMs - this.lastCleanupMs > this.windowMs * 2) {
      for (const [key, b] of this.buckets.entries()) {
        if (b.resetAtMs <= nowMs) {
          this.buckets.delete(key);
        }
      }
      this.lastCleanupMs = nowMs;
    }

    const existing = this.buckets.get(clientKey);
    if (!existing || existing.resetAtMs <= nowMs) {
      this.buckets.set(clientKey, {
        count: 1,
        resetAtMs: nowMs + this.windowMs,
      });
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - 1),
        retryAfterSeconds: 0,
      };
    }

    existing.count += 1;
    if (existing.count > this.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAtMs - nowMs) / 1000),
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - existing.count),
      retryAfterSeconds: 0,
    };
  }
}

export function extractClientIp(headers: {
  get(name: string): string | null | undefined;
}): string {
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim().length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

export function createRateLimitMiddleware(
  limiter: SlidingWindowRateLimiter,
): MiddlewareHandler {
  return async (c, next) => {
    const ip = extractClientIp(c.req.raw.headers);
    const verdict = limiter.consume(ip);
    if (!verdict.allowed) {
      c.header('Retry-After', String(verdict.retryAfterSeconds));
      return c.json(
        {
          error: 'RATE_LIMITED',
          message: 'Too many requests; please slow down.',
        },
        429,
      );
    }
    await next();
    return undefined;
  };
}

export function isRoleAuthorized(
  role: SessionRole,
  allowedRoles: readonly SessionRole[],
): boolean {
  return allowedRoles.includes(role);
}
