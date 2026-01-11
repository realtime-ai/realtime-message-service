import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessMessage } from '../../core/use-cases/ProcessMessage.js';
import { ILogger } from '../../core/ports/ILogger.js';

describe('ProcessMessage', () => {
  let processMessage: ProcessMessage;
  let mockLogger: ILogger;

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
      userName: 'TestUser',
      channel: 'chat',
      data: { text: 'Hello, World!' },
    };

    const result = processMessage.execute(input);

    expect(result.message).toBeDefined();
    expect(result.message.text).toBe('Hello, World!');
    expect(result.message.user.id).toBe('user-1');
    expect(result.message.user.name).toBe('TestUser');
    expect(result.publishData.text).toBe('Hello, World!');
    expect(mockLogger.debug).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should generate unique message IDs', () => {
    const input = {
      userId: 'user-1',
      userName: 'TestUser',
      channel: 'chat',
      data: { text: 'Test message' },
    };

    const result1 = processMessage.execute(input);
    const result2 = processMessage.execute(input);

    expect(result1.message.id).not.toBe(result2.message.id);
  });

  it('should include timestamp in publish data', () => {
    const input = {
      userId: 'user-1',
      userName: 'TestUser',
      channel: 'chat',
      data: { text: 'Test message' },
    };

    const result = processMessage.execute(input);

    expect(result.publishData.timestamp).toBeDefined();
    expect(new Date(result.publishData.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should throw error for empty message text', () => {
    const input = {
      userId: 'user-1',
      userName: 'TestUser',
      channel: 'chat',
      data: { text: '' },
    };

    expect(() => processMessage.execute(input)).toThrow();
  });

  it('should throw error for message exceeding max length', () => {
    const input = {
      userId: 'user-1',
      userName: 'TestUser',
      channel: 'chat',
      data: { text: 'a'.repeat(5001) },
    };

    expect(() => processMessage.execute(input)).toThrow();
  });
});
