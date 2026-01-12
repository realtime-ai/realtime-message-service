import { User } from '@centrifuge-realtime-message/shared';
import { IUserRepository } from '../../core/ports/IUserRepository.js';

/**
 * In-Memory User Repository
 * Simple implementation for development/testing
 * Note: Data is lost when server restarts
 */
export class InMemoryUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name -> id

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByName(name: string): Promise<User | null> {
    const id = this.nameIndex.get(name.toLowerCase());
    if (!id) return null;
    return this.users.get(id) || null;
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
    this.nameIndex.set(user.name.toLowerCase(), user.id);
  }

  async delete(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      this.nameIndex.delete(user.name.toLowerCase());
      this.users.delete(id);
    }
  }

  // Utility methods for testing/debugging
  getAll(): User[] {
    return Array.from(this.users.values());
  }

  clear(): void {
    this.users.clear();
    this.nameIndex.clear();
  }

  size(): number {
    return this.users.size;
  }
}
