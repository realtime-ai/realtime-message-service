import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Check if running in load test mode - disable rate limiting completely
const isLoadTest = process.env.LOAD_TEST === 'true';

// No-op middleware for load testing (passes through without any rate limiting)
const noopMiddleware = (_req: Request, _res: Response, next: NextFunction) => next();

/**
 * Rate limiter for authentication endpoints
 * Disabled for load testing, normal limits for production
 */
export const authRateLimiter = isLoadTest
  ? noopMiddleware
  : rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 500,
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
export const apiRateLimiter = isLoadTest
  ? noopMiddleware
  : rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 1000,
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
export const proxyRateLimiter = isLoadTest
  ? noopMiddleware
  : rateLimit({
      windowMs: 1000, // 1 second
      max: 500,
      message: { error: 'Too many requests', retryAfter: 1 },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      },
    });
