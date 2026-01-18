import type { Redis } from 'ioredis';

/**
 * Message format matching Go gateway StreamMessage
 */
export interface Message {
  id: string;
  channel: string;
  workerId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  raw: string;
  clientId: string;
}

/**
 * Channel state for tracking lifecycle
 */
export type ChannelState = 'active' | 'inactive';

/**
 * Channel metadata tracked by the SDK
 */
export interface ChannelInfo {
  channel: string;
  state: ChannelState;
  firstMessageAt: Date;
  lastMessageAt: Date;
  messageCount: number;
}

/**
 * Logger interface for custom logging
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Worker configuration options
 */
export interface WorkerConfig {
  /** Redis connection URL or existing Redis instance */
  redis: string | Redis;

  /** Unique worker identifier (auto-generated if not provided) */
  workerId?: string;

  /** Number of messages to fetch per batch (default: 10) */
  batchSize?: number;

  /** Time to block waiting for messages in ms (default: 5000) */
  blockTime?: number;

  /** Channel inactivity timeout in ms for triggering onChannelInactive (default: 30000) */
  channelInactivityTimeout?: number;

  /** Interval for checking inactive channels in ms (default: 5000) */
  inactivityCheckInterval?: number;

  /** Whether to start from earliest messages or latest (default: 'latest') */
  startFrom?: 'earliest' | 'latest';

  /** Custom logger (default: console) */
  logger?: Logger;
}

/**
 * Event types for EventEmitter pattern
 */
export interface WorkerEvents {
  'channel:active': (channel: string, info: ChannelInfo) => void;
  'channel:message': (channel: string, message: Message) => void;
  'channel:inactive': (channel: string, info: ChannelInfo) => void;
  'worker:started': (workerId: string) => void;
  'worker:stopped': (workerId: string) => void;
  'worker:error': (error: Error) => void;
}

/**
 * Callback-based event handlers
 */
export interface WorkerCallbacks {
  /** Called when a new channel becomes active (first message received) */
  onChannelActive?: (channel: string, info: ChannelInfo) => void | Promise<void>;

  /** Called for each message on a channel */
  onChannelMessage?: (channel: string, message: Message) => void | Promise<void>;

  /** Called when a channel becomes inactive (timeout or explicit removal) */
  onChannelInactive?: (channel: string, info: ChannelInfo) => void | Promise<void>;

  /** Called when worker starts */
  onWorkerStarted?: (workerId: string) => void | Promise<void>;

  /** Called when worker stops */
  onWorkerStopped?: (workerId: string) => void | Promise<void>;

  /** Called on errors */
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  batchSize: 10,
  blockTime: 5000,
  channelInactivityTimeout: 30000,
  inactivityCheckInterval: 5000,
  startFrom: 'latest' as const,
} as const;
