/**
 * Load Test Runner - 压测主入口
 *
 * 运行方式:
 *   npx tsx examples/loadtest/index.ts [模式]
 *
 * 模式:
 *   publish   - 消息发布压测
 *   websocket - WebSocket 连接压测
 *   all       - 全部压测 (默认)
 *
 * 环境变量:
 *   CALLBACK_URL      - Callback 服务地址 (默认: http://localhost:3000)
 *   CENTRIFUGO_WS_URL - Centrifugo WebSocket 地址 (默认: ws://localhost:8000/connection/websocket)
 *   DURATION          - 测试持续时间秒 (默认: 60)
 *   RAMP_UP           - 爬坡时间秒 (默认: 10)
 *   PUBLISH_RPS       - 每秒发布消息数 (默认: 100)
 *   NUM_CHANNELS      - 频道数量 (默认: 10)
 *   MESSAGE_SIZE      - 消息大小字节 (默认: 256)
 *   NUM_CONNECTIONS   - WebSocket 连接数 (默认: 100)
 *   CONN_PER_SEC      - 每秒建立连接数 (默认: 10)
 */

import { defaultConfig, printConfig, type LoadTestConfig } from './config.js';
import { MetricsCollector } from './metrics.js';
import { runPublishLoadTest, runBatchPublishLoadTest } from './publisher.js';
import { runWebSocketLoadTest, closeAllConnections } from './websocket.js';

type TestMode = 'publish' | 'websocket' | 'all';

const publishMetrics = new MetricsCollector();
const wsMetrics = new MetricsCollector();

let reportTimer: NodeJS.Timeout | null = null;

/**
 * 启动定时报告
 */
function startReporting(config: LoadTestConfig): void {
  reportTimer = setInterval(() => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Real-time Metrics');
    console.log('═'.repeat(60));

    const pm = publishMetrics.getMetrics();
    if (pm.totalRequests > 0) {
      console.log(`\n📨 Publish:`);
      console.log(`   Requests: ${pm.totalRequests} (${pm.successfulRequests} ok, ${pm.failedRequests} failed)`);
      console.log(`   RPS: ${pm.requestsPerSecond.toFixed(1)}`);
      console.log(`   Latency: avg=${pm.avgLatency.toFixed(1)}ms, p95=${pm.p95Latency.toFixed(1)}ms`);
    }

    const wm = wsMetrics.getMetrics();
    if (wm.totalConnections > 0) {
      console.log(`\n🔌 WebSocket:`);
      console.log(`   Connections: ${wm.activeConnections} active, ${wm.connectionErrors} errors`);
      console.log(`   Connect Latency: avg=${wm.avgLatency.toFixed(1)}ms, p95=${wm.p95Latency.toFixed(1)}ms`);
    }

    console.log('═'.repeat(60));
  }, config.reportInterval * 1000);
}

/**
 * 停止报告
 */
function stopReporting(): void {
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
  }
}

/**
 * 运行消息发布压测
 */
async function runPublish(config: LoadTestConfig): Promise<void> {
  publishMetrics.start();

  if (config.publishRps > 500) {
    // 高 RPS 使用批量模式
    await runBatchPublishLoadTest(config, publishMetrics);
  } else {
    await runPublishLoadTest(config, publishMetrics);
  }

  publishMetrics.printReport('Publish Load Test Results');
}

/**
 * 运行 WebSocket 压测
 */
async function runWebSocket(config: LoadTestConfig): Promise<void> {
  wsMetrics.start();

  await runWebSocketLoadTest(config, wsMetrics);

  wsMetrics.printReport('WebSocket Load Test Results');
}

/**
 * 打印最终报告
 */
function printFinalReport(): void {
  console.log('\n');
  console.log('╔'.padEnd(59, '═') + '╗');
  console.log('║' + '  📋 FINAL LOAD TEST REPORT'.padEnd(58) + '║');
  console.log('╠'.padEnd(59, '═') + '╣');

  const pm = publishMetrics.getMetrics();
  if (pm.totalRequests > 0) {
    console.log('║' + '  📨 PUBLISH TEST'.padEnd(58) + '║');
    console.log('║' + `     Total Requests:  ${pm.totalRequests}`.padEnd(58) + '║');
    console.log('║' + `     Success Rate:    ${((pm.successfulRequests / pm.totalRequests) * 100).toFixed(2)}%`.padEnd(58) + '║');
    console.log('║' + `     Throughput:      ${pm.requestsPerSecond.toFixed(1)} req/s`.padEnd(58) + '║');
    console.log('║' + `     Avg Latency:     ${pm.avgLatency.toFixed(1)} ms`.padEnd(58) + '║');
    console.log('║' + `     P95 Latency:     ${pm.p95Latency.toFixed(1)} ms`.padEnd(58) + '║');
    console.log('║' + `     P99 Latency:     ${pm.p99Latency.toFixed(1)} ms`.padEnd(58) + '║');
    console.log('╟'.padEnd(59, '─') + '╢');
  }

  const wm = wsMetrics.getMetrics();
  if (wm.totalConnections > 0) {
    console.log('║' + '  🔌 WEBSOCKET TEST'.padEnd(58) + '║');
    console.log('║' + `     Total Connections: ${wm.totalConnections}`.padEnd(58) + '║');
    console.log('║' + `     Active:            ${wm.activeConnections}`.padEnd(58) + '║');
    console.log('║' + `     Errors:            ${wm.connectionErrors}`.padEnd(58) + '║');
    console.log('║' + `     Avg Connect Time:  ${wm.avgLatency.toFixed(1)} ms`.padEnd(58) + '║');
    console.log('║' + `     P95 Connect Time:  ${wm.p95Latency.toFixed(1)} ms`.padEnd(58) + '║');
    console.log('╟'.padEnd(59, '─') + '╢');
  }

  console.log('╚'.padEnd(59, '═') + '╝');
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const mode = (process.argv[2] || 'all') as TestMode;
  const config = defaultConfig;

  console.log('\n');
  console.log('╔'.padEnd(59, '═') + '╗');
  console.log('║' + '  🚀 CENTRIFUGO LOAD TEST'.padEnd(58) + '║');
  console.log('╚'.padEnd(59, '═') + '╝');

  printConfig(config);

  console.log(`\n📌 Test Mode: ${mode.toUpperCase()}`);

  // 启动实时报告
  startReporting(config);

  try {
    switch (mode) {
      case 'publish':
        await runPublish(config);
        break;

      case 'websocket':
        await runWebSocket(config);
        break;

      case 'all':
      default:
        // 先测试发布
        await runPublish(config);

        // 重置指标
        publishMetrics.start();

        // 然后测试 WebSocket
        await runWebSocket(config);
        break;
    }
  } finally {
    stopReporting();
    closeAllConnections();
    printFinalReport();
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted! Generating final report...');
  stopReporting();
  closeAllConnections();
  printFinalReport();
  process.exit(0);
});

// 启动
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
