import { describe, it, expect } from 'vitest';
import { User } from '../entities/User';

describe('User Entity', () => {
  it('should create a valid user', () => {
    const user = new User('123', 'John Doe');

    expect(user.id).toBe('123');
    expect(user.name).toBe('John Doe');
  });

  it('should throw error for empty id', () => {
    expect(() => new User('', 'John Doe')).toThrow('User ID is required');
  });

  it('should throw error for whitespace-only id', () => {
    expect(() => new User('   ', 'John Doe')).toThrow('User ID is required');
  });

  it('should throw error for empty name', () => {
    expect(() => new User('123', '')).toThrow('User name is required');
  });

  it('should throw error for whitespace-only name', () => {
    expect(() => new User('123', '   ')).toThrow('User name is required');
  });

  it('should throw error for name longer than 50 characters', () => {
    const longName = 'a'.repeat(51);
    expect(() => new User('123', longName)).toThrow('User name too long');
  });

  it('should serialize to JSON correctly', () => {
    const user = new User('123', 'John Doe');
    const json = user.toJSON();

    expect(json).toEqual({
      id: '123',
      name: 'John Doe',
    });
  });
});
