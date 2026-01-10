import { Context, Next } from 'hono';

/**
 * Security headers middleware
 * Adds common security headers to responses
 */
export async function securityHeaders(c: Context, next: Next) {
  await next();

  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  c.header('X-Frame-Options', 'DENY');

  // XSS protection (legacy, but still useful)
  c.header('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy (adjust as needed)
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
}

/**
 * Request ID middleware
 * Adds a unique request ID for tracing
 */
export async function requestId(c: Context, next: Next) {
  const id = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', id);
  c.header('X-Request-ID', id);
  await next();
}

/**
 * Request timeout middleware
 * Aborts request if it takes too long
 */
export function requestTimeout(timeoutMs: number) {
  return async (c: Context, next: Next) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await next();
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
