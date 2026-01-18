import type Redis from 'ioredis';

// Redis keys for worker routing - must match Go implementation
export const ROUTING_KEYS = {
  ACTIVE_WORKERS: 'workers:active',
  CHANNEL_ROUTE_PREFIX: 'channel:route:',
  WORKER_STREAM_PREFIX: 'messages:worker:',
} as const;

/**
 * Get the Redis stream key for a worker
 */
export function getWorkerStreamKey(workerId: string): string {
  return `${ROUTING_KEYS.WORKER_STREAM_PREFIX}${workerId}`;
}

/**
 * Register a worker as active
 * Should be called when a worker starts up
 */
export async function registerWorker(
  redis: Redis,
  workerId: string
): Promise<void> {
  await redis.zadd(ROUTING_KEYS.ACTIVE_WORKERS, Date.now(), workerId);
  console.log(`Worker ${workerId} registered as active`);
}

/**
 * Unregister a worker
 * Should be called when a worker shuts down gracefully
 */
export async function unregisterWorker(
  redis: Redis,
  workerId: string
): Promise<void> {
  await redis.zrem(ROUTING_KEYS.ACTIVE_WORKERS, workerId);
  console.log(`Worker ${workerId} unregistered`);
}
