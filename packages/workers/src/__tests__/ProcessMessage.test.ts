import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessMessage } from '../core/use-cases/ProcessMessage';
import { ILogger } from '../core/ports/ILogger';

describe('ProcessMessage Use Case', () => {
  let mockLogger: ILogger;
  let processMessage: ProcessMessage;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    processMessage = new ProcessMessage(mockLogger);
  });

  it('should process a valid message', () => {
    const input = {
      userId: 'user-1',
      userName: 'John',
      channel: 'chat:general',
      data: { text: 'Hello World' },
    };

    const result = processMessage.execute(input);

    expect(result.message).toBeDefined();
    expect(result.message.text).toBe('Hello World');
    expect(result.message.user.id).toBe('user-1');
    expect(result.message.user.name).toBe('John');
    expect(result.publishData.text).toBe('Hello World');
  });

  it('should log processing info', () => {
    const input = {
      userId: 'user-1',
      userName: 'John',
      channel: 'chat:general',
      data: { text: 'Test message' },
    };

    processMessage.execute(input);

    expect(mockLogger.debug).toHaveBeenCalledWith('Processing message', {
      userId: 'user-1',
      channel: 'chat:general',
    });
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should throw error for empty message text', () => {
    const input = {
      userId: 'user-1',
      userName: 'John',
      channel: 'chat:general',
      data: { text: '' },
    };

    expect(() => processMessage.execute(input)).toThrow('Message text cannot be empty');
  });

  it('should throw error for message text too long', () => {
    const input = {
      userId: 'user-1',
      userName: 'John',
      channel: 'chat:general',
      data: { text: 'a'.repeat(5001) },
    };

    expect(() => processMessage.execute(input)).toThrow('Message too long');
  });
});
