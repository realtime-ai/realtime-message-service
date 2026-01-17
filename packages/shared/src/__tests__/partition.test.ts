import { describe, it, expect } from 'vitest';
import {
  PARTITION_CONFIG,
  getPartitionId,
  getPartitionStreamKey,
  getConsumerGroupName,
  getStreamKeyForChannel,
  getAssignedPartitions,
  testPartitionDistribution,
} from '../config/partition';

describe('Partition Config', () => {
  describe('getPartitionId', () => {
    it('should return consistent partition for same channel', () => {
      const channel = 'chat:room-123';
      const partition1 = getPartitionId(channel);
      const partition2 = getPartitionId(channel);
      expect(partition1).toBe(partition2);
    });

    it('should return partition within valid range', () => {
      const channels = ['chat:room-1', 'chat:room-2', 'chat:general', 'user:user-123'];

      for (const channel of channels) {
        const partition = getPartitionId(channel);
        expect(partition).toBeGreaterThanOrEqual(0);
        expect(partition).toBeLessThan(PARTITION_CONFIG.NUM_PARTITIONS);
      }
    });

    it('should distribute channels across partitions', () => {
      const channels: string[] = [];
      for (let i = 0; i < 100; i++) {
        channels.push(`chat:room-${i}`);
      }

      const distribution = testPartitionDistribution(channels);

      // 应该有多个分区被使用
      expect(distribution.size).toBeGreaterThan(1);

      // 每个分区应该有一些频道
      let totalChannels = 0;
      for (const [, channelList] of distribution) {
        totalChannels += channelList.length;
      }
      expect(totalChannels).toBe(100);
    });
  });

  describe('getPartitionStreamKey', () => {
    it('should return correct stream key format', () => {
      expect(getPartitionStreamKey(0)).toBe('messages:partition:0');
      expect(getPartitionStreamKey(5)).toBe('messages:partition:5');
    });
  });

  describe('getConsumerGroupName', () => {
    it('should return correct group name format', () => {
      expect(getConsumerGroupName(0)).toBe('workers:partition-0');
      expect(getConsumerGroupName(3)).toBe('workers:partition-3');
    });
  });

  describe('getStreamKeyForChannel', () => {
    it('should return stream key based on channel hash', () => {
      const channel = 'chat:room-123';
      const partitionId = getPartitionId(channel);
      const expectedStreamKey = getPartitionStreamKey(partitionId);

      expect(getStreamKeyForChannel(channel)).toBe(expectedStreamKey);
    });
  });

  describe('getAssignedPartitions', () => {
    it('should assign all partitions to single worker', () => {
      const partitions = getAssignedPartitions(0, 1);
      expect(partitions).toHaveLength(PARTITION_CONFIG.NUM_PARTITIONS);
      expect(partitions).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('should split partitions evenly between 2 workers', () => {
      const worker0 = getAssignedPartitions(0, 2);
      const worker1 = getAssignedPartitions(1, 2);

      expect(worker0).toEqual([0, 2, 4, 6]);
      expect(worker1).toEqual([1, 3, 5, 7]);

      // 合起来应该覆盖所有分区
      const all = [...worker0, ...worker1].sort((a, b) => a - b);
      expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('should split partitions between 4 workers', () => {
      const workers = [0, 1, 2, 3].map((id) => getAssignedPartitions(id, 4));

      expect(workers[0]).toEqual([0, 4]);
      expect(workers[1]).toEqual([1, 5]);
      expect(workers[2]).toEqual([2, 6]);
      expect(workers[3]).toEqual([3, 7]);

      // 合起来应该覆盖所有分区
      const all = workers.flat().sort((a, b) => a - b);
      expect(all).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('should assign one partition per worker when workers = partitions', () => {
      for (let i = 0; i < PARTITION_CONFIG.NUM_PARTITIONS; i++) {
        const partitions = getAssignedPartitions(i, PARTITION_CONFIG.NUM_PARTITIONS);
        expect(partitions).toEqual([i]);
      }
    });

    it('should return empty array for workers beyond partition count', () => {
      const partitions = getAssignedPartitions(
        PARTITION_CONFIG.NUM_PARTITIONS,
        PARTITION_CONFIG.NUM_PARTITIONS + 1
      );
      expect(partitions).toEqual([]);
    });
  });

  describe('Channel consistency', () => {
    it('should always route same channel to same partition', () => {
      const testChannels = [
        'chat:general',
        'chat:room-1',
        'chat:room-abc',
        'user:user-123',
        'user:user-xyz',
      ];

      // 多次调用应该返回相同结果
      for (const channel of testChannels) {
        const results = new Set<number>();
        for (let i = 0; i < 100; i++) {
          results.add(getPartitionId(channel));
        }
        expect(results.size).toBe(1);
      }
    });
  });
});
