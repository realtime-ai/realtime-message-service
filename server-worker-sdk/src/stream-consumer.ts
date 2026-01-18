import type { Redis } from 'ioredis';
import type { Message, Logger } from './types.js';

export interface StreamConsumerConfig {
  redis: Redis;
  streamKey: string;
  batchSize: number;
  blockTime: number;
  startFrom: 'earliest' | 'latest';
  logger: Logger;
}

/**
 * Consumes messages from a Redis Stream using XREAD BLOCK
 */
export class StreamConsumer {
  private redis: Redis;
  private streamKey: string;
  private batchSize: number;
  private blockTime: number;
  private startFrom: 'earliest' | 'latest';
  private logger: Logger;

  private running: boolean = false;
  private lastId: string;

  constructor(config: StreamConsumerConfig) {
    this.redis = config.redis;
    this.streamKey = config.streamKey;
    this.batchSize = config.batchSize;
    this.blockTime = config.blockTime;
    this.startFrom = config.startFrom;
    this.logger = config.logger;

    // '$' = only new messages, '0' = from beginning
    this.lastId = this.startFrom === 'latest' ? '$' : '0';
  }

  /**
   * Start consuming messages from the stream
   * This method blocks until stop() is called
   */
  async start(onMessage: (message: Message) => Promise<void>): Promise<void> {
    this.running = true;
    this.logger.info(`StreamConsumer started: ${this.streamKey}`);

    while (this.running) {
      try {
        const results = await this.redis.xread(
          'COUNT',
          this.batchSize,
          'BLOCK',
          this.blockTime,
          'STREAMS',
          this.streamKey,
          this.lastId
        );

        if (!results) continue;

        for (const [, messages] of results) {
          for (const [messageId, fields] of messages as [string, string[]][]) {
            try {
              const message = this.parseMessage(fields);
              if (message) {
                await onMessage(message);
              }
              this.lastId = messageId;
            } catch (err) {
              this.logger.error(`Error processing message ${messageId}:`, err);
              this.lastId = messageId; // Advance to avoid getting stuck
            }
          }
        }
      } catch (err) {
        if (this.running) {
          this.logger.error('Error reading from stream:', err);
          // Brief pause before retrying
          await this.sleep(1000);
        }
      }
    }

    this.logger.info(`StreamConsumer stopped: ${this.streamKey}`);
  }

  /**
   * Stop consuming messages
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Check if currently consuming
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Parse message fields from Redis XREAD result
   */
  private parseMessage(fields: string[]): Message | null {
    const payloadIndex = fields.indexOf('payload');
    if (payloadIndex === -1 || payloadIndex + 1 >= fields.length) {
      return null;
    }

    try {
      return JSON.parse(fields[payloadIndex + 1]) as Message;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
