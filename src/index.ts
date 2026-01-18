import express from 'express';
import { connectHandler, subscribeHandler, publishHandler } from './handlers/index.js';
import { checkRedisConnection } from './redis.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      console.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Centrifugo callback routes
app.use('/centrifugo', connectHandler);
app.use('/centrifugo', subscribeHandler);
app.use('/centrifugo', publishHandler);

// Health check
app.get('/health', async (_req, res) => {
  const redisOk = await checkRedisConnection();
  res.json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.info('='.repeat(60));
  console.info(`Callback Service started`);
  console.info(`  Port: ${PORT}`);
  console.info(`  Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
  console.info('='.repeat(60));
  console.info('Endpoints:');
  console.info(`  POST /centrifugo/connect`);
  console.info(`  POST /centrifugo/subscribe`);
  console.info(`  POST /centrifugo/publish`);
  console.info(`  GET  /health`);
  console.info('='.repeat(60));
});
