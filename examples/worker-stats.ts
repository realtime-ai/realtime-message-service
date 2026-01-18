/**
 * Worker with Statistics - Tracks processing speed and channel distribution
 *
 * Usage:
 *   WORKER_ID=worker-0 npx tsx examples/worker-stats.ts
 *   WORKER_ID=worker-1 npx tsx examples/worker-stats.ts
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
  ROUTING_KEYS,
  getWorkerStreamKey,
  registerWorker,
  unregisterWorker,
} from '../lib/routing.js';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WORKER_ID = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const STATS_INTERVAL = parseInt(process.env.STATS_INTERVAL || '2000', 10);

// Consumer settings
const CONSUME_BATCH_SIZE = 100;
const CONSUME_BLOCK_TIME = 1000;

const redis = new Redis(REDIS_URL);
let isShuttingDown = false;

// Statistics
interface WorkerStats {
  startTime: number;
  totalMessages: number;
  messagesInWindow: number;
  windowStartTime: number;
  channelCounts: Map<string, number>;
  latencies: number[];
}

const stats: WorkerStats = {
  startTime: Date.now(),
  totalMessages: 0,
  messagesInWindow: 0,
  windowStartTime: Date.now(),
  channelCounts: new Map(),
  latencies: [],
};

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
 * Process a message and update statistics
 */
async function processMessage(message: Message): Promise<void> {
  stats.totalMessages++;
  stats.messagesInWindow++;

  // Track channel distribution
  const count = stats.channelCounts.get(message.channel) || 0;
  stats.channelCounts.set(message.channel, count + 1);

  // Calculate processing latency (from message timestamp)
  if (message.timestamp) {
    const messageTime = parseInt(message.timestamp, 10) || new Date(message.timestamp).getTime();
    if (!isNaN(messageTime)) {
      const latency = Date.now() - messageTime;
      if (latency >= 0 && latency < 60000) { // Ignore unrealistic latencies
        stats.latencies.push(latency);
        // Keep only last 10000 latencies to avoid memory issues
        if (stats.latencies.length > 10000) {
          stats.latencies = stats.latencies.slice(-5000);
        }
      }
    }
  }
}

/**
 * Print statistics
 */
function printStats(): void {
  const now = Date.now();
  const windowDuration = (now - stats.windowStartTime) / 1000;
  const totalDuration = (now - stats.startTime) / 1000;

  const currentRate = windowDuration > 0 ? stats.messagesInWindow / windowDuration : 0;
  const avgRate = totalDuration > 0 ? stats.totalMessages / totalDuration : 0;

  // Calculate latency percentiles
  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const avgLatency = sortedLatencies.length > 0
    ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
    : 0;
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  // Channel distribution
  const channelStats = Array.from(stats.channelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  console.log('\n' + '─'.repeat(60));
  console.log(`[${WORKER_ID}] Statistics @ ${new Date().toLocaleTimeString()}`);
  console.log('─'.repeat(60));
  console.log(`  Total Messages:     ${stats.totalMessages.toLocaleString()}`);
  console.log(`  Current Rate:       ${currentRate.toFixed(1)} msg/s`);
  console.log(`  Average Rate:       ${avgRate.toFixed(1)} msg/s`);
  console.log(`  Channels Handled:   ${stats.channelCounts.size}`);
  console.log(`  Latency (avg/p50/p95/p99): ${avgLatency.toFixed(1)}/${p50}/${p95}/${p99} ms`);

  if (channelStats.length > 0) {
    console.log(`  Top Channels:`);
    for (const [channel, count] of channelStats) {
      const pct = ((count / stats.totalMessages) * 100).toFixed(1);
      console.log(`    ${channel}: ${count.toLocaleString()} (${pct}%)`);
    }
  }
  console.log('─'.repeat(60));

  // Reset window stats
  stats.messagesInWindow = 0;
  stats.windowStartTime = now;
}

/**
 * Consume messages from this worker's dedicated stream
 */
async function consumeStream(): Promise<void> {
  const streamKey = getWorkerStreamKey(WORKER_ID);
  let lastId = '$';

  console.log(`Started consuming stream: ${streamKey}`);

  // Start stats reporting
  const statsInterval = setInterval(printStats, STATS_INTERVAL);

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
            lastId = messageId;
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

  clearInterval(statsInterval);
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\nShutting down...');

  // Print final stats
  printStats();

  try {
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
  console.log('='.repeat(60));
  console.log('Worker with Statistics');
  console.log('='.repeat(60));
  console.log(`  Worker ID:      ${WORKER_ID}`);
  console.log(`  Stream:         ${getWorkerStreamKey(WORKER_ID)}`);
  console.log(`  Redis:          ${REDIS_URL}`);
  console.log(`  Stats Interval: ${STATS_INTERVAL}ms`);
  console.log('='.repeat(60));

  await registerWorker(redis, WORKER_ID);
  await consumeStream();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
