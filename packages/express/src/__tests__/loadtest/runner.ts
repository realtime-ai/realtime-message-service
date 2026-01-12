#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Load Test Runner for Express API
 * Performs HTTP-based load testing with detailed metrics
 */

import http from 'http';

interface LoadTestConfig {
  baseUrl: string;
  duration: number; // seconds
  concurrency: number;
  rampUp: number; // seconds
  testName: string;
}

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  responseTimes: number[];
  errors: Map<string, number>;
  startTime: number;
  endTime: number;
}

interface TestResult {
  testName: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  errors: Record<string, number>;
}

class LoadTester {
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimes: [],
    errors: new Map(),
    startTime: 0,
    endTime: 0,
  };

  private running = false;
  private userCounter = 0;

  constructor(private config: LoadTestConfig) {}

  private async makeRequest(
    method: string,
    path: string,
    body?: object
  ): Promise<{ success: boolean; responseTime: number; statusCode: number; error?: string }> {
    const startTime = performance.now();
    const url = new URL(path, this.config.baseUrl);

    return new Promise((resolve) => {
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const responseTime = performance.now() - startTime;
          const success = res.statusCode! >= 200 && res.statusCode! < 400;
          resolve({
            success,
            responseTime,
            statusCode: res.statusCode!,
            error: success ? undefined : `HTTP ${res.statusCode}`,
          });
        });
      });

      req.on('error', (err) => {
        const responseTime = performance.now() - startTime;
        resolve({
          success: false,
          responseTime,
          statusCode: 0,
          error: err.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const responseTime = performance.now() - startTime;
        resolve({
          success: false,
          responseTime,
          statusCode: 0,
          error: 'Timeout',
        });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  private async runWorker(): Promise<void> {
    while (this.running) {
      const userId = ++this.userCounter;
      const userName = `LoadTestUser_${userId}_${Date.now()}`;

      // Test login endpoint
      const result = await this.makeRequest('POST', '/auth/login', { name: userName });

      this.metrics.totalRequests++;

      if (result.success) {
        this.metrics.successfulRequests++;
        this.metrics.responseTimes.push(result.responseTime);
      } else {
        this.metrics.failedRequests++;
        const errorKey = result.error || 'Unknown error';
        this.metrics.errors.set(errorKey, (this.metrics.errors.get(errorKey) || 0) + 1);
      }

      // No delay - test maximum throughput
    }
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  async run(): Promise<TestResult> {
    console.log(`\n🚀 Starting load test: ${this.config.testName}`);
    console.log(`   Duration: ${this.config.duration}s`);
    console.log(`   Concurrency: ${this.config.concurrency}`);
    console.log(`   Target: ${this.config.baseUrl}`);
    console.log('');

    this.running = true;
    this.metrics.startTime = Date.now();

    // Start workers with ramp-up
    const workers: Promise<void>[] = [];
    const rampUpDelay = (this.config.rampUp * 1000) / this.config.concurrency;

    for (let i = 0; i < this.config.concurrency; i++) {
      await new Promise((resolve) => setTimeout(resolve, rampUpDelay));
      workers.push(this.runWorker());
      process.stdout.write(`\r   Ramping up: ${i + 1}/${this.config.concurrency} workers`);
    }

    console.log('\n   Running test...\n');

    // Progress reporting
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - this.metrics.startTime) / 1000;
      const rps = this.metrics.totalRequests / elapsed;
      process.stdout.write(
        `\r   Progress: ${Math.round(elapsed)}s/${this.config.duration}s | ` +
          `Requests: ${this.metrics.totalRequests} | ` +
          `RPS: ${rps.toFixed(1)} | ` +
          `Errors: ${this.metrics.failedRequests}`
      );
    }, 1000);

    // Wait for test duration
    await new Promise((resolve) => setTimeout(resolve, this.config.duration * 1000));

    this.running = false;
    this.metrics.endTime = Date.now();

    clearInterval(progressInterval);
    console.log('\n');

    // Wait for all workers to finish
    await Promise.all(workers);

    // Calculate results
    const sortedTimes = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;

    const result: TestResult = {
      testName: this.config.testName,
      duration,
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      requestsPerSecond: this.metrics.totalRequests / duration,
      avgResponseTime:
        sortedTimes.length > 0 ? sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length : 0,
      minResponseTime: sortedTimes.length > 0 ? sortedTimes[0] : 0,
      maxResponseTime: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0,
      p50ResponseTime: this.calculatePercentile(sortedTimes, 50),
      p95ResponseTime: this.calculatePercentile(sortedTimes, 95),
      p99ResponseTime: this.calculatePercentile(sortedTimes, 99),
      errorRate:
        this.metrics.totalRequests > 0
          ? this.metrics.failedRequests / this.metrics.totalRequests
          : 0,
      errors: Object.fromEntries(this.metrics.errors),
    };

    return result;
  }
}

function printResults(result: TestResult): void {
  console.log('═'.repeat(60));
  console.log(`  📊 LOAD TEST RESULTS: ${result.testName}`);
  console.log('═'.repeat(60));
  console.log('');
  console.log('  📈 Throughput');
  console.log('  ─'.repeat(30));
  console.log(`  Total Requests:      ${result.totalRequests.toLocaleString()}`);
  console.log(`  Successful:          ${result.successfulRequests.toLocaleString()}`);
  console.log(`  Failed:              ${result.failedRequests.toLocaleString()}`);
  console.log(`  Requests/Second:     ${result.requestsPerSecond.toFixed(2)} RPS`);
  console.log(`  Test Duration:       ${result.duration.toFixed(2)}s`);
  console.log('');
  console.log('  ⏱️  Response Times');
  console.log('  ─'.repeat(30));
  console.log(`  Average:             ${result.avgResponseTime.toFixed(2)} ms`);
  console.log(`  Min:                 ${result.minResponseTime.toFixed(2)} ms`);
  console.log(`  Max:                 ${result.maxResponseTime.toFixed(2)} ms`);
  console.log(`  P50 (Median):        ${result.p50ResponseTime.toFixed(2)} ms`);
  console.log(`  P95:                 ${result.p95ResponseTime.toFixed(2)} ms`);
  console.log(`  P99:                 ${result.p99ResponseTime.toFixed(2)} ms`);
  console.log('');
  console.log('  ❌ Error Rate');
  console.log('  ─'.repeat(30));
  console.log(`  Error Rate:          ${(result.errorRate * 100).toFixed(3)}%`);

  if (Object.keys(result.errors).length > 0) {
    console.log('  Error Breakdown:');
    for (const [errorKey, count] of Object.entries(result.errors)) {
      console.log(`    - ${errorKey}: ${count}`);
    }
  }

  console.log('');
  console.log('═'.repeat(60));

  // Pass/Fail assessment
  const passed =
    result.errorRate < 0.01 && // < 1% error rate
    result.p95ResponseTime < 200 && // P95 < 200ms
    result.requestsPerSecond > 100; // > 100 RPS

  if (passed) {
    console.log('  ✅ TEST PASSED - All targets met');
  } else {
    console.log('  ❌ TEST FAILED - Some targets not met');
    if (result.errorRate >= 0.01) {
      console.log(`     - Error rate ${(result.errorRate * 100).toFixed(3)}% >= 1%`);
    }
    if (result.p95ResponseTime >= 200) {
      console.log(`     - P95 response time ${result.p95ResponseTime.toFixed(2)}ms >= 200ms`);
    }
    if (result.requestsPerSecond <= 100) {
      console.log(`     - RPS ${result.requestsPerSecond.toFixed(2)} <= 100`);
    }
  }
  console.log('═'.repeat(60));
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const baseUrl = process.env.API_URL || 'http://localhost:8787';

  let config: LoadTestConfig;

  if (args.includes('--quick')) {
    config = {
      baseUrl,
      duration: 10,
      concurrency: 10,
      rampUp: 2,
      testName: 'Quick Test (10s, 10 concurrent)',
    };
  } else if (args.includes('--full')) {
    config = {
      baseUrl,
      duration: 60,
      concurrency: 50,
      rampUp: 10,
      testName: 'Full Test (60s, 50 concurrent)',
    };
  } else if (args.includes('--stress')) {
    config = {
      baseUrl,
      duration: 120,
      concurrency: 100,
      rampUp: 20,
      testName: 'Stress Test (120s, 100 concurrent)',
    };
  } else if (args.includes('--extreme')) {
    config = {
      baseUrl,
      duration: 60,
      concurrency: 300,
      rampUp: 10,
      testName: 'Extreme Test (60s, 300 concurrent)',
    };
  } else {
    // Default to quick test
    config = {
      baseUrl,
      duration: 10,
      concurrency: 10,
      rampUp: 2,
      testName: 'Quick Test (10s, 10 concurrent)',
    };
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🔥 EXPRESS API LOAD TESTER');
  console.log('═'.repeat(60));

  // Check if server is running
  console.log(`\n  Checking server at ${baseUrl}...`);
  try {
    const tester = new LoadTester({
      ...config,
      duration: 1,
      concurrency: 1,
      rampUp: 0,
      testName: 'Connection Test',
    });
    const healthCheck = await tester.run();
    if (healthCheck.failedRequests > 0) {
      console.log('\n  ❌ Server is not responding. Make sure the server is running.');
      console.log(`     Start with: npm run dev\n`);
      process.exit(1);
    }
    console.log('  ✅ Server is responding\n');
  } catch {
    console.log('\n  ❌ Could not connect to server');
    process.exit(1);
  }

  const tester = new LoadTester(config);
  const result = await tester.run();
  printResults(result);

  // Exit with error code if test failed
  const passed =
    result.errorRate < 0.01 && result.p95ResponseTime < 200 && result.requestsPerSecond > 100;

  process.exit(passed ? 0 : 1);
}

main().catch(console.error);
