import Redis from 'ioredis';
import {
  getPartitionStreamKey,
  getConsumerGroupName,
  type MessagePayload,
} from '@centrifuge-realtime-message/shared';

export interface WorkerConfig {
  workerId: number;
  partitions: number[];
  redisUrl: string;
}

export class PartitionWorker {
  private redis: Redis;
  private config: WorkerConfig;
  private consumerName: string;
  private running: boolean = false;
  private processedCount: number = 0;
  private startTime: number = 0;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
    });
    this.consumerName = `worker-${config.workerId}-${process.pid}`;
  }

  async start(): Promise<void> {
    console.info(`\n[Worker ${this.config.workerId}] Starting...`);
    console.info(`  Consumer name: ${this.consumerName}`);
    console.info(`  Partitions: [${this.config.partitions.join(', ')}]`);

    // 为每个分区初始化 consumer group
    await this.initConsumerGroups();

    this.running = true;
    this.startTime = Date.now();

    console.info(`[Worker ${this.config.workerId}] Ready, waiting for messages...\n`);

    await this.consumeLoop();
  }

  async stop(): Promise<void> {
    console.info(`\n[Worker ${this.config.workerId}] Stopping...`);
    this.running = false;
    await this.redis.quit();
    console.info(`[Worker ${this.config.workerId}] Stopped`);
  }

  getStats(): { processedCount: number; uptime: number; partitions: number[] } {
    return {
      processedCount: this.processedCount,
      uptime: Date.now() - this.startTime,
      partitions: this.config.partitions,
    };
  }

  private async initConsumerGroups(): Promise<void> {
    for (const partitionId of this.config.partitions) {
      const streamKey = getPartitionStreamKey(partitionId);
      const groupName = getConsumerGroupName(partitionId);

      try {
        await this.redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
        console.info(`  Created consumer group: ${groupName} for ${streamKey}`);
      } catch (err: unknown) {
        const error = err as Error;
        if (!error.message.includes('BUSYGROUP')) {
          throw err;
        }
        // Group 已存在，正常
        console.info(`  Consumer group exists: ${groupName}`);
      }
    }
  }

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        // 为每个分区构建 XREADGROUP 参数
        for (const partitionId of this.config.partitions) {
          const streamKey = getPartitionStreamKey(partitionId);
          const groupName = getConsumerGroupName(partitionId);

          const results = (await this.redis.xreadgroup(
            'GROUP',
            groupName,
            this.consumerName,
            'BLOCK',
            1000, // 阻塞 1 秒等待新消息
            'COUNT',
            10, // 每次最多取 10 条
            'STREAMS',
            streamKey,
            '>' // 只读取新消息
          )) as [string, [string, string[]][]][] | null;

          if (!results) continue;

          for (const [, messages] of results) {
            for (const [messageId, fields] of messages) {
              await this.processMessage(partitionId, streamKey, messageId, fields);
            }
          }
        }
      } catch (error) {
        if (this.running) {
          console.error(`[Worker ${this.config.workerId}] Error in consume loop:`, error);
          await this.sleep(1000);
        }
      }
    }
  }

  private async processMessage(
    partitionId: number,
    streamKey: string,
    messageId: string,
    fields: string[]
  ): Promise<void> {
    // fields 格式: ['payload', '{"..."}']
    const payloadIndex = fields.indexOf('payload');
    if (payloadIndex === -1 || !fields[payloadIndex + 1]) {
      console.warn(`[Worker ${this.config.workerId}] Invalid message format:`, messageId);
      await this.ackMessage(streamKey, partitionId, messageId);
      return;
    }

    const payload: MessagePayload = JSON.parse(fields[payloadIndex + 1]);

    console.info(
      `[Worker ${this.config.workerId}][Partition ${partitionId}] Processing: ` +
        `id=${payload.id.slice(0, 8)}... channel=${payload.channel} user=${payload.userId}`
    );

    try {
      // ===== 业务逻辑处理 =====

      // 1. 消息验证
      if (!payload.text || payload.text.length > 5000) {
        console.warn(`[Worker ${this.config.workerId}] Invalid message, skipping:`, payload.id);
        await this.ackMessage(streamKey, partitionId, messageId);
        return;
      }

      // 2. 模拟处理延迟 (实际业务中可能是数据库写入、通知推送等)
      await this.sleep(10);

      // 3. 这里可以添加更多业务逻辑:
      //    - 持久化到数据库
      //    - 内容过滤/敏感词检测
      //    - @mention 通知
      //    - 统计分析
      //    - etc.

      // ===== 处理完成 =====

      // ACK 消息
      await this.ackMessage(streamKey, partitionId, messageId);
      this.processedCount++;

      console.info(
        `[Worker ${this.config.workerId}][Partition ${partitionId}] Completed: ` +
          `id=${payload.id.slice(0, 8)}... (total: ${this.processedCount})`
      );
    } catch (error) {
      console.error(
        `[Worker ${this.config.workerId}] Error processing message ${messageId}:`,
        error
      );
      // 不 ACK，消息会在 pending list 中，可以被重试
    }
  }

  private async ackMessage(
    streamKey: string,
    partitionId: number,
    messageId: string
  ): Promise<void> {
    const groupName = getConsumerGroupName(partitionId);
    await this.redis.xack(streamKey, groupName, messageId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
