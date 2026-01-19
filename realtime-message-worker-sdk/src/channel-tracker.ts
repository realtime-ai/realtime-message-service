import type { ChannelInfo } from './types.js';

/**
 * Tracks channel lifecycle state
 * Detects new channels and stale (inactive) channels
 */
export class ChannelTracker {
  private channels: Map<string, ChannelInfo> = new Map();

  /**
   * Activate a channel if it's new, or update if existing
   * @returns Object with isNew flag and channel info
   */
  activateIfNew(channel: string): { isNew: boolean; info: ChannelInfo } {
    const existing = this.channels.get(channel);

    if (existing) {
      return { isNew: false, info: existing };
    }

    // New channel
    const info: ChannelInfo = {
      channel,
      state: 'active',
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
      messageCount: 0,
    };

    this.channels.set(channel, info);
    return { isNew: true, info };
  }

  /**
   * Record a message for a channel
   * Updates lastMessageAt and increments messageCount
   */
  recordMessage(channel: string): ChannelInfo | undefined {
    const info = this.channels.get(channel);
    if (!info) return undefined;

    info.lastMessageAt = new Date();
    info.messageCount++;
    return info;
  }

  /**
   * Get channels that have been inactive longer than the timeout
   * @param timeoutMs Inactivity timeout in milliseconds
   */
  getStaleChannels(timeoutMs: number): ChannelInfo[] {
    const now = Date.now();
    const stale: ChannelInfo[] = [];

    for (const info of this.channels.values()) {
      const elapsed = now - info.lastMessageAt.getTime();
      if (elapsed > timeoutMs) {
        stale.push(info);
      }
    }

    return stale;
  }

  /**
   * Deactivate and remove a channel from tracking
   * @returns The removed channel info, or undefined if not found
   */
  deactivate(channel: string): ChannelInfo | undefined {
    const info = this.channels.get(channel);
    if (!info) return undefined;

    info.state = 'inactive';
    this.channels.delete(channel);
    return info;
  }

  /**
   * Get all active channels
   */
  getAll(): Map<string, ChannelInfo> {
    return new Map(this.channels);
  }

  /**
   * Get info for a specific channel
   */
  get(channel: string): ChannelInfo | undefined {
    return this.channels.get(channel);
  }

  /**
   * Check if a channel is currently active
   */
  isActive(channel: string): boolean {
    return this.channels.has(channel);
  }

  /**
   * Get the number of active channels
   */
  get size(): number {
    return this.channels.size;
  }

  /**
   * Clear all tracked channels
   */
  clear(): void {
    this.channels.clear();
  }
}
