/* eslint-disable no-console */
import { createApp } from './app.js';
import { config, validateConfig } from './infrastructure/config.js';
import { container } from './infrastructure/container.js';

// Validate configuration
try {
  validateConfig();
} catch (error) {
  console.error('Configuration error:', error);
  process.exit(1);
}

const app = createApp();

// Start server
const server = app.listen(config.port, () => {
  container.logger.info('Server started', {
    port: config.port,
    env: config.nodeEnv,
    logLevel: config.logLevel,
  });
  console.log(`🚀 Server running at http://localhost:${config.port}`);
  console.log(`📋 Health check: http://localhost:${config.port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  container.logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    container.logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  container.logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    container.logger.info('Server closed');
    process.exit(0);
  });
});

export { app, server };
