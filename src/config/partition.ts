/**
 * @deprecated This module is deprecated. Use routing.ts instead.
 *
 * The old partition-based routing has been replaced with sticky channel routing:
 * - Import from './routing.js' instead
 * - Use getWorkerForChannel() to get worker assignment
 * - Use getWorkerStreamKey() to get the stream key
 */

import { createHash } from 'crypto';

export const PARTITION_CONFIG = {
  // Number of partitions - recommend power of 2 for easier scaling
  NUM_PARTITIONS: 8,

  // Stream key prefix
  STREAM_PREFIX: 'messages:partition',
} as const;

/**
 * Get partition stream key
 */
export function getPartitionStreamKey(partitionId: number): string {
  return `${PARTITION_CONFIG.STREAM_PREFIX}:${partitionId}`;
}

/**
 * Calculate partition ID from channel name using consistent hashing
 * Same channel always maps to the same partition
 */
export function getPartitionId(channel: string): number {
  const hash = createHash('md5').update(channel).digest();
  const hashInt = hash.readUInt32BE(0);
  return hashInt % PARTITION_CONFIG.NUM_PARTITIONS;
}

/**
 * Get stream key for a channel
 */
export function getStreamKeyForChannel(channel: string): string {
  const partitionId = getPartitionId(channel);
  return getPartitionStreamKey(partitionId);
}
