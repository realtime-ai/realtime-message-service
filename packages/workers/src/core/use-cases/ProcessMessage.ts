import { Message } from '@centrifuge-realtime-message/shared';
import { ILogger } from '../ports/ILogger';

/**
 * Process Message Use Case
 * Handles message validation and transformation for Centrifugo publish proxy
 */
export interface ProcessMessageInput {
  userId: string;
  userName: string;
  channel: string;
  data: {
    text: string;
  };
}

export interface ProcessMessageOutput {
  message: Message;
  publishData: {
    id: string;
    text: string;
    user: {
      id: string;
      name: string;
    };
    timestamp: string;
  };
}

export class ProcessMessage {
  constructor(private readonly logger: ILogger) {}

  execute(input: ProcessMessageInput): ProcessMessageOutput {
    const { userId, userName, channel, data } = input;

    this.logger.debug('Processing message', { userId, channel });

    // Create and validate message entity
    const message = Message.create(crypto.randomUUID(), data.text, userId, userName);

    this.logger.info('Message processed', {
      messageId: message.id,
      userId,
      channel,
    });

    return {
      message,
      publishData: message.toJSON(),
    };
  }
}
