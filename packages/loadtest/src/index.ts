#!/usr/bin/env node

import { LoadTestConfig } from './types.js';
import { LoadTestRunner } from './load-test.js';

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<LoadTestConfig> {
  const args = process.argv.slice(2);
  const config: Partial<LoadTestConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--channels':
      case '-c':
        config.channelCount = parseInt(value, 10);
        i++;
        break;
      case '--users-per-channel':
      case '-u':
        config.usersPerChannel = parseInt(value, 10);
        i++;
        break;
      case '--message-size':
      case '-s':
        config.messageSizeBytes = parseInt(value, 10);
        i++;
        break;
      case '--interval':
      case '-i':
        config.messageIntervalMs = parseInt(value, 10);
        i++;
        break;
      case '--duration':
      case '-d':
        config.durationMs = parseInt(value, 10) * 1000; // Convert seconds to ms
        i++;
        break;
      case '--centrifugo-url':
        config.centrifugoUrl = value;
        i++;
        break;
      case '--api-url':
        config.apiUrl = value;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Centrifugo Load Test Tool

Usage: npm run loadtest -- [options]

Options:
  -c, --channels <n>          Number of channels (default: 100)
  -u, --users-per-channel <n> Users per channel (default: 2)
  -s, --message-size <n>      Message size in bytes (default: 1024)
  -i, --interval <n>          Message interval in ms (default: 100)
  -d, --duration <n>          Test duration in seconds (default: 60)
  --centrifugo-url <url>      Centrifugo WebSocket URL
                              (default: ws://localhost:8000/connection/websocket)
  --api-url <url>             Backend API URL
                              (default: http://localhost:8787)
  -h, --help                  Show this help message

Examples:
  # Run with default settings (100 channels, 2 users each, 1KB messages, 100ms interval, 60s)
  npm run loadtest

  # Run with custom settings
  npm run loadtest -- -c 50 -u 4 -d 30

  # Run against remote servers
  npm run loadtest -- --centrifugo-url wss://centrifugo.example.com/connection/websocket --api-url https://api.example.com
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Default configuration matching requirements:
  // - 100 channels
  // - 2 users per channel (200 total connections)
  // - 1KB messages
  // - 100ms interval
  // - 60 second duration
  const defaultConfig: LoadTestConfig = {
    channelCount: 100,
    usersPerChannel: 2,
    messageSizeBytes: 1024,
    messageIntervalMs: 100,
    durationMs: 60000,
    centrifugoUrl: 'ws://localhost:8000/connection/websocket',
    apiUrl: 'http://localhost:8787',
  };

  // Parse command line arguments
  const cliConfig = parseArgs();

  // Merge with defaults
  const config: LoadTestConfig = {
    ...defaultConfig,
    ...cliConfig,
  };

  // Validate configuration
  if (config.channelCount < 1) {
    console.error('Error: channelCount must be at least 1');
    process.exit(1);
  }
  if (config.usersPerChannel < 1) {
    console.error('Error: usersPerChannel must be at least 1');
    process.exit(1);
  }
  if (config.messageSizeBytes < 10) {
    console.error('Error: messageSizeBytes must be at least 10');
    process.exit(1);
  }
  if (config.messageIntervalMs < 10) {
    console.error('Error: messageIntervalMs must be at least 10');
    process.exit(1);
  }
  if (config.durationMs < 1000) {
    console.error('Error: durationMs must be at least 1000 (1 second)');
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('CENTRIFUGO LOAD TEST');
  console.log('='.repeat(60));
  console.log('');

  // Create and run the load test
  const runner = new LoadTestRunner(config);

  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n\nReceived shutdown signal, stopping test...');
    // The runner will clean up in the finally block
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await runner.run();
    process.exit(0);
  } catch (error) {
    console.error('Load test failed:', error);
    process.exit(1);
  }
}

// Run main
main();
