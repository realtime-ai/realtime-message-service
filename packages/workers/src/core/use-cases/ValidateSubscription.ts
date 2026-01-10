import { IUserRepository } from '../ports/IUserRepository';
import { ILogger } from '../ports/ILogger';

/**
 * Validate Subscription Use Case
 * Handles channel subscription validation for Centrifugo subscribe proxy
 */
export interface ValidateSubscriptionInput {
  userId: string;
  channel: string;
}

export interface ValidateSubscriptionOutput {
  allowed: boolean;
  reason?: string;
}

export class ValidateSubscription {
  private readonly allowedChannelPatterns = [
    /^chat$/, // Main chat channel
    /^chat:[\w-]+$/, // Private/room channels
    /^user:[\w-]+$/, // User-specific channels
  ];

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly logger: ILogger
  ) {}

  async execute(input: ValidateSubscriptionInput): Promise<ValidateSubscriptionOutput> {
    const { userId, channel } = input;

    this.logger.debug('Validating subscription', { userId, channel });

    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.warn('Subscription rejected: user not found', { userId, channel });
      return {
        allowed: false,
        reason: 'User not found',
      };
    }

    // Validate channel pattern
    const isValidChannel = this.allowedChannelPatterns.some((pattern) => pattern.test(channel));

    if (!isValidChannel) {
      this.logger.warn('Subscription rejected: invalid channel', { userId, channel });
      return {
        allowed: false,
        reason: 'Invalid channel',
      };
    }

    // Check user-specific channel permissions
    if (channel.startsWith('user:')) {
      const channelUserId = channel.split(':')[1];
      if (channelUserId !== userId) {
        this.logger.warn('Subscription rejected: unauthorized user channel', {
          userId,
          channel,
          channelUserId,
        });
        return {
          allowed: false,
          reason: 'Cannot subscribe to other user channels',
        };
      }
    }

    this.logger.info('Subscription allowed', { userId, channel });
    return { allowed: true };
  }
}
