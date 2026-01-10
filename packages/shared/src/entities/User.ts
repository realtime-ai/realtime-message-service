/**
 * User domain entity
 * Pure domain logic with no framework dependencies
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly name: string
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('User ID is required');
    }
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('User name is required');
    }
    if (this.name.length > 50) {
      throw new Error('User name too long (max 50 chars)');
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
    };
  }
}
