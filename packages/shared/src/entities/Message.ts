import { User } from './User';

/**
 * ChatMessage domain entity
 * Encapsulates message business rules
 */
export class Message {
  constructor(
    public readonly id: string,
    public readonly text: string,
    public readonly user: User,
    public readonly timestamp: Date
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.text || this.text.trim().length === 0) {
      throw new Error('Message text cannot be empty');
    }
    if (this.text.length > 5000) {
      throw new Error('Message too long (max 5000 chars)');
    }
  }

  static create(id: string, text: string, userId: string, userName: string): Message {
    return new Message(id, text.trim(), new User(userId, userName), new Date());
  }

  toJSON() {
    return {
      id: this.id,
      text: this.text,
      user: this.user.toJSON(),
      timestamp: this.timestamp.toISOString(),
    };
  }
}
