/**
 * WebSocket Load Test - 连接压测
 *
 * 模拟大量 WebSocket 连接场景
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { LoadTestConfig } from './config.js';
import { MetricsCollector } from './metrics.js';

interface Connection {
  ws: WebSocket;
  userId: string;
  connectedAt: number;
}

const connections: Connection[] = [];
let messageId = 1;

/**
 * 生成 Centrifugo 连接命令
 */
function createConnectCommand(userId: string, userName: string): string {
  return JSON.stringify({
    id: messageId++,
    connect: {
      data: {
        userId,
        userName,
      },
    },
  });
}

/**
 * 生成订阅命令
 */
function createSubscribeCommand(channel: string): string {
  return JSON.stringify({
    id: messageId++,
    subscribe: {
      channel,
    },
  });
}

/**
 * 创建单个 WebSocket 连接
 */
async function createConnection(
  config: LoadTestConfig,
  metrics: MetricsCollector,
  channelIndex: number
): Promise<Connection | null> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const userId = `loadtest-${randomUUID().slice(0, 8)}`;
    const channel = `chat:room-${channelIndex % config.numChannels}`;

    try {
      const ws = new WebSocket(config.centrifugoWsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        metrics.recordConnection(false);
        resolve(null);
      }, 10000);

      ws.on('open', () => {
        // 发送连接命令
        ws.send(createConnectCommand(userId, `User ${userId}`));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          // 连接成功响应
          if (message.connect) {
            clearTimeout(timeout);
            const latency = Date.now() - startTime;
            metrics.recordRequest(true, latency);
            metrics.recordConnection(true);

            // 订阅频道
            ws.send(createSubscribeCommand(channel));

            resolve({
              ws,
              userId,
              connectedAt: Date.now(),
            });
          }
        } catch (err) {
          // 忽略解析错误
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        metrics.recordConnection(false);
        resolve(null);
      });

      ws.on('close', () => {
        metrics.recordDisconnection();
      });
    } catch (err) {
      metrics.recordConnection(false);
      resolve(null);
    }
  });
}

/**
 * 运行 WebSocket 连接压测
 */
export async function runWebSocketLoadTest(
  config: LoadTestConfig,
  metrics: MetricsCollector
): Promise<void> {
  console.log('\n🔌 Starting WebSocket Load Test...');
  console.log(`   Target Connections: ${config.numConnections}`);
  console.log(`   Connections/sec: ${config.connectionsPerSecond}`);
  console.log(`   Duration: ${config.duration}s`);

  const intervalMs = 1000 / config.connectionsPerSecond;
  const endTime = Date.now() + config.duration * 1000;

  let connectionIndex = 0;

  // 建立连接阶段
  while (connections.length < config.numConnections && Date.now() < endTime) {
    const conn = await createConnection(config, metrics, connectionIndex++);
    if (conn) {
      connections.push(conn);
    }

    // 限速
    if (connections.length < config.numConnections) {
      await sleep(intervalMs);
    }

    // 每 10 个连接打印进度
    if (connections.length % 10 === 0) {
      console.log(`   Connections: ${connections.length}/${config.numConnections}`);
    }
  }

  console.log(`\n✅ Established ${connections.length} connections`);

  // 保持连接直到测试结束
  const remainingTime = endTime - Date.now();
  if (remainingTime > 0) {
    console.log(`   Holding connections for ${Math.ceil(remainingTime / 1000)}s...`);
    await sleep(remainingTime);
  }
}

/**
 * 关闭所有连接
 */
export function closeAllConnections(): void {
  console.log(`\n🔌 Closing ${connections.length} connections...`);

  for (const conn of connections) {
    try {
      conn.ws.close();
    } catch (err) {
      // 忽略关闭错误
    }
  }

  connections.length = 0;
  console.log('✅ All connections closed');
}

/**
 * 获取当前连接数
 */
export function getActiveConnectionCount(): number {
  return connections.filter(c => c.ws.readyState === WebSocket.OPEN).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
