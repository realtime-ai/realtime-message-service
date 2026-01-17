import { createHash } from 'crypto';

export const PARTITION_CONFIG = {
  // 分区数量 - 建议为 2 的幂次方，便于后续扩展
  NUM_PARTITIONS: 8,

  // Stream key 前缀
  STREAM_PREFIX: 'messages:partition',

  // Consumer group 名称前缀
  GROUP_PREFIX: 'workers',
} as const;

/**
 * 获取分区 stream key
 */
export function getPartitionStreamKey(partitionId: number): string {
  return `${PARTITION_CONFIG.STREAM_PREFIX}:${partitionId}`;
}

/**
 * 获取 consumer group 名称
 */
export function getConsumerGroupName(partitionId: number): string {
  return `${PARTITION_CONFIG.GROUP_PREFIX}:partition-${partitionId}`;
}

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

/**
 * 根据 worker ID 和总 worker 数量，计算该 worker 负责的分区列表
 */
export function getAssignedPartitions(workerId: number, totalWorkers: number): number[] {
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

/**
 * 测试分布均匀性
 */
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
