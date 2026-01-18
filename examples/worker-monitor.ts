/**
 * Monitored Worker - Tracks message processing statistics
 *
 * Enhanced version of worker-simple.ts with detailed metrics
 *
 * Usage:
 *   WORKER_ID=worker-0 npx tsx examples/worker-monitor.ts
 *   WORKER_ID=worker-1 npx tsx examples/worker-monitor.ts
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
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

// Statistics
let totalProcessed = 0;
let totalErrors = 0;
let totalLatency = 0;
let minLatency = Infinity;
let maxLatency = 0;
const channelCounts = new Map<string, number>();
const startTime = Date.now();

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
 * Process a message with metrics tracking
 */
async function processMessage(message: Message): Promise<void> {
  const messageTime = new Date(message.timestamp).getTime();
  const now = Date.now();
  const latency = now - messageTime;

  // Update statistics
  totalProcessed++;
  totalLatency += latency;
  minLatency = Math.min(minLatency, latency);
  maxLatency = Math.max(maxLatency, latency);

  // Track per-channel counts
  const count = channelCounts.get(message.channel) || 0;
  channelCounts.set(message.channel, count + 1);

  // Log sample messages (1 in 100)
  if (totalProcessed % 100 === 0) {
    console.log(
      `[${message.channel}] ${message.userName}: ${message.text} (latency: ${latency}ms)`
    );
  }

  // Simulate processing (you can add your business logic here)
  // await new Promise(resolve => setTimeout(resolve, 1));
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
            totalErrors++;
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
 * Print statistics periodically
 */
function startStatsReporting(): NodeJS.Timeout {
  return setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const throughput = totalProcessed / elapsed;
    const avgLatency = totalProcessed > 0 ? totalLatency / totalProcessed : 0;
    const errorRate = totalProcessed > 0 ? (totalErrors / totalProcessed) * 100 : 0;

    console.log('\n' + '='.repeat(60));
    console.log(`Worker: ${WORKER_ID} - Runtime: ${Math.floor(elapsed)}s`);
    console.log('='.repeat(60));
    console.log(`Processed:       ${totalProcessed.toLocaleString()} messages`);
    console.log(`Errors:          ${totalErrors}`);
    console.log(`Error Rate:      ${errorRate.toFixed(2)}%`);
    console.log(`Throughput:      ${throughput.toFixed(2)} msg/s`);
    console.log(`Unique Channels: ${channelCounts.size}`);
    console.log('');
    console.log('Latency:');
    console.log(`  Min:           ${minLatency === Infinity ? 0 : minLatency.toFixed(2)}ms`);
    console.log(`  Max:           ${maxLatency.toFixed(2)}ms`);
    console.log(`  Average:       ${avgLatency.toFixed(2)}ms`);
    console.log('');

    // Top 10 channels by message count
    const topChannels = Array.from(channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topChannels.length > 0) {
      console.log('Top 10 Channels:');
      topChannels.forEach(([channel, count]) => {
        console.log(`  ${channel}: ${count} messages`);
      });
    }
    console.log('='.repeat(60));
  }, 10000); // Report every 10 seconds
}

/**
 * Print final statistics
 */
function printFinalStats(): void {
  const elapsed = (Date.now() - startTime) / 1000;
  const throughput = totalProcessed / elapsed;
  const avgLatency = totalProcessed > 0 ? totalLatency / totalProcessed : 0;

  console.log('\n' + '='.repeat(60));
  console.log(`FINAL STATISTICS - Worker: ${WORKER_ID}`);
  console.log('='.repeat(60));
  console.log(`Total Runtime:   ${elapsed.toFixed(2)}s`);
  console.log(`Total Processed: ${totalProcessed.toLocaleString()} messages`);
  console.log(`Total Errors:    ${totalErrors}`);
  console.log(`Avg Throughput:  ${throughput.toFixed(2)} msg/s`);
  console.log(`Unique Channels: ${channelCounts.size}`);
  console.log('');
  console.log('Latency Summary:');
  console.log(`  Min:           ${minLatency === Infinity ? 0 : minLatency.toFixed(2)}ms`);
  console.log(`  Max:           ${maxLatency.toFixed(2)}ms`);
  console.log(`  Average:       ${avgLatency.toFixed(2)}ms`);
  console.log('='.repeat(60));

  // Channel distribution
  const channelDistribution = Array.from(channelCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  console.log('\nChannel Distribution:');
  console.log(`  Total Channels: ${channelDistribution.length}`);
  if (channelDistribution.length > 0) {
    const avgPerChannel = totalProcessed / channelDistribution.length;
    const maxChannel = channelDistribution[0];
    const minChannel = channelDistribution[channelDistribution.length - 1];

    console.log(`  Avg per Channel: ${avgPerChannel.toFixed(2)}`);
    console.log(`  Max: ${maxChannel[0]} (${maxChannel[1]} messages)`);
    console.log(`  Min: ${minChannel[0]} (${minChannel[1]} messages)`);
  }
  console.log('='.repeat(60) + '\n');
}

/**
 * Graceful shutdown - unregister from active workers
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n\nShutting down...');

  try {
    // Unregister from active workers
    await unregisterWorker(redis, WORKER_ID);
    console.log('Unregistered from active workers');
  } catch (err) {
    console.error('Error unregistering worker:', err);
  }

  // Print final statistics
  printFinalStats();

  await redis.quit();
  console.log('Worker stopped\n');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Monitored Sticky Channel Worker');
  console.log('='.repeat(60));
  console.log(`  Worker ID: ${WORKER_ID}`);
  console.log(`  Stream: ${getWorkerStreamKey(WORKER_ID)}`);
  console.log(`  Redis: ${REDIS_URL}`);
  console.log('='.repeat(60));
  console.log('Stats will be reported every 10 seconds\n');

  // Register this worker as active
  await registerWorker(redis, WORKER_ID);

  // Start stats reporting
  const statsInterval = startStatsReporting();

  // Cleanup on shutdown
  process.on('exit', () => clearInterval(statsInterval));

  // Start consuming messages
  await consumeStream();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
