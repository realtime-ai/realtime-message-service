import { User } from '@centrifuge-realtime-message/shared';

/**
 * User Repository Port
 * Abstraction for user storage (in-memory, KV, D1, etc.)
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByName(name: string): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}
