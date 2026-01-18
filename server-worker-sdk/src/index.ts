/**
 * @realtime-ai/server-worker-sdk
 *
 * Event-driven worker SDK for consuming real-time channel messages
 * from the Realtime Message Gateway.
 *
 * @example
 * ```typescript
 * import { createWorker } from '@realtime-ai/server-worker-sdk';
 *
 * const worker = createWorker({
 *   redis: 'redis://localhost:6379',
 *   workerId: 'worker-1',
 * }, {
 *   onChannelActive: (channel) => console.log(`New: ${channel}`),
 *   onChannelMessage: (channel, msg) => console.log(`${channel}: ${msg.text}`),
 *   onChannelInactive: (channel) => console.log(`End: ${channel}`),
 * });
 *
 * await worker.start();
 * ```
 */

// Main class
export { RealtimeWorker } from './worker.js';

// Types
export type {
  EventType,
  Message,
  ChannelState,
  ChannelInfo,
  Logger,
  WorkerConfig,
  WorkerEvents,
  WorkerCallbacks,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

// Routing utilities
export {
  ROUTING_KEYS,
  getWorkerStreamKey,
  registerWorker,
  unregisterWorker,
  updateWorkerHeartbeat,
  getActiveWorkers,
} from './routing.js';

// Factory function
import { RealtimeWorker } from './worker.js';
import type { WorkerConfig, WorkerCallbacks } from './types.js';

/**
 * Create a new RealtimeWorker instance
 *
 * @param config Worker configuration
 * @param callbacks Optional callback handlers
 * @returns RealtimeWorker instance
 *
 * @example
 * ```typescript
 * const worker = createWorker({
 *   redis: 'redis://localhost:6379',
 *   workerId: 'my-worker',
 *   channelInactivityTimeout: 30000,
 * }, {
 *   onChannelActive: async (channel, info) => {
 *     console.log(`Channel ${channel} activated`);
 *   },
 *   onChannelMessage: async (channel, message) => {
 *     console.log(`${channel}: ${message.text}`);
 *   },
 *   onChannelInactive: async (channel, info) => {
 *     console.log(`Channel ${channel} deactivated after ${info.messageCount} messages`);
 *   },
 * });
 *
 * await worker.start();
 * ```
 */
export function createWorker(
  config: WorkerConfig,
  callbacks: WorkerCallbacks = {}
): RealtimeWorker {
  return new RealtimeWorker(config, callbacks);
}
