import { LoadTestConfig, LoadTestMetrics, UserMetrics } from './types.js';

/**
 * Calculate percentile value from a sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Metrics collector for load test results
 */
export class MetricsCollector {
  private userMetrics: Map<string, UserMetrics> = new Map();
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private config: LoadTestConfig;

  constructor(config: LoadTestConfig) {
    this.config = config;
  }

  /**
   * Start collecting metrics
   */
  start(): void {
    this.startTime = new Date();
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    this.endTime = new Date();
  }

  /**
   * Initialize metrics for a user
   */
  initUser(userId: string, channelName: string): void {
    this.userMetrics.set(userId, {
      userId,
      channelName,
      connectionTimeMs: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      latencies: [],
    });
  }

  /**
   * Record connection time for a user
   */
  recordConnectionTime(userId: string, timeMs: number): void {
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.connectionTimeMs = timeMs;
    }
  }

  /**
   * Record a message sent by a user
   */
  recordMessageSent(userId: string): void {
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.messagesSent++;
    }
  }

  /**
   * Record a message received by a user
   */
  recordMessageReceived(userId: string, latencyMs?: number): void {
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.messagesReceived++;
      if (latencyMs !== undefined && latencyMs >= 0) {
        metrics.latencies.push(latencyMs);
      }
    }
  }

  /**
   * Record an error for a user
   */
  recordError(userId: string): void {
    const metrics = this.userMetrics.get(userId);
    if (metrics) {
      metrics.errors++;
    }
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): LoadTestMetrics {
    const allMetrics = Array.from(this.userMetrics.values());

    // Calculate connection stats
    const connectionTimes = allMetrics
      .filter((m) => m.connectionTimeMs > 0)
      .map((m) => m.connectionTimeMs)
      .sort((a, b) => a - b);

    const successfulConnections = connectionTimes.length;
    const failedConnections = allMetrics.length - successfulConnections;

    // Calculate latency stats
    const allLatencies = allMetrics.flatMap((m) => m.latencies).sort((a, b) => a - b);

    // Calculate totals
    const totalMessagesSent = allMetrics.reduce((sum, m) => sum + m.messagesSent, 0);
    const totalMessagesReceived = allMetrics.reduce((sum, m) => sum + m.messagesReceived, 0);
    const totalErrors = allMetrics.reduce((sum, m) => sum + m.errors, 0);

    // Calculate duration
    const start = this.startTime || new Date();
    const end = this.endTime || new Date();
    const actualDurationSeconds = (end.getTime() - start.getTime()) / 1000;

    return {
      config: this.config,
      totalConnections: allMetrics.length,
      successfulConnections,
      failedConnections,
      totalMessagesSent,
      totalMessagesReceived,
      totalErrors,
      connectionTime: {
        min: connectionTimes.length > 0 ? connectionTimes[0] : 0,
        max: connectionTimes.length > 0 ? connectionTimes[connectionTimes.length - 1] : 0,
        avg:
          connectionTimes.length > 0
            ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
            : 0,
        p95: percentile(connectionTimes, 95),
        p99: percentile(connectionTimes, 99),
      },
      latency: {
        min: allLatencies.length > 0 ? allLatencies[0] : 0,
        max: allLatencies.length > 0 ? allLatencies[allLatencies.length - 1] : 0,
        avg:
          allLatencies.length > 0
            ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
            : 0,
        p95: percentile(allLatencies, 95),
        p99: percentile(allLatencies, 99),
      },
      messagesPerSecondSent:
        actualDurationSeconds > 0 ? totalMessagesSent / actualDurationSeconds : 0,
      messagesPerSecondReceived:
        actualDurationSeconds > 0 ? totalMessagesReceived / actualDurationSeconds : 0,
      actualDurationSeconds,
      startTime: start,
      endTime: end,
      userMetrics: allMetrics,
    };
  }

  /**
   * Print metrics to console in a formatted way
   */
  printMetrics(): void {
    const metrics = this.getMetrics();

    console.log('\n' + '='.repeat(60));
    console.log('LOAD TEST RESULTS');
    console.log('='.repeat(60));

    console.log('\n--- Configuration ---');
    console.log(`Channels: ${metrics.config.channelCount}`);
    console.log(`Users per channel: ${metrics.config.usersPerChannel}`);
    console.log(`Total users: ${metrics.config.channelCount * metrics.config.usersPerChannel}`);
    console.log(`Message size: ${metrics.config.messageSizeBytes} bytes`);
    console.log(`Message interval: ${metrics.config.messageIntervalMs}ms`);
    console.log(`Target duration: ${metrics.config.durationMs / 1000}s`);

    console.log('\n--- Connections ---');
    console.log(`Total attempted: ${metrics.totalConnections}`);
    console.log(`Successful: ${metrics.successfulConnections}`);
    console.log(`Failed: ${metrics.failedConnections}`);

    console.log('\n--- Connection Time (ms) ---');
    console.log(`Min: ${metrics.connectionTime.min.toFixed(2)}`);
    console.log(`Max: ${metrics.connectionTime.max.toFixed(2)}`);
    console.log(`Avg: ${metrics.connectionTime.avg.toFixed(2)}`);
    console.log(`P95: ${metrics.connectionTime.p95.toFixed(2)}`);
    console.log(`P99: ${metrics.connectionTime.p99.toFixed(2)}`);

    console.log('\n--- Messages ---');
    console.log(`Total sent: ${metrics.totalMessagesSent}`);
    console.log(`Total received: ${metrics.totalMessagesReceived}`);
    console.log(`Errors: ${metrics.totalErrors}`);
    console.log(`Sent/sec: ${metrics.messagesPerSecondSent.toFixed(2)}`);
    console.log(`Received/sec: ${metrics.messagesPerSecondReceived.toFixed(2)}`);

    console.log('\n--- Message Latency (ms) ---');
    console.log(`Min: ${metrics.latency.min.toFixed(2)}`);
    console.log(`Max: ${metrics.latency.max.toFixed(2)}`);
    console.log(`Avg: ${metrics.latency.avg.toFixed(2)}`);
    console.log(`P95: ${metrics.latency.p95.toFixed(2)}`);
    console.log(`P99: ${metrics.latency.p99.toFixed(2)}`);

    console.log('\n--- Duration ---');
    console.log(`Actual: ${metrics.actualDurationSeconds.toFixed(2)}s`);
    console.log(`Start: ${metrics.startTime.toISOString()}`);
    console.log(`End: ${metrics.endTime.toISOString()}`);

    console.log('\n' + '='.repeat(60));

    // Calculate expected vs actual
    const expectedMessages =
      metrics.config.channelCount *
      metrics.config.usersPerChannel *
      (metrics.config.durationMs / metrics.config.messageIntervalMs);
    const deliveryRate =
      expectedMessages > 0 ? (metrics.totalMessagesSent / expectedMessages) * 100 : 0;

    console.log('\n--- Summary ---');
    console.log(`Expected messages: ~${Math.floor(expectedMessages)}`);
    console.log(`Actual sent: ${metrics.totalMessagesSent}`);
    console.log(`Send rate: ${deliveryRate.toFixed(1)}%`);

    // Each message should be received by the other user in the channel
    const expectedReceived = metrics.totalMessagesSent;
    const receiveRate =
      expectedReceived > 0 ? (metrics.totalMessagesReceived / expectedReceived) * 100 : 0;
    console.log(`Expected received: ${expectedReceived}`);
    console.log(`Actual received: ${metrics.totalMessagesReceived}`);
    console.log(`Receive rate: ${receiveRate.toFixed(1)}%`);

    console.log('\n' + '='.repeat(60) + '\n');
  }
}
