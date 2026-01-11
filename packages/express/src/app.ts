import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { container } from './infrastructure/container.js';
import { config } from './infrastructure/config.js';
import { createAuthRouter } from './adapters/controllers/AuthController.js';
import { createCentrifugoProxyRouter } from './adapters/controllers/CentrifugoProxyController.js';
import {
  requestIdMiddleware,
  createErrorHandler,
  notFoundHandler,
  authRateLimiter,
  proxyRateLimiter,
} from './infrastructure/middleware/index.js';

export function createApp(): Express {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Global middleware
  app.use(express.json());
  app.use(requestIdMiddleware);

  // Security middleware (helmet)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );

  // CORS middleware
  app.use(
    cors({
      origin: config.frontendUrl || '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      credentials: true,
    })
  );

  // Health check endpoint (no rate limiting)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  });

  // Auth routes with rate limiting
  const authRouter = createAuthRouter({
    authenticateUser: container.authenticateUser,
    logger: container.logger,
  });
  app.use('/auth', authRateLimiter, authRouter);

  // Centrifugo proxy routes with rate limiting
  const centrifugoRouter = createCentrifugoProxyRouter({
    processMessage: container.processMessage,
    validateSubscription: container.validateSubscription,
    userRepository: container.userRepository,
    logger: container.logger,
  });
  app.use('/centrifugo', proxyRateLimiter, centrifugoRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(createErrorHandler(container.logger));

  return app;
}

export { container };
