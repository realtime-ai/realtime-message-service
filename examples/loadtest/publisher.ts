/**
 * Publisher Load Test - 消息发布压测
 *
 * 模拟高并发消息发布场景
 */

import { randomUUID } from 'crypto';
import type { LoadTestConfig } from './config.js';
import { MetricsCollector } from './metrics.js';

export interface PublishRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  user: string;
  channel: string;
  data: {
    text: string;
  };
  info: {
    name: string;
  };
}

/**
 * 生成随机消息
 */
function generateMessage(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成随机频道
 */
function getRandomChannel(numChannels: number): string {
  const channelId = Math.floor(Math.random() * numChannels);
  return `chat:room-${channelId}`;
}

/**
 * 发送单个消息
 */
async function publishMessage(
  config: LoadTestConfig,
  metrics: MetricsCollector
): Promise<void> {
  const startTime = Date.now();
  const channel = getRandomChannel(config.numChannels);
  const userId = `user-${Math.floor(Math.random() * 1000)}`;

  const request: PublishRequest = {
    client: randomUUID(),
    transport: 'websocket',
    protocol: 'json',
    encoding: 'json',
    user: userId,
    channel: channel,
    data: {
      text: generateMessage(config.messageSize),
    },
    info: {
      name: `User ${userId}`,
    },
  };

  try {
    const response = await fetch(`${config.callbackUrl}/centrifugo/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const latency = Date.now() - startTime;
    const body = await response.json();

    if (response.ok && body.result) {
      metrics.recordRequest(true, latency, config.messageSize);
    } else {
      metrics.recordRequest(false, latency, 0);
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    metrics.recordRequest(false, latency, 0);
  }
}

/**
 * 运行发布压测
 */
export async function runPublishLoadTest(
  config: LoadTestConfig,
  metrics: MetricsCollector
): Promise<void> {
  console.log('\n🚀 Starting Publish Load Test...');
  console.log(`   Target RPS: ${config.publishRps}`);
  console.log(`   Duration: ${config.duration}s`);
  console.log(`   Channels: ${config.numChannels}`);
  console.log(`   Message Size: ${config.messageSize} bytes`);

  const intervalMs = 1000 / config.publishRps;
  const endTime = Date.now() + config.duration * 1000;

  let currentRps = 0;
  const targetRps = config.publishRps;
  const rampUpMs = config.rampUpTime * 1000;
  const startTime = Date.now();

  while (Date.now() < endTime) {
    // 计算当前 RPS (爬坡)
    const elapsed = Date.now() - startTime;
    if (elapsed < rampUpMs) {
      currentRps = Math.floor((elapsed / rampUpMs) * targetRps);
    } else {
      currentRps = targetRps;
    }

    if (currentRps > 0) {
      const actualIntervalMs = 1000 / currentRps;

      // 发送请求 (不等待响应，并发执行)
      publishMessage(config, metrics);

      await sleep(actualIntervalMs);
    } else {
      await sleep(100);
    }
  }

  // 等待最后的请求完成
  await sleep(1000);
}

/**
 * 批量发布压测 (更高 RPS)
 */
export async function runBatchPublishLoadTest(
  config: LoadTestConfig,
  metrics: MetricsCollector
): Promise<void> {
  console.log('\n🚀 Starting Batch Publish Load Test...');
  console.log(`   Target RPS: ${config.publishRps}`);
  console.log(`   Duration: ${config.duration}s`);

  const batchSize = Math.min(config.publishRps, 100); // 每批最多 100 个
  const batchIntervalMs = (batchSize / config.publishRps) * 1000;
  const endTime = Date.now() + config.duration * 1000;

  let currentBatchSize = 0;
  const rampUpMs = config.rampUpTime * 1000;
  const startTime = Date.now();

  while (Date.now() < endTime) {
    // 计算当前批次大小 (爬坡)
    const elapsed = Date.now() - startTime;
    if (elapsed < rampUpMs) {
      currentBatchSize = Math.floor((elapsed / rampUpMs) * batchSize);
    } else {
      currentBatchSize = batchSize;
    }

    if (currentBatchSize > 0) {
      // 并发发送一批请求
      const promises = [];
      for (let i = 0; i < currentBatchSize; i++) {
        promises.push(publishMessage(config, metrics));
      }
      await Promise.all(promises);

      await sleep(batchIntervalMs);
    } else {
      await sleep(100);
    }
  }

  await sleep(1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
