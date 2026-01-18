/**
 * Metrics Collector - 指标收集器
 */

export interface Metrics {
  // 请求统计
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;

  // 延迟统计 (毫秒)
  latencies: number[];
  minLatency: number;
  maxLatency: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;

  // 吞吐量
  requestsPerSecond: number;
  bytesPerSecond: number;

  // 连接统计
  activeConnections: number;
  totalConnections: number;
  connectionErrors: number;

  // 时间
  startTime: number;
  elapsedTime: number;
}

export class MetricsCollector {
  private startTime: number = 0;
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private latencies: number[] = [];
  private totalBytes: number = 0;

  private activeConnections: number = 0;
  private totalConnections: number = 0;
  private connectionErrors: number = 0;

  start(): void {
    this.startTime = Date.now();
    this.reset();
  }

  reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.latencies = [];
    this.totalBytes = 0;
    this.activeConnections = 0;
    this.totalConnections = 0;
    this.connectionErrors = 0;
  }

  recordRequest(success: boolean, latencyMs: number, bytes: number = 0): void {
    this.totalRequests++;
    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }
    this.latencies.push(latencyMs);
    this.totalBytes += bytes;
  }

  recordConnection(success: boolean): void {
    this.totalConnections++;
    if (success) {
      this.activeConnections++;
    } else {
      this.connectionErrors++;
    }
  }

  recordDisconnection(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  getMetrics(): Metrics {
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);

    const percentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, index)];
    };

    const sum = this.latencies.reduce((a, b) => a + b, 0);

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,

      latencies: this.latencies,
      minLatency: sortedLatencies[0] || 0,
      maxLatency: sortedLatencies[sortedLatencies.length - 1] || 0,
      avgLatency: this.latencies.length > 0 ? sum / this.latencies.length : 0,
      p50Latency: percentile(sortedLatencies, 50),
      p95Latency: percentile(sortedLatencies, 95),
      p99Latency: percentile(sortedLatencies, 99),

      requestsPerSecond: elapsedTime > 0 ? this.totalRequests / elapsedTime : 0,
      bytesPerSecond: elapsedTime > 0 ? this.totalBytes / elapsedTime : 0,

      activeConnections: this.activeConnections,
      totalConnections: this.totalConnections,
      connectionErrors: this.connectionErrors,

      startTime: this.startTime,
      elapsedTime,
    };
  }

  printReport(label: string = 'Metrics'): void {
    const m = this.getMetrics();

    console.log('\n' + '─'.repeat(60));
    console.log(`📊 ${label}`);
    console.log('─'.repeat(60));

    console.log(`\n⏱️  Time: ${m.elapsedTime.toFixed(1)}s`);

    console.log(`\n📨 Requests:`);
    console.log(`   Total:      ${m.totalRequests}`);
    console.log(`   Successful: ${m.successfulRequests} (${((m.successfulRequests / m.totalRequests) * 100 || 0).toFixed(1)}%)`);
    console.log(`   Failed:     ${m.failedRequests} (${((m.failedRequests / m.totalRequests) * 100 || 0).toFixed(1)}%)`);
    console.log(`   RPS:        ${m.requestsPerSecond.toFixed(1)}`);

    console.log(`\n⚡ Latency (ms):`);
    console.log(`   Min:  ${m.minLatency.toFixed(1)}`);
    console.log(`   Avg:  ${m.avgLatency.toFixed(1)}`);
    console.log(`   P50:  ${m.p50Latency.toFixed(1)}`);
    console.log(`   P95:  ${m.p95Latency.toFixed(1)}`);
    console.log(`   P99:  ${m.p99Latency.toFixed(1)}`);
    console.log(`   Max:  ${m.maxLatency.toFixed(1)}`);

    if (m.totalConnections > 0) {
      console.log(`\n🔌 Connections:`);
      console.log(`   Active: ${m.activeConnections}`);
      console.log(`   Total:  ${m.totalConnections}`);
      console.log(`   Errors: ${m.connectionErrors}`);
    }

    console.log('─'.repeat(60));
  }

  getSnapshot(): Metrics {
    return this.getMetrics();
  }
}

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
