/**
 * Test Monitor - 监控 Redis Stream 状态
 *
 * 用法:
 *   npx tsx src/test-monitor.ts
 *   npx tsx src/test-monitor.ts --watch
 */

import Redis from 'ioredis';
import {
  PARTITION_CONFIG,
  getPartitionStreamKey,
  getConsumerGroupName,
} from '@centrifuge-realtime-message/shared';

interface PartitionStatus {
  partitionId: number;
  streamKey: string;
  streamLength: number;
  pendingCount: number;
  consumers: Array<{
    name: string;
    pending: number;
    idle: number;
  }>;
}

async function getPartitionStatus(redis: Redis, partitionId: number): Promise<PartitionStatus> {
  const streamKey = getPartitionStreamKey(partitionId);
  const groupName = getConsumerGroupName(partitionId);

  // Stream 长度
  const streamLength = await redis.xlen(streamKey);

  let pendingCount = 0;
  let consumers: PartitionStatus['consumers'] = [];

  try {
    // Pending 信息
    const pendingInfo = await redis.xpending(streamKey, groupName);
    pendingCount = (pendingInfo[0] as number) || 0;

    // Consumer 信息
    const consumersInfo = await redis.xinfo('CONSUMERS', streamKey, groupName);

    if (Array.isArray(consumersInfo)) {
      consumers = consumersInfo.map((c: string[]) => {
        const obj: Record<string, string | number> = {};
        for (let i = 0; i < c.length; i += 2) {
          obj[c[i]] = c[i + 1];
        }
        return {
          name: String(obj['name']),
          pending: Number(obj['pending']) || 0,
          idle: Number(obj['idle']) || 0,
        };
      });
    }
  } catch {
    // Group 可能不存在
  }

  return {
    partitionId,
    streamKey,
    streamLength,
    pendingCount,
    consumers,
  };
}

async function printStatus(redis: Redis): Promise<void> {
  // eslint-disable-next-line no-console
  console.clear();
  console.info('='.repeat(70));
  console.info('Redis Stream Monitor');
  console.info(`Time: ${new Date().toISOString()}`);
  console.info('='.repeat(70));

  const statuses: PartitionStatus[] = [];
  let totalMessages = 0;
  let totalPending = 0;
  let totalConsumers = 0;

  for (let i = 0; i < PARTITION_CONFIG.NUM_PARTITIONS; i++) {
    const status = await getPartitionStatus(redis, i);
    statuses.push(status);
    totalMessages += status.streamLength;
    totalPending += status.pendingCount;
    totalConsumers += status.consumers.length;
  }

  console.info(
    `\nTotal: ${totalMessages} messages, ${totalPending} pending, ${totalConsumers} consumers\n`
  );

  console.info(
    'Partition'.padEnd(12) +
      'Stream'.padEnd(25) +
      'Length'.padEnd(10) +
      'Pending'.padEnd(10) +
      'Consumers'
  );
  console.info('-'.repeat(70));

  for (const status of statuses) {
    if (status.streamLength > 0 || status.consumers.length > 0) {
      console.info(
        `${status.partitionId}`.padEnd(12) +
          status.streamKey.padEnd(25) +
          `${status.streamLength}`.padEnd(10) +
          `${status.pendingCount}`.padEnd(10) +
          `${status.consumers.length}`
      );

      for (const consumer of status.consumers) {
        const idleStr =
          consumer.idle < 1000 ? `${consumer.idle}ms` : `${(consumer.idle / 1000).toFixed(1)}s`;
        console.info(`  └─ ${consumer.name}: pending=${consumer.pending}, idle=${idleStr}`);
      }
    }
  }

  console.info('\n' + '='.repeat(70));
  console.info('Press Ctrl+C to exit');
}

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl);

  const watchMode = process.argv.includes('--watch');

  if (watchMode) {
    // 持续监控模式
    const refresh = async () => {
      await printStatus(redis);
    };

    await refresh();
    const interval = setInterval(refresh, 1000);

    process.on('SIGINT', async () => {
      clearInterval(interval);
      await redis.quit();
      process.exit(0);
    });
  } else {
    // 单次输出
    await printStatus(redis);
    await redis.quit();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
