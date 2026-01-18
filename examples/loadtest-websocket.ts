/**
 * WebSocket Load Test for realtime-message-gateway
 *
 * Uses centrifuge-js client to test WebSocket connections, subscriptions, and publishing.
 *
 * Configuration via environment variables:
 * - GATEWAY_URL: WebSocket URL (default: ws://localhost:8000/connection/websocket)
 * - NUM_CLIENTS: Number of concurrent WebSocket connections (default: 100)
 * - NUM_CHANNELS: Number of channels to distribute across (default: 10)
 * - MESSAGES_PER_CLIENT: Messages each client publishes (default: 100)
 * - MESSAGE_INTERVAL_MS: Interval between messages per client (default: 100)
 */

import { Centrifuge } from 'centrifuge';
import WebSocket from 'ws';

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:8000/connection/websocket';
const NUM_CLIENTS = parseInt(process.env.NUM_CLIENTS || '100', 10);
const NUM_CHANNELS = parseInt(process.env.NUM_CHANNELS || '10', 10);
const MESSAGES_PER_CLIENT = parseInt(process.env.MESSAGES_PER_CLIENT || '100', 10);
const MESSAGE_INTERVAL_MS = parseInt(process.env.MESSAGE_INTERVAL_MS || '100', 10);

// Statistics
interface Stats {
  connectAttempts: number;
  connectSuccess: number;
  connectFailed: number;
  subscribeSuccess: number;
  subscribeFailed: number;
  publishAttempts: number;
  publishSuccess: number;
  publishFailed: number;
  messagesReceived: number;
  latencies: number[];
}

const stats: Stats = {
  connectAttempts: 0,
  connectSuccess: 0,
  connectFailed: 0,
  subscribeSuccess: 0,
  subscribeFailed: 0,
  publishAttempts: 0,
  publishSuccess: 0,
  publishFailed: 0,
  messagesReceived: 0,
  latencies: [],
};

// Track active clients
const clients: Centrifuge[] = [];

/**
 * Create a single client that connects, subscribes, and publishes messages
 */
async function createClient(clientId: number): Promise<void> {
  const channelId = clientId % NUM_CHANNELS;
  const channel = `chat:room-${channelId}`;

  stats.connectAttempts++;

  return new Promise((resolve, reject) => {
    const centrifuge = new Centrifuge(GATEWAY_URL, {
      websocket: WebSocket as any,
      data: { name: `LoadTestUser-${clientId}` },
    });

    let connected = false;
    let subscribed = false;
    let messagesSent = 0;
    let publishInterval: NodeJS.Timeout | null = null;

    // Connection events
    centrifuge.on('connected', (ctx) => {
      connected = true;
      stats.connectSuccess++;

      // Subscribe to channel
      const sub = centrifuge.newSubscription(channel);

      sub.on('subscribed', () => {
        subscribed = true;
        stats.subscribeSuccess++;

        // Start publishing messages
        publishInterval = setInterval(async () => {
          if (messagesSent >= MESSAGES_PER_CLIENT) {
            if (publishInterval) clearInterval(publishInterval);
            return;
          }

          const startTime = Date.now();
          stats.publishAttempts++;

          try {
            await sub.publish({
              text: `Message ${messagesSent} from client ${clientId}`,
              timestamp: startTime,
            });
            const latency = Date.now() - startTime;
            stats.latencies.push(latency);
            stats.publishSuccess++;
          } catch (err) {
            stats.publishFailed++;
          }

          messagesSent++;

          if (messagesSent >= MESSAGES_PER_CLIENT) {
            if (publishInterval) clearInterval(publishInterval);
            resolve();
          }
        }, MESSAGE_INTERVAL_MS);
      });

      sub.on('publication', (ctx) => {
        stats.messagesReceived++;
      });

      sub.on('error', (ctx) => {
        stats.subscribeFailed++;
        if (publishInterval) clearInterval(publishInterval);
        reject(new Error(`Subscribe error: ${ctx.error?.message}`));
      });

      sub.subscribe();
    });

    centrifuge.on('error', (ctx) => {
      if (!connected) {
        stats.connectFailed++;
        reject(new Error(`Connect error: ${ctx.error?.message}`));
      }
    });

    centrifuge.on('disconnected', (ctx) => {
      if (publishInterval) clearInterval(publishInterval);
      if (!connected) {
        stats.connectFailed++;
        reject(new Error(`Disconnected: ${ctx.reason}`));
      }
    });

    clients.push(centrifuge);
    centrifuge.connect();

    // Timeout for connection
    setTimeout(() => {
      if (!connected) {
        stats.connectFailed++;
        centrifuge.disconnect();
        reject(new Error('Connection timeout'));
      }
    }, 10000);
  });
}

/**
 * Print statistics
 */
function printStats(elapsed: number): void {
  const latencies = stats.latencies.sort((a, b) => a - b);
  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  const throughput = stats.publishSuccess / (elapsed / 1000);
  const successRate = stats.publishAttempts > 0
    ? (stats.publishSuccess / stats.publishAttempts) * 100
    : 0;

  console.log('\n' + '='.repeat(70));
  console.log('WebSocket Load Test Results');
  console.log('='.repeat(70));
  console.log(`Duration:              ${(elapsed / 1000).toFixed(2)}s`);
  console.log('');
  console.log('Connection Statistics:');
  console.log(`  Connect Attempts:    ${stats.connectAttempts}`);
  console.log(`  Connect Success:     ${stats.connectSuccess}`);
  console.log(`  Connect Failed:      ${stats.connectFailed}`);
  console.log(`  Subscribe Success:   ${stats.subscribeSuccess}`);
  console.log(`  Subscribe Failed:    ${stats.subscribeFailed}`);
  console.log('');
  console.log('Message Statistics:');
  console.log(`  Publish Attempts:    ${stats.publishAttempts.toLocaleString()}`);
  console.log(`  Publish Success:     ${stats.publishSuccess.toLocaleString()}`);
  console.log(`  Publish Failed:      ${stats.publishFailed.toLocaleString()}`);
  console.log(`  Messages Received:   ${stats.messagesReceived.toLocaleString()}`);
  console.log(`  Success Rate:        ${successRate.toFixed(2)}%`);
  console.log(`  Throughput:          ${throughput.toFixed(2)} msg/s`);
  console.log('');
  console.log('Latency Statistics (publish round-trip):');
  console.log(`  Min:                 ${minLatency.toFixed(2)}ms`);
  console.log(`  Max:                 ${maxLatency.toFixed(2)}ms`);
  console.log(`  Average:             ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50:                 ${p50.toFixed(2)}ms`);
  console.log(`  P95:                 ${p95.toFixed(2)}ms`);
  console.log(`  P99:                 ${p99.toFixed(2)}ms`);
  console.log('='.repeat(70));
}

/**
 * Print real-time progress
 */
function printProgress(): void {
  const successRate = stats.publishAttempts > 0
    ? (stats.publishSuccess / stats.publishAttempts) * 100
    : 0;
  const avgLatency = stats.latencies.length > 0
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
    : 0;

  process.stdout.write(
    `\rConnected: ${stats.connectSuccess}/${NUM_CLIENTS} | ` +
    `Published: ${stats.publishSuccess.toLocaleString()} | ` +
    `Received: ${stats.messagesReceived.toLocaleString()} | ` +
    `Success: ${successRate.toFixed(1)}% | ` +
    `Avg Latency: ${avgLatency.toFixed(1)}ms   `
  );
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('WebSocket Load Test for realtime-message-gateway');
  console.log('='.repeat(70));
  console.log(`Gateway URL:           ${GATEWAY_URL}`);
  console.log(`Number of Clients:     ${NUM_CLIENTS}`);
  console.log(`Number of Channels:    ${NUM_CHANNELS}`);
  console.log(`Messages per Client:   ${MESSAGES_PER_CLIENT}`);
  console.log(`Message Interval:      ${MESSAGE_INTERVAL_MS}ms`);
  console.log(`Expected Total:        ${NUM_CLIENTS * MESSAGES_PER_CLIENT} messages`);
  console.log('='.repeat(70));
  console.log('Starting in 3 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  const startTime = Date.now();

  // Progress reporting
  const progressInterval = setInterval(printProgress, 500);

  // Create clients in batches to avoid overwhelming the server
  const BATCH_SIZE = 10;
  const clientPromises: Promise<void>[] = [];

  for (let i = 0; i < NUM_CLIENTS; i += BATCH_SIZE) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH_SIZE, NUM_CLIENTS); j++) {
      batch.push(
        createClient(j).catch(err => {
          // Silently handle individual client errors
        })
      );
    }
    clientPromises.push(...batch);

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Wait for all clients to finish
  await Promise.all(clientPromises);

  // Wait a bit for final messages
  await new Promise(resolve => setTimeout(resolve, 2000));

  clearInterval(progressInterval);

  const elapsed = Date.now() - startTime;
  printStats(elapsed);

  // Cleanup
  console.log('\nDisconnecting clients...');
  for (const client of clients) {
    client.disconnect();
  }

  console.log('Done.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
