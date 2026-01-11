import { Context, Next } from 'hono';

/**
 * Simple in-memory rate limiter for Cloudflare Workers
 * Uses a sliding window algorithm
 *
 * Note: In production with multiple Workers instances,
 * consider using Cloudflare's Rate Limiting or Durable Objects
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (c: Context) => string; // Custom key generator
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (per worker instance)
const rateLimitStore = new Map<string, RateLimitEntry>();
let lastCleanup = 0;

// Clean up expired entries (called inline, not via setInterval)
function cleanupExpiredEntries(): void {
  const now = Date.now();
  // Only cleanup every 60 seconds
  if (now - lastCleanup < 60000) return;
  lastCleanup = now;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

export function rateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator } = config;

  return async (c: Context, next: Next) => {
    // Cleanup expired entries periodically
    cleanupExpiredEntries();

    // Generate rate limit key (default: IP-based)
    const key = keyGenerator
      ? keyGenerator(c)
      : c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';

    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
    } else {
      // Existing window
      entry.count++;

      if (entry.count > maxRequests) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

        return c.json(
          {
            error: 'Too many requests',
            retryAfter,
          },
          429,
          {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
          }
        );
      }
    }

    // Add rate limit headers
    const currentEntry = rateLimitStore.get(key);
    if (currentEntry) {
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - currentEntry.count)));
      c.header('X-RateLimit-Reset', String(Math.ceil(currentEntry.resetTime / 1000)));
    }

    await next();
  };
}

// Pre-configured rate limiters
// Note: Increase these limits for load testing
export const authRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 500, // 500 requests per minute (for load testing)
});

export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 1000, // 1000 requests per minute
});

export const proxyRateLimiter = rateLimiter({
  windowMs: 1000, // 1 second
  maxRequests: 500, // 500 requests per second (for Centrifugo proxy / load testing)
});
