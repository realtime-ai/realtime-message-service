# Worker 横向扩展设计：基于 Channel 分区

## 1. 问题背景

在分布式消息处理场景中，我们需要保证：
1. **消息顺序性**：同一 channel 的消息按顺序处理
2. **状态一致性**：同一 channel 的消息由同一 worker 处理，避免并发冲突
3. **横向扩展**：worker 数量可以动态增减

## 2. 解决方案：基于 Channel Hash 的多 Stream 分区

### 核心思路

```
partition_id = hash(channel) % NUM_PARTITIONS
```

- 同一 channel 的消息总是写入同一个 partition stream
- 每个 partition 由独立的 worker（组）消费
- Worker 数量可以少于/等于/多于 partition 数量

### 架构图

```
                    Callback Service
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   Partition 0       Partition 1    ...  Partition N-1
   (Stream)          (Stream)            (Stream)
        │                 │                 │
        ▼                 ▼                 ▼
   Worker(s) 0       Worker(s) 1    ...  Worker(s) N-1


消息路由示例：
┌─────────────────┬───────────────────┬─────────────┐
│ Channel         │ hash % 8          │ Partition   │
├─────────────────┼───────────────────┼─────────────┤
│ chat:general    │ 4729381 % 8 = 5   │ partition:5 │
│ chat:room-123   │ 2847623 % 8 = 7   │ partition:7 │
│ chat:room-456   │ 9182736 % 8 = 0   │ partition:0 │
│ chat:room-789   │ 1029384 % 8 = 0   │ partition:0 │
└─────────────────┴───────────────────┴─────────────┘
```

---

## 3. 代码实现

### 3.1 分区配置

```typescript
// packages/shared/src/config/partition.ts

export const PARTITION_CONFIG = {
  // 分区数量 - 建议为 2 的幂次方，便于后续扩展
  NUM_PARTITIONS: 8,

  // Stream key 前缀
  STREAM_PREFIX: 'messages:partition',

  // Consumer group 名称前缀
  GROUP_PREFIX: 'workers',
} as const;

// 获取 stream key
export function getPartitionStreamKey(partitionId: number): string {
  return `${PARTITION_CONFIG.STREAM_PREFIX}:${partitionId}`;
}

// 获取 consumer group 名称
export function getConsumerGroupName(partitionId: number): string {
  return `${PARTITION_CONFIG.GROUP_PREFIX}:partition-${partitionId}`;
}
```

### 3.2 Channel 分区器 (Callback Service)

```typescript
// packages/callback-service/src/partitioner.ts

import { createHash } from 'crypto';
import { PARTITION_CONFIG, getPartitionStreamKey } from '@shared/config/partition';

/**
 * 基于 channel 名称计算分区 ID
 * 使用一致性哈希确保同一 channel 总是映射到同一分区
 */
export function getPartitionId(channel: string): number {
  // 使用 MD5 哈希（快速且分布均匀）
  const hash = createHash('md5').update(channel).digest();

  // 取前 4 字节作为 32 位整数
  const hashInt = hash.readUInt32BE(0);

  // 取模得到分区 ID
  return hashInt % PARTITION_CONFIG.NUM_PARTITIONS;
}

/**
 * 根据 channel 获取对应的 stream key
 */
export function getStreamKeyForChannel(channel: string): string {
  const partitionId = getPartitionId(channel);
  return getPartitionStreamKey(partitionId);
}

// 测试分布均匀性
export function testPartitionDistribution(channels: string[]): Map<number, string[]> {
  const distribution = new Map<number, string[]>();

  for (const channel of channels) {
    const partitionId = getPartitionId(channel);
    const existing = distribution.get(partitionId) || [];
    existing.push(channel);
    distribution.set(partitionId, existing);
  }

  return distribution;
}
```

### 3.3 更新 Publish Handler (Callback Service)

```typescript
// packages/callback-service/src/handlers/publish.ts

import { Router } from 'express';
import { redis } from '../redis';
import { getStreamKeyForChannel, getPartitionId } from '../partitioner';
import { PARTITION_CONFIG } from '@shared/config/partition';

const router = Router();

interface PublishRequest {
  client: string;
  user: string;
  channel: string;
  data: {
    text: string;
    [key: string]: unknown;
  };
  info?: {
    name?: string;
  };
}

router.post('/publish', async (req, res) => {
  const { client, user, channel, data, info } = req.body as PublishRequest;

  const messageId = crypto.randomUUID();
  const timestamp = Date.now();
  const partitionId = getPartitionId(channel);

  // 构造消息
  const message = {
    id: messageId,
    channel,
    partitionId,  // 记录分区信息，便于调试
    userId: user,
    userName: info?.name || 'Anonymous',
    text: data?.text || '',
    timestamp: new Date(timestamp).toISOString(),
    raw: JSON.stringify(data),
  };

  // 写入对应分区的 Stream
  const streamKey = getStreamKeyForChannel(channel);

  await redis.xadd(
    streamKey,
    '*',
    'payload', JSON.stringify(message)
  );

  console.log(`Message ${messageId} written to ${streamKey} (partition: ${partitionId})`);

  // 立即返回，Centrifugo 广播消息
  res.json({
    result: {
      data: {
        id: messageId,
        text: message.text,
        user: { id: user, name: message.userName },
        timestamp: message.timestamp,
      },
    },
  });
});

export default router;
```

### 3.4 分区感知的 Worker

```typescript
// packages/worker/src/partition-worker.ts

import Redis from 'ioredis';
import {
  PARTITION_CONFIG,
  getPartitionStreamKey,
  getConsumerGroupName
} from '@shared/config/partition';

interface WorkerConfig {
  // 该 worker 负责处理的分区列表
  partitions: number[];
  redisUrl: string;
}

class PartitionWorker {
  private redis: Redis;
  private config: WorkerConfig;
  private consumerName: string;
  private running: boolean = false;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl);
    this.consumerName = `worker-${process.pid}-${Date.now()}`;
  }

  async start(): Promise<void> {
    console.log(`Starting worker ${this.consumerName}`);
    console.log(`Assigned partitions: ${this.config.partitions.join(', ')}`);

    // 为每个分区初始化 consumer group
    await this.initConsumerGroups();

    this.running = true;
    await this.consumeLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.redis.quit();
  }

  private async initConsumerGroups(): Promise<void> {
    for (const partitionId of this.config.partitions) {
      const streamKey = getPartitionStreamKey(partitionId);
      const groupName = getConsumerGroupName(partitionId);

      try {
        await this.redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
        console.log(`Created consumer group ${groupName} for ${streamKey}`);
      } catch (err: any) {
        if (!err.message.includes('BUSYGROUP')) {
          throw err;
        }
        // Group 已存在，正常
      }
    }
  }

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        // 构建 XREADGROUP 参数
        const streams: string[] = [];
        const ids: string[] = [];

        for (const partitionId of this.config.partitions) {
          streams.push(getPartitionStreamKey(partitionId));
          ids.push('>');
        }

        // 从所有分配的分区读取消息
        const results = await this.redis.xreadgroup(
          'GROUP', getConsumerGroupName(this.config.partitions[0]), this.consumerName,
          'BLOCK', 5000,
          'COUNT', 10,
          'STREAMS', ...streams, ...ids
        ) as [string, [string, string[]][]][] | null;

        if (!results) continue;

        for (const [streamKey, messages] of results) {
          const partitionId = this.extractPartitionId(streamKey);

          for (const [messageId, fields] of messages) {
            await this.processMessage(partitionId, streamKey, messageId, fields);
          }
        }
      } catch (error) {
        console.error('Error in consume loop:', error);
        await this.sleep(1000);
      }
    }
  }

  private extractPartitionId(streamKey: string): number {
    const match = streamKey.match(/partition:(\d+)/);
    return match ? parseInt(match[1], 10) : -1;
  }

  private async processMessage(
    partitionId: number,
    streamKey: string,
    messageId: string,
    fields: string[]
  ): Promise<void> {
    const payload = JSON.parse(fields[1]);

    console.log(`[Partition ${partitionId}] Processing message:`, {
      id: payload.id,
      channel: payload.channel,
      userId: payload.userId,
    });

    try {
      // ===== 业务逻辑处理 =====

      // 1. 消息验证
      if (!payload.text || payload.text.length > 5000) {
        console.warn('Invalid message, skipping:', payload.id);
        await this.ackMessage(streamKey, partitionId, messageId);
        return;
      }

      // 2. 内容过滤（敏感词检测等）
      // const filteredText = await this.filterContent(payload.text);

      // 3. 持久化到数据库
      // await this.saveToDatabase(payload);

      // 4. 更新 channel 统计
      // await this.updateChannelStats(payload.channel);

      // 5. 触发相关通知
      // await this.sendNotifications(payload);

      // ===== 处理完成 =====

      // ACK 消息
      await this.ackMessage(streamKey, partitionId, messageId);

      console.log(`[Partition ${partitionId}] Message ${payload.id} processed successfully`);

    } catch (error) {
      console.error(`[Partition ${partitionId}] Error processing message ${messageId}:`, error);
      // 不 ACK，消息会在 pending list 中，可以被重试
    }
  }

  private async ackMessage(streamKey: string, partitionId: number, messageId: string): Promise<void> {
    const groupName = getConsumerGroupName(partitionId);
    await this.redis.xack(streamKey, groupName, messageId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { PartitionWorker, WorkerConfig };
```

### 3.5 Worker 启动脚本 (支持分区分配)

```typescript
// packages/worker/src/index.ts

import { PartitionWorker } from './partition-worker';
import { PARTITION_CONFIG } from '@shared/config/partition';

interface WorkerEnv {
  REDIS_URL: string;
  WORKER_ID: string;       // 0, 1, 2, ...
  TOTAL_WORKERS: string;   // 总 worker 数量
  PARTITIONS?: string;     // 可选：手动指定分区，如 "0,1,2"
}

function getAssignedPartitions(workerId: number, totalWorkers: number): number[] {
  const partitions: number[] = [];
  const numPartitions = PARTITION_CONFIG.NUM_PARTITIONS;

  // 使用轮询分配：partition i 分配给 worker (i % totalWorkers)
  for (let i = 0; i < numPartitions; i++) {
    if (i % totalWorkers === workerId) {
      partitions.push(i);
    }
  }

  return partitions;
}

async function main() {
  const env = process.env as unknown as WorkerEnv;

  const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
  const workerId = parseInt(env.WORKER_ID || '0', 10);
  const totalWorkers = parseInt(env.TOTAL_WORKERS || '1', 10);

  let partitions: number[];

  if (env.PARTITIONS) {
    // 手动指定分区
    partitions = env.PARTITIONS.split(',').map(s => parseInt(s.trim(), 10));
  } else {
    // 自动分配
    partitions = getAssignedPartitions(workerId, totalWorkers);
  }

  if (partitions.length === 0) {
    console.error(`Worker ${workerId} has no partitions assigned!`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`Worker Configuration:`);
  console.log(`  Worker ID: ${workerId}`);
  console.log(`  Total Workers: ${totalWorkers}`);
  console.log(`  Total Partitions: ${PARTITION_CONFIG.NUM_PARTITIONS}`);
  console.log(`  Assigned Partitions: [${partitions.join(', ')}]`);
  console.log(`  Redis URL: ${redisUrl}`);
  console.log('='.repeat(60));

  const worker = new PartitionWorker({
    partitions,
    redisUrl,
  });

  // 优雅关闭
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    await worker.stop();
    process.exit(0);
  });

  await worker.start();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

---

## 4. 部署配置

### 4.1 Docker Compose - 多 Worker 部署

```yaml
# docker-compose.yml

version: '3.8'

services:
  # ... centrifugo, callback-service, redis 配置 ...

  # Worker 实例 - 使用 deploy.replicas 或独立服务

  # 方式 1: 独立服务（推荐，便于分配不同分区）
  worker-0:
    build:
      context: ./packages/worker
    environment:
      - REDIS_URL=redis://redis:6379
      - WORKER_ID=0
      - TOTAL_WORKERS=4
    depends_on:
      - redis

  worker-1:
    build:
      context: ./packages/worker
    environment:
      - REDIS_URL=redis://redis:6379
      - WORKER_ID=1
      - TOTAL_WORKERS=4
    depends_on:
      - redis

  worker-2:
    build:
      context: ./packages/worker
    environment:
      - REDIS_URL=redis://redis:6379
      - WORKER_ID=2
      - TOTAL_WORKERS=4
    depends_on:
      - redis

  worker-3:
    build:
      context: ./packages/worker
    environment:
      - REDIS_URL=redis://redis:6379
      - WORKER_ID=3
      - TOTAL_WORKERS=4
    depends_on:
      - redis
```

### 4.2 分区分配示例

**8 个分区，4 个 Worker：**

```
Worker 0: partitions [0, 4]
Worker 1: partitions [1, 5]
Worker 2: partitions [2, 6]
Worker 3: partitions [3, 7]
```

**8 个分区，2 个 Worker：**

```
Worker 0: partitions [0, 2, 4, 6]
Worker 1: partitions [1, 3, 5, 7]
```

**8 个分区，8 个 Worker：**

```
Worker 0: partitions [0]
Worker 1: partitions [1]
Worker 2: partitions [2]
...
Worker 7: partitions [7]
```

---

## 5. 扩容与缩容

### 5.1 扩容流程

```
当前: 4 Workers, 8 Partitions
目标: 8 Workers, 8 Partitions

1. 启动新的 Workers (4-7)
2. 更新现有 Workers 的 TOTAL_WORKERS=8
3. 滚动重启现有 Workers
4. 新分配：每个 Worker 负责 1 个 partition

注意：
- 扩容过程中，部分 partition 可能暂时有多个 consumer
- Redis Stream Consumer Group 保证每条消息只被一个 consumer 处理
- 无消息丢失
```

### 5.2 缩容流程

```
当前: 8 Workers, 8 Partitions
目标: 4 Workers, 8 Partitions

1. 停止 Workers 4-7
2. 更新剩余 Workers 的 TOTAL_WORKERS=4
3. 滚动重启剩余 Workers
4. 剩余 Workers 接管更多 partitions

注意：
- 被停止的 Workers 的 pending 消息需要被认领
- 使用 XCLAIM 或 XAUTOCLAIM 处理
```

### 5.3 Pending 消息处理

```typescript
// 在 Worker 启动时，认领长时间未处理的消息
async function claimPendingMessages(
  redis: Redis,
  streamKey: string,
  groupName: string,
  consumerName: string
): Promise<void> {
  // 认领超过 30 秒未 ACK 的消息
  const minIdleTime = 30000;

  const result = await redis.xautoclaim(
    streamKey,
    groupName,
    consumerName,
    minIdleTime,
    '0-0',
    'COUNT', 100
  );

  if (result && result[1].length > 0) {
    console.log(`Claimed ${result[1].length} pending messages from ${streamKey}`);
  }
}
```

---

## 6. 监控指标

### 6.1 关键监控项

```typescript
// 每个分区的监控指标
interface PartitionMetrics {
  partitionId: number;
  streamLength: number;        // XLEN
  pendingCount: number;        // XPENDING count
  consumerCount: number;       // 活跃消费者数
  lagMs: number;               // 最老未处理消息的延迟
  processedPerSecond: number;  // 处理速率
}
```

### 6.2 告警规则

| 指标 | 告警阈值 | 说明 |
|------|----------|------|
| `stream_length` | > 10000 | 消息积压 |
| `pending_count` | > 1000 | 处理延迟 |
| `consumer_count` | = 0 | 分区无消费者 |
| `lag_ms` | > 60000 | 延迟超过 1 分钟 |

### 6.3 监控脚本

```typescript
// packages/worker/src/monitor.ts

async function getPartitionMetrics(redis: Redis): Promise<PartitionMetrics[]> {
  const metrics: PartitionMetrics[] = [];

  for (let i = 0; i < PARTITION_CONFIG.NUM_PARTITIONS; i++) {
    const streamKey = getPartitionStreamKey(i);
    const groupName = getConsumerGroupName(i);

    // Stream 长度
    const streamLength = await redis.xlen(streamKey);

    // Pending 信息
    const pendingInfo = await redis.xpending(streamKey, groupName);
    const pendingCount = pendingInfo[0] as number;

    // Consumer 信息
    const consumers = await redis.xinfo('CONSUMERS', streamKey, groupName);

    metrics.push({
      partitionId: i,
      streamLength,
      pendingCount,
      consumerCount: consumers.length,
      lagMs: 0, // 需要从 pending 列表计算
      processedPerSecond: 0, // 需要通过时序数据计算
    });
  }

  return metrics;
}
```

---

## 7. 总结

### 保证同一 Channel 消息到同一 Worker

```
channel "chat:room-123"
    │
    ▼
hash("chat:room-123") % 8 = 7
    │
    ▼
写入 messages:partition:7
    │
    ▼
Worker 处理 partition 7 的消费
    │
    ▼
同一 channel 的消息顺序处理 ✓
```

### 关键设计点

1. **分区数固定**：建议 8/16/32，根据预期并发量选择
2. **Worker 数可变**：可以少于/等于/多于分区数
3. **一致性哈希**：同一 channel 总是映射到同一分区
4. **Consumer Group**：同一分区内多 Worker 竞争消费（高可用）
5. **扩缩容平滑**：不丢消息，自动重平衡
