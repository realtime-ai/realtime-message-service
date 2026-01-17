/**
 * Redis Stream 消息载荷类型
 */

export interface MessagePayload {
  id: string;
  channel: string;
  partitionId: number;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  raw: string;
  metadata?: {
    clientId?: string;
    replyTo?: string;
    attachments?: string[];
  };
}

export interface EventPayload {
  type: 'join' | 'leave' | 'subscribe' | 'unsubscribe';
  channel: string;
  userId: string;
  timestamp: string;
}

export interface PartitionMetrics {
  partitionId: number;
  streamLength: number;
  pendingCount: number;
  consumerCount: number;
  lagMs: number;
  processedPerSecond: number;
}
