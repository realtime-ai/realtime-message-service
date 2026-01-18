import type Redis from 'ioredis';

// Redis keys for worker routing
export const ROUTING_KEYS = {
  ACTIVE_WORKERS: 'workers:active',
  CHANNEL_ROUTE_PREFIX: 'channel:route:',
  WORKER_STREAM_PREFIX: 'messages:worker:',
} as const;

// Local cache configuration
const CACHE_TTL_MS = 60_000; // 60 seconds

// Local cache to avoid Redis lookup for every message
interface CacheEntry {
  workerId: string;
  expiresAt: number;
}
const routeCache = new Map<string, CacheEntry>();

// Round-robin counter for worker assignment
let roundRobinIndex = 0;

/**
 * Get the Redis key for a channel's route mapping
 */
export function getChannelRouteKey(channel: string): string {
  return `${ROUTING_KEYS.CHANNEL_ROUTE_PREFIX}${channel}`;
}

/**
 * Get the Redis stream key for a worker
 */
export function getWorkerStreamKey(workerId: string): string {
  return `${ROUTING_KEYS.WORKER_STREAM_PREFIX}${workerId}`;
}

/**
 * Assign a worker to a channel using round-robin from active workers
 * Returns the assigned worker ID and stores the mapping in Redis
 */
export async function assignWorkerToChannel(
  redis: Redis,
  channel: string
): Promise<string> {
  // Get all active workers sorted by registration time
  const workers = await redis.zrange(ROUTING_KEYS.ACTIVE_WORKERS, 0, -1);

  if (workers.length === 0) {
    throw new Error('No active workers available');
  }

  // Round-robin selection
  const selectedWorker = workers[roundRobinIndex % workers.length];
  roundRobinIndex = (roundRobinIndex + 1) % workers.length;

  // Store the mapping in Redis (no expiry - channel stays with worker until worker dies)
  const routeKey = getChannelRouteKey(channel);
  await redis.set(routeKey, selectedWorker);

  console.log(`Assigned channel ${channel} to worker ${selectedWorker}`);

  return selectedWorker;
}

/**
 * Get the worker ID for a channel with local caching
 *
 * Performance characteristics:
 * - Cache hit: 0 Redis queries
 * - Cache miss, existing mapping: 1-2 Redis queries
 * - Cache miss, worker offline: 2-3 Redis queries (includes reassignment)
 */
export async function getWorkerForChannel(
  redis: Redis,
  channel: string
): Promise<string> {
  // 1. Check local cache
  const cached = routeCache.get(channel);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.workerId;
  }

  // 2. Check Redis for existing mapping
  const routeKey = getChannelRouteKey(channel);
  const workerId = await redis.get(routeKey);

  if (workerId) {
    // Verify worker is still active
    const isActive = await redis.zscore(ROUTING_KEYS.ACTIVE_WORKERS, workerId);

    if (isActive !== null) {
      // Worker is active, update local cache and return
      routeCache.set(channel, {
        workerId,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return workerId;
    }

    // Worker has gone offline, delete stale mapping
    console.log(`Worker ${workerId} is offline, reassigning channel ${channel}`);
    await redis.del(routeKey);
  }

  // 3. Assign new worker (no existing mapping or worker offline)
  const newWorkerId = await assignWorkerToChannel(redis, channel);

  // Update local cache
  routeCache.set(channel, {
    workerId: newWorkerId,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return newWorkerId;
}

/**
 * Clear local cache entry for a channel
 * Call this when you know a channel's routing may have changed
 */
export function invalidateChannelCache(channel: string): void {
  routeCache.delete(channel);
}

/**
 * Clear all local cache entries
 */
export function clearRouteCache(): void {
  routeCache.clear();
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
