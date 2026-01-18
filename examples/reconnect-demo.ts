/**
 * WebSocket Reconnection Demo
 *
 * Demonstrates the ReconnectClient with automatic reconnection handling
 * and statistics monitoring.
 *
 * Usage:
 *   GATEWAY_URL=ws://localhost:8000/connection/websocket tsx examples/reconnect-demo.ts
 */

import { ReconnectClient, createReconnectClient } from '../lib/reconnect-client.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:8000/connection/websocket';
const CHANNEL = process.env.CHANNEL || 'chat';
const USER_NAME = process.env.USER_NAME || 'ReconnectDemo';

// Stats display interval
const STATS_INTERVAL_MS = 5000;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(2)}h`;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('WebSocket Reconnection Demo');
  console.log('='.repeat(60));
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Channel: ${CHANNEL}`);
  console.log(`User Name: ${USER_NAME}`);
  console.log('='.repeat(60));
  console.log('');

  // Create client with reconnection configuration
  const client = createReconnectClient({
    url: GATEWAY_URL,
    data: { name: USER_NAME },
    minReconnectDelay: 500,      // Start with 500ms delay
    maxReconnectDelay: 30000,    // Max 30 seconds delay
    maxServerPingDelay: 10000,   // Server ping timeout
    debug: true,                 // Enable debug logging
  });

  // Set up event handlers
  client.on('connected', (ctx) => {
    console.log(`\n[EVENT] Connected: clientId=${ctx.clientId}, transport=${ctx.transport}`);
  });

  client.on('disconnected', (ctx) => {
    console.log(`\n[EVENT] Disconnected: reason=${ctx.reason}, code=${ctx.code}, reconnect=${ctx.reconnect}`);
  });

  client.on('reconnecting', (ctx) => {
    console.log(`\n[EVENT] Reconnecting: attempt=${ctx.attempt}, delay=${ctx.delay}ms`);
  });

  client.on('reconnected', (ctx) => {
    console.log(`\n[EVENT] Reconnected: clientId=${ctx.clientId}, after ${ctx.attempt} attempts`);
  });

  client.on('error', (ctx) => {
    console.error(`\n[EVENT] Error:`, ctx.error.message);
  });

  client.on('stateChange', (ctx) => {
    console.log(`\n[EVENT] State changed: ${ctx.oldState} -> ${ctx.newState}`);
  });

  // Connect
  console.log('Connecting...\n');
  client.connect();

  // Wait for connection
  await new Promise<void>((resolve) => {
    const checkConnection = () => {
      if (client.isConnected()) {
        resolve();
      } else {
        setTimeout(checkConnection, 100);
      }
    };
    checkConnection();
  });

  // Subscribe to channel
  console.log(`\nSubscribing to channel: ${CHANNEL}`);
  const subscription = client.subscribe(CHANNEL, {
    onSubscribed: (ctx) => {
      console.log(`[SUBSCRIPTION] Subscribed to ${CHANNEL}`);
    },
    onPublication: (ctx) => {
      const data = ctx.data as { text?: string; userName?: string };
      console.log(`[MESSAGE] ${data.userName || 'Unknown'}: ${data.text || JSON.stringify(ctx.data)}`);
    },
    onError: (ctx) => {
      console.error(`[SUBSCRIPTION ERROR] ${ctx.error.message}`);
    },
  });

  // Periodic stats display
  const statsInterval = setInterval(() => {
    const stats = client.getStats();
    console.log('\n' + '-'.repeat(40));
    console.log('Connection Statistics:');
    console.log(`  State:             ${stats.state}`);
    console.log(`  Connect Attempts:  ${stats.connectAttempts}`);
    console.log(`  Connect Success:   ${stats.connectSuccess}`);
    console.log(`  Connect Failed:    ${stats.connectFailed}`);
    console.log(`  Reconnect Count:   ${stats.reconnectCount}`);
    console.log(`  Uptime:            ${formatDuration(stats.uptimeSeconds)}`);
    if (stats.lastDisconnectReason) {
      console.log(`  Last Disconnect:   ${stats.lastDisconnectReason} (code: ${stats.lastDisconnectCode})`);
    }
    console.log('-'.repeat(40) + '\n');
  }, STATS_INTERVAL_MS);

  // Send periodic messages
  let messageCount = 0;
  const messageInterval = setInterval(async () => {
    if (client.isConnected()) {
      messageCount++;
      try {
        await subscription.publish({
          text: `Hello from ReconnectDemo (#${messageCount})`,
          timestamp: Date.now(),
        });
        console.log(`[SENT] Message #${messageCount}`);
      } catch (err) {
        console.error(`[SEND ERROR] Failed to send message #${messageCount}:`, (err as Error).message);
      }
    }
  }, 10000);

  // Handle shutdown
  const shutdown = () => {
    console.log('\n\nShutting down...');
    clearInterval(statsInterval);
    clearInterval(messageInterval);

    const finalStats = client.getStats();
    console.log('\n' + '='.repeat(60));
    console.log('Final Statistics:');
    console.log(`  Total Connect Attempts: ${finalStats.connectAttempts}`);
    console.log(`  Successful Connections: ${finalStats.connectSuccess}`);
    console.log(`  Failed Connections:     ${finalStats.connectFailed}`);
    console.log(`  Reconnections:          ${finalStats.reconnectCount}`);
    console.log(`  Total Uptime:           ${formatDuration(finalStats.uptimeSeconds)}`);
    console.log('='.repeat(60));

    client.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('\nDemo running. Press Ctrl+C to stop.');
  console.log('Try stopping and starting the gateway to test reconnection.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
