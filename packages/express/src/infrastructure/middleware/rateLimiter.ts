import rateLimit from 'express-rate-limit';

// Check if running in load test mode
const isLoadTest = process.env.LOAD_TEST === 'true';

/**
 * Rate limiter for authentication endpoints
 * High limits for load testing, normal limits for production
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isLoadTest ? 100000 : 500, // Higher for load testing
  message: { error: 'Too many requests', retryAfter: 60 },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  },
});

/**
 * Rate limiter for API endpoints
 * 1000 requests per minute
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isLoadTest ? 100000 : 1000, // Higher for load testing
  message: { error: 'Too many requests', retryAfter: 60 },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  },
});

/**
 * Rate limiter for Centrifugo proxy endpoints
 * 500 requests per second (for high-throughput real-time messaging)
 */
export const proxyRateLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: isLoadTest ? 10000 : 500, // Higher for load testing
  message: { error: 'Too many requests', retryAfter: 1 },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  },
});
