import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import type {
  WorkerConfig,
  WorkerCallbacks,
  WorkerEvents,
  Message,
  PresenceEvent,
  StreamEvent,
  ChannelInfo,
  Logger,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { ChannelTracker } from './channel-tracker.js';
import { StreamConsumer } from './stream-consumer.js';
import { registerWorker, unregisterWorker, getWorkerStreamKey } from './routing.js';

/**
 * RealtimeWorker - Event-driven worker SDK for consuming channel messages
 *
 * Supports both callback-based and EventEmitter patterns for handling:
 * - Channel activation (first message on a channel)
 * - Channel messages
 * - Channel deactivation (timeout or manual)
 *
 * @example
 * ```typescript
 * const worker = new RealtimeWorker({
 *   redis: 'redis://localhost:6379',
 *   workerId: 'worker-1',
 * }, {
 *   onChannelActive: (channel) => console.log(`New channel: ${channel}`),
 *   onChannelMessage: (channel, msg) => console.log(`${channel}: ${msg.text}`),
 *   onChannelInactive: (channel) => console.log(`Channel closed: ${channel}`),
 * });
 *
 * await worker.start();
 * ```
 */
export class RealtimeWorker extends EventEmitter {
  readonly workerId: string;

  private redis: Redis;
  private ownRedis: boolean;
  private config: {
    batchSize: number;
    blockTime: number;
    channelInactivityTimeout: number;
    inactivityCheckInterval: number;
    startFrom: 'earliest' | 'latest';
    logger: Logger;
  };
  private callbacks: WorkerCallbacks;

  private channelTracker: ChannelTracker;
  private streamConsumer: StreamConsumer | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(config: WorkerConfig, callbacks: WorkerCallbacks = {}) {
    super();

    // Initialize Redis
    if (typeof config.redis === 'string') {
      this.redis = new Redis(config.redis);
      this.ownRedis = true;
    } else {
      this.redis = config.redis;
      this.ownRedis = false;
    }

    // Generate worker ID if not provided
    this.workerId = config.workerId ?? `worker-${randomUUID().slice(0, 8)}`;

    // Merge config with defaults
    this.config = {
      batchSize: config.batchSize ?? DEFAULT_CONFIG.batchSize,
      blockTime: config.blockTime ?? DEFAULT_CONFIG.blockTime,
      channelInactivityTimeout:
        config.channelInactivityTimeout ?? DEFAULT_CONFIG.channelInactivityTimeout,
      inactivityCheckInterval:
        config.inactivityCheckInterval ?? DEFAULT_CONFIG.inactivityCheckInterval,
      startFrom: config.startFrom ?? DEFAULT_CONFIG.startFrom,
      logger: config.logger ?? console,
    };

    this.callbacks = callbacks;
    this.channelTracker = new ChannelTracker();
  }

  /**
   * Start the worker
   * - Registers with Redis
   * - Begins consuming messages from the worker's stream
   * - Starts the inactivity checker
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Worker is already running');
    }

    this.running = true;

    // Register worker with Redis
    await registerWorker(this.redis, this.workerId);
    this.config.logger.info(`Worker ${this.workerId} registered`);

    // Create stream consumer
    const streamKey = getWorkerStreamKey(this.workerId);
    this.streamConsumer = new StreamConsumer({
      redis: this.redis,
      streamKey,
      batchSize: this.config.batchSize,
      blockTime: this.config.blockTime,
      startFrom: this.config.startFrom,
      logger: this.config.logger,
    });

    // Start inactivity checker
    this.startInactivityChecker();

    // Emit started event
    await this.emitWorkerStarted();

    // Start consuming (this will block until stop() is called)
    await this.streamConsumer.start(this.handleMessage.bind(this));
  }

  /**
   * Stop the worker gracefully
   * - Stops consuming messages
   * - Marks all active channels as inactive
   * - Unregisters from Redis
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    this.config.logger.info(`Worker ${this.workerId} stopping...`);

    // Stop stream consumer
    this.streamConsumer?.stop();

    // Stop inactivity checker
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    // Mark all channels as inactive
    for (const [channel] of this.channelTracker.getAll()) {
      await this.markChannelInactive(channel);
    }

    // Unregister from Redis
    await unregisterWorker(this.redis, this.workerId);
    this.config.logger.info(`Worker ${this.workerId} unregistered`);

    // Close Redis if we own it
    if (this.ownRedis) {
      await this.redis.quit();
    }

    // Emit stopped event
    await this.emitWorkerStopped();
  }

  /**
   * Check if worker is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get all currently active channels
   */
  getActiveChannels(): Map<string, ChannelInfo> {
    return this.channelTracker.getAll();
  }

  /**
   * Get info for a specific channel
   */
  getChannelInfo(channel: string): ChannelInfo | undefined {
    return this.channelTracker.get(channel);
  }

  /**
   * Manually mark a channel as inactive
   * Triggers onChannelInactive callback
   */
  async markChannelInactive(channel: string): Promise<void> {
    const info = this.channelTracker.deactivate(channel);
    if (info) {
      await this.emitChannelInactive(channel, info);
    }
  }

  /**
   * Handle incoming event from stream (message, join, or leave)
   */
  private async handleMessage(event: StreamEvent): Promise<void> {
    const channel = event.channel;
    const eventType = event.type || 'message'; // Default to message for backwards compatibility

    // Handle presence events
    if (eventType === 'join') {
      await this.emitUserJoin(channel, event as PresenceEvent);
      return;
    }

    if (eventType === 'leave') {
      await this.emitUserLeave(channel, event as PresenceEvent);
      return;
    }

    // Handle message events
    const message = event as Message;

    // Check if this is a new channel
    const { isNew, info } = this.channelTracker.activateIfNew(channel);

    if (isNew) {
      await this.emitChannelActive(channel, info);
    }

    // Update channel with message
    this.channelTracker.recordMessage(channel);

    // Emit message event
    await this.emitChannelMessage(channel, message);
  }

  /**
   * Start the periodic inactivity checker
   */
  private startInactivityChecker(): void {
    this.inactivityTimer = setInterval(async () => {
      const staleChannels = this.channelTracker.getStaleChannels(
        this.config.channelInactivityTimeout
      );

      for (const info of staleChannels) {
        await this.markChannelInactive(info.channel);
      }
    }, this.config.inactivityCheckInterval);
  }

  // ===== Event emission helpers =====
  // These call both EventEmitter and callback handlers

  private async emitChannelActive(channel: string, info: ChannelInfo): Promise<void> {
    this.emit('channel:active', channel, info);
    try {
      await this.callbacks.onChannelActive?.(channel, info);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async emitChannelMessage(channel: string, message: Message): Promise<void> {
    this.emit('channel:message', channel, message);
    try {
      await this.callbacks.onChannelMessage?.(channel, message);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async emitChannelInactive(channel: string, info: ChannelInfo): Promise<void> {
    this.emit('channel:inactive', channel, info);
    try {
      await this.callbacks.onChannelInactive?.(channel, info);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async emitUserJoin(channel: string, event: PresenceEvent): Promise<void> {
    this.emit('presence:join', channel, event);
    try {
      await this.callbacks.onUserJoin?.(channel, event);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async emitUserLeave(channel: string, event: PresenceEvent): Promise<void> {
    this.emit('presence:leave', channel, event);
    try {
      await this.callbacks.onUserLeave?.(channel, event);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async emitWorkerStarted(): Promise<void> {
    this.emit('worker:started', this.workerId);
    try {
      await this.callbacks.onWorkerStarted?.(this.workerId);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async emitWorkerStopped(): Promise<void> {
    this.emit('worker:stopped', this.workerId);
    try {
      await this.callbacks.onWorkerStopped?.(this.workerId);
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private emitError(error: Error): void {
    this.emit('worker:error', error);
    try {
      this.callbacks.onError?.(error);
    } catch {
      // Ignore errors in error handler
    }
  }

  // ===== TypeScript EventEmitter overrides for type safety =====

  override on<K extends keyof WorkerEvents>(
    event: K,
    listener: WorkerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override once<K extends keyof WorkerEvents>(
    event: K,
    listener: WorkerEvents[K]
  ): this {
    return super.once(event, listener);
  }

  override off<K extends keyof WorkerEvents>(
    event: K,
    listener: WorkerEvents[K]
  ): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof WorkerEvents>(
    event: K,
    ...args: Parameters<WorkerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
