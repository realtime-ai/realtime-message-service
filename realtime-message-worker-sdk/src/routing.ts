import type { Redis } from 'ioredis';

/**
 * Redis keys for worker routing - must match Go gateway implementation
 */
export const ROUTING_KEYS = {
  /** ZSET storing active worker IDs with timestamp scores */
  ACTIVE_WORKERS: 'workers:active',
  /** PREFIX for channel-to-worker mapping strings */
  CHANNEL_ROUTE_PREFIX: 'channel:route:',
  /** PREFIX for worker message streams */
  WORKER_STREAM_PREFIX: 'messages:worker:',
} as const;

/**
 * Get the Redis stream key for a worker
 */
export function getWorkerStreamKey(workerId: string): string {
  return `${ROUTING_KEYS.WORKER_STREAM_PREFIX}${workerId}`;
}

/**
 * Register a worker as active in Redis
 * Called when a worker starts up
 */
export async function registerWorker(
  redis: Redis,
  workerId: string
): Promise<void> {
  await redis.zadd(ROUTING_KEYS.ACTIVE_WORKERS, Date.now(), workerId);
}

/**
 * Unregister a worker from Redis
 * Called when a worker shuts down gracefully
 */
export async function unregisterWorker(
  redis: Redis,
  workerId: string
): Promise<void> {
  await redis.zrem(ROUTING_KEYS.ACTIVE_WORKERS, workerId);
}

/**
 * Update worker heartbeat timestamp
 * Can be called periodically to indicate worker is still alive
 */
export async function updateWorkerHeartbeat(
  redis: Redis,
  workerId: string
): Promise<void> {
  await redis.zadd(ROUTING_KEYS.ACTIVE_WORKERS, Date.now(), workerId);
}

/**
 * Get all active workers
 */
export async function getActiveWorkers(redis: Redis): Promise<string[]> {
  return redis.zrange(ROUTING_KEYS.ACTIVE_WORKERS, 0, -1);
}
