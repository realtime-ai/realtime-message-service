/**
 * Basic usage example for the Server Worker SDK
 *
 * Run with: npm run example
 * Or: npx tsx examples/basic-usage.ts
 *
 * Prerequisites:
 * 1. Redis running on localhost:6379
 * 2. Gateway running: cd realtime-message-gateway && ./realtime-message-gateway
 */

import { createWorker, type Message, type ChannelInfo } from '../src/index.js';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WORKER_ID = process.env.WORKER_ID;

// Statistics
let totalMessages = 0;
let totalChannels = 0;
const startTime = Date.now();

// Create worker with callbacks
const worker = createWorker(
  {
    redis: REDIS_URL,
    workerId: WORKER_ID,
    channelInactivityTimeout: 30000, // 30 seconds
    inactivityCheckInterval: 5000,   // Check every 5 seconds
    batchSize: 100,                  // Process 100 messages per batch
    blockTime: 5000,                 // Block for 5 seconds when waiting
    startFrom: 'latest',             // Only process new messages
  },
  {
    onChannelActive: async (channel: string, info: ChannelInfo) => {
      totalChannels++;
      console.log(`\n[ACTIVE] Channel: ${channel}`);
      console.log(`  First message at: ${info.firstMessageAt.toISOString()}`);
      console.log(`  Total active channels: ${worker.getActiveChannels().size}`);
    },

    onChannelMessage: async (channel: string, message: Message) => {
      totalMessages++;

      // Log every 1000th message or first few
      if (totalMessages <= 5 || totalMessages % 1000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = totalMessages / elapsed;
        console.log(
          `[MSG #${totalMessages}] ${channel} | ${message.userName}: ${message.text.slice(0, 50)}... | Rate: ${rate.toFixed(1)} msg/s`
        );
      }
    },

    onChannelInactive: async (channel: string, info: ChannelInfo) => {
      console.log(`\n[INACTIVE] Channel: ${channel}`);
      console.log(`  Total messages: ${info.messageCount}`);
      console.log(`  Duration: ${(info.lastMessageAt.getTime() - info.firstMessageAt.getTime()) / 1000}s`);
      console.log(`  Remaining active channels: ${worker.getActiveChannels().size}`);
    },

    onWorkerStarted: async (workerId: string) => {
      console.log(`\n========================================`);
      console.log(`Worker started: ${workerId}`);
      console.log(`Redis: ${REDIS_URL}`);
      console.log(`========================================\n`);
    },

    onWorkerStopped: async (workerId: string) => {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`\n========================================`);
      console.log(`Worker stopped: ${workerId}`);
      console.log(`Total messages: ${totalMessages}`);
      console.log(`Total channels: ${totalChannels}`);
      console.log(`Runtime: ${elapsed.toFixed(1)}s`);
      console.log(`Average rate: ${(totalMessages / elapsed).toFixed(1)} msg/s`);
      console.log(`========================================\n`);
    },

    onError: async (error: Error) => {
      console.error(`[ERROR] ${error.message}`);
    },
  }
);

// Also demonstrate EventEmitter pattern
worker.on('channel:message', (channel, message) => {
  // This runs in addition to the callback
  // Useful for adding logging or metrics without modifying callback logic
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');
  await worker.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Print status periodically
setInterval(() => {
  if (totalMessages > 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalMessages / elapsed;
    console.log(
      `[STATUS] Messages: ${totalMessages} | Active channels: ${worker.getActiveChannels().size} | Rate: ${rate.toFixed(1)} msg/s`
    );
  }
}, 10000);

// Start the worker
console.log('Starting worker...');
worker.start().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
