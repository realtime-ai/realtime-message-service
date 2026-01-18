/**
 * Load Test for Sticky Channel Routing
 *
 * Simulates high-volume message publishing to test the routing performance
 *
 * Configuration:
 * - 100 channels
 * - 10 messages/second per channel
 * - Total: 1000 messages/second
 * - Duration: 60 seconds
 * - Total messages: 60,000
 */

import crypto from 'crypto';

// Configuration
const CALLBACK_SERVICE_URL = process.env.CALLBACK_SERVICE_URL || 'http://localhost:3000';
const NUM_CHANNELS = parseInt(process.env.NUM_CHANNELS || '100', 10);
const MESSAGES_PER_CHANNEL_PER_SECOND = parseInt(process.env.MSG_PER_SEC || '10', 10);
const DURATION_SECONDS = parseInt(process.env.DURATION || '60', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);

// Statistics
let totalSent = 0;
let totalSuccess = 0;
let totalFailed = 0;
let totalLatency = 0;
let minLatency = Infinity;
let maxLatency = 0;
const latencies: number[] = [];

// Track per-channel stats
const channelStats = new Map<string, { sent: number; success: number }>();

/**
 * Generate a random JWT token for authentication
 */
function generateToken(userId: string): string {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY || 'your-secret-key-change-in-production';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Simulate a publish request
 */
async function publishMessage(channel: string, userId: string, text: string): Promise<void> {
  const start = Date.now();

  try {
    const response = await fetch(`${CALLBACK_SERVICE_URL}/centrifugo/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: `client-${userId}`,
        transport: 'websocket',
        protocol: 'json',
        encoding: 'json',
        user: userId,
        channel,
        data: { text },
        info: { name: `User-${userId}` },
      }),
    });

    const latency = Date.now() - start;
    latencies.push(latency);
    totalLatency += latency;
    minLatency = Math.min(minLatency, latency);
    maxLatency = Math.max(maxLatency, latency);

    if (response.ok) {
      totalSuccess++;
      const stats = channelStats.get(channel) || { sent: 0, success: 0 };
      stats.success++;
      channelStats.set(channel, stats);
    } else {
      totalFailed++;
      console.error(`Failed to publish to ${channel}: ${response.status}`);
    }
  } catch (error) {
    totalFailed++;
    console.error(`Error publishing to ${channel}:`, error);
  }

  totalSent++;
}

/**
 * Send messages for a single channel
 */
async function channelWorker(channelId: number, stopSignal: { stop: boolean }): Promise<void> {
  const channel = `chat:room-${channelId}`;
  const userId = `user-${channelId}`;

  channelStats.set(channel, { sent: 0, success: 0 });

  const intervalMs = 1000 / MESSAGES_PER_CHANNEL_PER_SECOND;
  let messageCount = 0;

  while (!stopSignal.stop) {
    const batchPromises: Promise<void>[] = [];

    for (let i = 0; i < BATCH_SIZE && !stopSignal.stop; i++) {
      const text = `Message ${messageCount++} from ${channel}`;
      const stats = channelStats.get(channel)!;
      stats.sent++;

      batchPromises.push(publishMessage(channel, userId, text));

      // Wait between messages in batch
      if (i < BATCH_SIZE - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    await Promise.all(batchPromises);
  }
}

/**
 * Print statistics
 */
function printStats(elapsed: number): void {
  const avgLatency = totalSent > 0 ? totalLatency / totalSent : 0;
  const successRate = totalSent > 0 ? (totalSuccess / totalSent) * 100 : 0;
  const throughput = totalSuccess / (elapsed / 1000);

  // Calculate percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  console.log('\n' + '='.repeat(70));
  console.log('Load Test Statistics');
  console.log('='.repeat(70));
  console.log(`Duration:           ${(elapsed / 1000).toFixed(2)}s`);
  console.log(`Total Sent:         ${totalSent.toLocaleString()}`);
  console.log(`Total Success:      ${totalSuccess.toLocaleString()}`);
  console.log(`Total Failed:       ${totalFailed.toLocaleString()}`);
  console.log(`Success Rate:       ${successRate.toFixed(2)}%`);
  console.log(`Throughput:         ${throughput.toFixed(2)} msg/s`);
  console.log('');
  console.log('Latency Statistics:');
  console.log(`  Min:              ${minLatency.toFixed(2)}ms`);
  console.log(`  Max:              ${maxLatency.toFixed(2)}ms`);
  console.log(`  Average:          ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50:              ${p50.toFixed(2)}ms`);
  console.log(`  P95:              ${p95.toFixed(2)}ms`);
  console.log(`  P99:              ${p99.toFixed(2)}ms`);
  console.log('='.repeat(70));
}

/**
 * Print real-time progress
 */
function printProgress(elapsed: number): void {
  const throughput = totalSuccess / (elapsed / 1000);
  const successRate = totalSent > 0 ? (totalSuccess / totalSent) * 100 : 0;
  const avgLatency = totalSent > 0 ? totalLatency / totalSent : 0;

  process.stdout.write(
    `\r[${Math.floor(elapsed / 1000)}s] ` +
    `Sent: ${totalSent.toLocaleString()} | ` +
    `Success: ${totalSuccess.toLocaleString()} | ` +
    `Failed: ${totalFailed} | ` +
    `Rate: ${successRate.toFixed(1)}% | ` +
    `Throughput: ${throughput.toFixed(0)} msg/s | ` +
    `Avg Latency: ${avgLatency.toFixed(1)}ms`
  );
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('Sticky Channel Load Test');
  console.log('='.repeat(70));
  console.log(`Target:             ${CALLBACK_SERVICE_URL}`);
  console.log(`Channels:           ${NUM_CHANNELS}`);
  console.log(`Messages/sec:       ${MESSAGES_PER_CHANNEL_PER_SECOND} per channel`);
  console.log(`Total Rate:         ${NUM_CHANNELS * MESSAGES_PER_CHANNEL_PER_SECOND} msg/s`);
  console.log(`Duration:           ${DURATION_SECONDS}s`);
  console.log(`Expected Total:     ${NUM_CHANNELS * MESSAGES_PER_CHANNEL_PER_SECOND * DURATION_SECONDS} messages`);
  console.log('='.repeat(70));
  console.log('Starting in 3 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  const startTime = Date.now();
  const stopSignal = { stop: false };

  // Start channel workers
  const workers = [];
  for (let i = 0; i < NUM_CHANNELS; i++) {
    workers.push(channelWorker(i, stopSignal));
  }

  // Progress reporting
  const progressInterval = setInterval(() => {
    printProgress(Date.now() - startTime);
  }, 1000);

  // Stop after duration
  setTimeout(() => {
    stopSignal.stop = true;
    clearInterval(progressInterval);
  }, DURATION_SECONDS * 1000);

  // Wait for all workers to finish
  await Promise.all(workers);

  const endTime = Date.now();
  const elapsed = endTime - startTime;

  console.log('\n\nTest completed. Waiting for final requests to finish...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));

  printStats(elapsed);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
