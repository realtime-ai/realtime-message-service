/**
 * Test Publisher - 模拟消息发布，用于测试 Worker 分区处理
 *
 * 用法:
 *   npx tsx src/test-publisher.ts
 *   npx tsx src/test-publisher.ts --channels 5 --messages 20
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
  getPartitionId,
  getStreamKeyForChannel,
  PARTITION_CONFIG,
} from '@centrifuge-realtime-message/shared';

interface TestConfig {
  redisUrl: string;
  numChannels: number;
  messagesPerChannel: number;
  delayMs: number;
}

function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: TestConfig = {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    numChannels: 3,
    messagesPerChannel: 10,
    delayMs: 100,
  };

  for (let i = 0; i < args.length; i += 2) {
    switch (args[i]) {
      case '--channels':
        config.numChannels = parseInt(args[i + 1], 10);
        break;
      case '--messages':
        config.messagesPerChannel = parseInt(args[i + 1], 10);
        break;
      case '--delay':
        config.delayMs = parseInt(args[i + 1], 10);
        break;
      case '--redis':
        config.redisUrl = args[i + 1];
        break;
    }
  }

  return config;
}

async function main() {
  const config = parseArgs();
  const redis = new Redis(config.redisUrl);

  console.info('='.repeat(60));
  console.info('Test Publisher');
  console.info(`  Redis: ${config.redisUrl}`);
  console.info(`  Channels: ${config.numChannels}`);
  console.info(`  Messages per channel: ${config.messagesPerChannel}`);
  console.info(`  Delay between messages: ${config.delayMs}ms`);
  console.info(`  Total partitions: ${PARTITION_CONFIG.NUM_PARTITIONS}`);
  console.info('='.repeat(60));

  // 生成测试频道
  const channels: string[] = [];
  for (let i = 0; i < config.numChannels; i++) {
    channels.push(`chat:room-${i + 1}`);
  }

  // 显示频道到分区的映射
  console.info('\nChannel -> Partition mapping:');
  const partitionStats = new Map<number, string[]>();

  for (const channel of channels) {
    const partitionId = getPartitionId(channel);
    const streamKey = getStreamKeyForChannel(channel);
    console.info(`  ${channel} -> partition ${partitionId} (${streamKey})`);

    const existing = partitionStats.get(partitionId) || [];
    existing.push(channel);
    partitionStats.set(partitionId, existing);
  }

  console.info('\nPartition distribution:');
  for (let i = 0; i < PARTITION_CONFIG.NUM_PARTITIONS; i++) {
    const channels = partitionStats.get(i) || [];
    console.info(`  Partition ${i}: ${channels.length} channels`);
  }

  console.info('\n' + '='.repeat(60));
  console.info('Publishing messages...\n');

  let totalSent = 0;
  const startTime = Date.now();

  for (let msgNum = 0; msgNum < config.messagesPerChannel; msgNum++) {
    for (const channel of channels) {
      const messageId = randomUUID();
      const partitionId = getPartitionId(channel);
      const streamKey = getStreamKeyForChannel(channel);

      const message = {
        id: messageId,
        channel,
        partitionId,
        userId: `user-${(msgNum % 3) + 1}`,
        userName: `TestUser${(msgNum % 3) + 1}`,
        text: `Test message #${msgNum + 1} to ${channel}`,
        timestamp: new Date().toISOString(),
        raw: JSON.stringify({ text: `Test message #${msgNum + 1}` }),
      };

      await redis.xadd(streamKey, '*', 'payload', JSON.stringify(message));
      totalSent++;

      console.info(`[Sent] ${messageId.slice(0, 8)}... -> ${channel} (partition ${partitionId})`);
    }

    if (config.delayMs > 0 && msgNum < config.messagesPerChannel - 1) {
      await new Promise((r) => setTimeout(r, config.delayMs));
    }
  }

  const duration = Date.now() - startTime;

  console.info('\n' + '='.repeat(60));
  console.info('Publishing complete:');
  console.info(`  Total messages sent: ${totalSent}`);
  console.info(`  Duration: ${duration}ms`);
  console.info(`  Rate: ${((totalSent / duration) * 1000).toFixed(2)} msg/s`);
  console.info('='.repeat(60));

  // 检查每个分区的 stream 长度
  console.info('\nStream lengths:');
  for (let i = 0; i < PARTITION_CONFIG.NUM_PARTITIONS; i++) {
    const streamKey = `${PARTITION_CONFIG.STREAM_PREFIX}:${i}`;
    const length = await redis.xlen(streamKey);
    if (length > 0) {
      console.info(`  ${streamKey}: ${length} messages`);
    }
  }

  await redis.quit();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
