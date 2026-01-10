import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Message } from '../entities/Message';
import { User } from '../entities/User';

describe('Message Entity', () => {
  const mockDate = new Date('2024-01-01T00:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a valid message', () => {
    const user = new User('user-1', 'John');
    const message = new Message('msg-1', 'Hello World', user, mockDate);

    expect(message.id).toBe('msg-1');
    expect(message.text).toBe('Hello World');
    expect(message.user).toBe(user);
    expect(message.timestamp).toEqual(mockDate);
  });

  it('should create message using static factory method', () => {
    const message = Message.create('msg-1', 'Hello World', 'user-1', 'John');

    expect(message.id).toBe('msg-1');
    expect(message.text).toBe('Hello World');
    expect(message.user.id).toBe('user-1');
    expect(message.user.name).toBe('John');
  });

  it('should trim message text', () => {
    const message = Message.create('msg-1', '  Hello World  ', 'user-1', 'John');

    expect(message.text).toBe('Hello World');
  });

  it('should throw error for empty text', () => {
    const user = new User('user-1', 'John');
    expect(() => new Message('msg-1', '', user, mockDate)).toThrow('Message text cannot be empty');
  });

  it('should throw error for whitespace-only text', () => {
    const user = new User('user-1', 'John');
    expect(() => new Message('msg-1', '   ', user, mockDate)).toThrow(
      'Message text cannot be empty'
    );
  });

  it('should throw error for text longer than 5000 characters', () => {
    const user = new User('user-1', 'John');
    const longText = 'a'.repeat(5001);
    expect(() => new Message('msg-1', longText, user, mockDate)).toThrow('Message too long');
  });

  it('should serialize to JSON correctly', () => {
    const message = Message.create('msg-1', 'Hello World', 'user-1', 'John');
    const json = message.toJSON();

    expect(json).toEqual({
      id: 'msg-1',
      text: 'Hello World',
      user: { id: 'user-1', name: 'John' },
      timestamp: mockDate.toISOString(),
    });
  });
});
