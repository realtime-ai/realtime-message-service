import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidateSubscription } from '../../core/use-cases/ValidateSubscription.js';
import { IUserRepository } from '../../core/ports/IUserRepository.js';
import { ILogger } from '../../core/ports/ILogger.js';
import { User } from '@centrifuge-realtime-message/shared';

describe('ValidateSubscription', () => {
  let validateSubscription: ValidateSubscription;
  let mockUserRepository: IUserRepository;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockUserRepository = {
      findById: vi.fn(),
      findByName: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };

    validateSubscription = new ValidateSubscription(mockUserRepository, mockLogger);
  });

  it('should allow subscription to main chat channel', async () => {
    const user = new User('user-1', 'TestUser');
    vi.mocked(mockUserRepository.findById).mockResolvedValue(user);

    const result = await validateSubscription.execute({
      userId: 'user-1',
      channel: 'chat',
    });

    expect(result.allowed).toBe(true);
  });

  it('should allow subscription to room-based channels', async () => {
    const user = new User('user-1', 'TestUser');
    vi.mocked(mockUserRepository.findById).mockResolvedValue(user);

    const result = await validateSubscription.execute({
      userId: 'user-1',
      channel: 'chat:general',
    });

    expect(result.allowed).toBe(true);
  });

  it('should allow subscription to own user channel', async () => {
    const user = new User('user-1', 'TestUser');
    vi.mocked(mockUserRepository.findById).mockResolvedValue(user);

    const result = await validateSubscription.execute({
      userId: 'user-1',
      channel: 'user:user-1',
    });

    expect(result.allowed).toBe(true);
  });

  it('should reject subscription to other user channels', async () => {
    const user = new User('user-1', 'TestUser');
    vi.mocked(mockUserRepository.findById).mockResolvedValue(user);

    const result = await validateSubscription.execute({
      userId: 'user-1',
      channel: 'user:user-2',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot subscribe to other user channels');
  });

  it('should reject subscription for non-existent user', async () => {
    vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

    const result = await validateSubscription.execute({
      userId: 'non-existent',
      channel: 'chat',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('User not found');
  });

  it('should reject subscription to invalid channel', async () => {
    const user = new User('user-1', 'TestUser');
    vi.mocked(mockUserRepository.findById).mockResolvedValue(user);

    const result = await validateSubscription.execute({
      userId: 'user-1',
      channel: 'invalid-channel',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Invalid channel');
  });
});
