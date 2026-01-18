/**
 * Sticky Channel Worker - Each worker consumes its own dedicated stream
 *
 * Architecture:
 * - Each worker registers itself in Redis (workers:active ZSET)
 * - Channels are assigned to workers dynamically (round-robin)
 * - Same channel always routes to the same worker (sticky routing)
 * - Worker only consumes its own stream: messages:worker:{WORKER_ID}
 *
 * Usage:
 *   # Start worker with unique ID
 *   WORKER_ID=worker-0 npx tsx examples/worker-simple.ts
 *   WORKER_ID=worker-1 npx tsx examples/worker-simple.ts
 *
 *   # Or with auto-generated ID
 *   npx tsx examples/worker-simple.ts
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
  ROUTING_KEYS,
  getWorkerStreamKey,
  registerWorker,
  unregisterWorker,
} from '../src/config/routing.js';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;

// Consumer settings
const CONSUME_BATCH_SIZE = 10;
const CONSUME_BLOCK_TIME = 5000;

const redis = new Redis(REDIS_URL);
let isShuttingDown = false;

interface Message {
  id: string;
  channel: string;
  workerId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

/**
 * Process a message (implement your business logic here)
 */
async function processMessage(message: Message): Promise<void> {
  console.log(`[${message.channel}] ${message.userName}: ${message.text}`);
  // TODO: Add your business logic here
  // - Save to database
  // - Send push notification
  // - Trigger webhook
  // - Analytics
}

/**
 * Consume messages from this worker's dedicated stream
 */
async function consumeStream(): Promise<void> {
  const streamKey = getWorkerStreamKey(WORKER_ID);
  let lastId = '$'; // Start from latest messages

  console.log(`Started consuming stream: ${streamKey}`);

  while (!isShuttingDown) {
    try {
      const results = await redis.xread(
        'COUNT', CONSUME_BATCH_SIZE,
        'BLOCK', CONSUME_BLOCK_TIME,
        'STREAMS', streamKey, lastId
      );

      if (!results) continue;

      for (const [, messages] of results) {
        for (const [messageId, fields] of messages as [string, string[]][]) {
          try {
            const payloadIndex = fields.indexOf('payload');
            if (payloadIndex !== -1) {
              const message: Message = JSON.parse(fields[payloadIndex + 1]);
              await processMessage(message);
            }
            lastId = messageId;
          } catch (err) {
            console.error(`Error processing message ${messageId}:`, err);
            lastId = messageId; // Advance to avoid getting stuck
          }
        }
      }
    } catch (err) {
      if (!isShuttingDown) {
        console.error('Error consuming stream:', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

/**
 * Graceful shutdown - unregister from active workers
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\nShutting down...');

  try {
    // Unregister from active workers
    await unregisterWorker(redis, WORKER_ID);
    console.log('Unregistered from active workers');
  } catch (err) {
    console.error('Error unregistering worker:', err);
  }

  await redis.quit();
  console.log('Worker stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log('Sticky Channel Worker');
  console.log('='.repeat(50));
  console.log(`  Worker ID: ${WORKER_ID}`);
  console.log(`  Stream: ${getWorkerStreamKey(WORKER_ID)}`);
  console.log(`  Redis: ${REDIS_URL}`);
  console.log('='.repeat(50));

  // Register this worker as active
  await registerWorker(redis, WORKER_ID);

  // Start consuming messages
  await consumeStream();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
