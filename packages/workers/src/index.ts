import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createContainer, Env } from './infrastructure/container';
import { createAuthController } from './adapters/controllers/AuthController';
import { createCentrifugoProxyController } from './adapters/controllers/CentrifugoProxyController';
import {
  securityHeaders,
  requestId,
  authRateLimiter,
  proxyRateLimiter,
} from './infrastructure/middleware';

type Variables = {
  requestId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use('*', requestId);
app.use('*', securityHeaders);

// CORS middleware
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.FRONTEND_URL || '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Health check (no rate limiting)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
  });
});

// Auth routes with rate limiting
app.use('/auth/*', authRateLimiter);
app.route(
  '/auth',
  (() => {
    const router = new Hono<{ Bindings: Env }>();

    router.all('/*', async (c) => {
      const container = createContainer(c.env);
      const authController = createAuthController({
        authenticateUser: container.authenticateUser,
        logger: container.logger,
      });

      // Forward to auth controller
      const request = new Request(c.req.url.replace('/auth', ''), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== 'GET' ? c.req.raw.body : undefined,
      });

      return authController.fetch(request);
    });

    return router;
  })()
);

// Centrifugo proxy routes with rate limiting
app.use('/centrifugo/*', proxyRateLimiter);
app.route(
  '/centrifugo',
  (() => {
    const router = new Hono<{ Bindings: Env }>();

    router.all('/*', async (c) => {
      const container = createContainer(c.env);
      const centrifugoController = createCentrifugoProxyController({
        processMessage: container.processMessage,
        validateSubscription: container.validateSubscription,
        userRepository: container.userRepository,
        logger: container.logger,
      });

      // Forward to centrifugo controller
      const request = new Request(c.req.url.replace('/centrifugo', ''), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== 'GET' ? c.req.raw.body : undefined,
      });

      return centrifugoController.fetch(request);
    });

    return router;
  })()
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found', requestId: c.get('requestId') }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'Internal server error',
      requestId: c.get('requestId'),
    },
    500
  );
});

export default app;
