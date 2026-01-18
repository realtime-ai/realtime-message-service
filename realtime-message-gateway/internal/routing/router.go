package routing

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"realtime-message-gateway/internal/metrics"
	"realtime-message-gateway/internal/redis"
)

// Redis key constants - must match TypeScript implementation
const (
	ActiveWorkersKey   = "workers:active"
	ChannelRoutePrefix = "channel:route:"
	WorkerStreamPrefix = "messages:worker:"
)

// ErrNoActiveWorkers is returned when no workers are available
var ErrNoActiveWorkers = errors.New("no active workers available")

// cacheEntry holds cached routing information
type cacheEntry struct {
	workerID  string
	expiresAt time.Time
}

// Router handles channel-to-worker routing with local caching
type Router struct {
	redis    *redis.Client
	cacheTTL time.Duration
	cache    sync.Map // map[string]*cacheEntry
	rrIndex  uint64   // round-robin index (atomic)
}

// NewRouter creates a new Router
func NewRouter(redisClient *redis.Client, cacheTTL time.Duration) *Router {
	return &Router{
		redis:    redisClient,
		cacheTTL: cacheTTL,
	}
}

// GetWorkerForChannel returns the worker ID for a channel
// Uses local cache, falls back to Redis, assigns new worker if needed
func (r *Router) GetWorkerForChannel(ctx context.Context, channel string) (string, error) {
	// 1. Check local cache
	if entry, ok := r.cache.Load(channel); ok {
		ce := entry.(*cacheEntry)
		if time.Now().Before(ce.expiresAt) {
			metrics.RouteCacheHits.Inc()
			return ce.workerID, nil
		}
		r.cache.Delete(channel)
	}
	metrics.RouteCacheMisses.Inc()

	// 2. Check Redis for existing mapping
	routeKey := ChannelRoutePrefix + channel
	workerID, err := r.redis.Get(ctx, routeKey)

	if err == nil && workerID != "" {
		// Verify worker is still active
		_, err := r.redis.ZScore(ctx, ActiveWorkersKey, workerID)
		if err == nil {
			// Worker is active, update cache and return
			r.updateCache(channel, workerID)
			return workerID, nil
		}

		// Worker offline, delete stale mapping
		slog.Info("worker offline, reassigning channel", "worker", workerID, "channel", channel)
		r.redis.Del(ctx, routeKey)
	}

	// 3. Assign new worker
	newWorkerID, err := r.assignWorkerToChannel(ctx, channel)
	if err != nil {
		return "", err
	}

	r.updateCache(channel, newWorkerID)
	return newWorkerID, nil
}

// assignWorkerToChannel assigns a worker using round-robin with SetNX to avoid race conditions
func (r *Router) assignWorkerToChannel(ctx context.Context, channel string) (string, error) {
	workers, err := r.redis.ZRange(ctx, ActiveWorkersKey, 0, -1)
	if err != nil {
		return "", err
	}

	if len(workers) == 0 {
		return "", ErrNoActiveWorkers
	}

	routeKey := ChannelRoutePrefix + channel

	// Try to atomically set the worker assignment
	// This prevents race conditions where multiple requests try to assign different workers
	for i := 0; i < len(workers); i++ {
		// Round-robin selection
		idx := atomic.AddUint64(&r.rrIndex, 1)
		selectedWorker := workers[int(idx)%len(workers)]

		// Try to set atomically - only succeeds if key doesn't exist
		wasSet, err := r.redis.SetNX(ctx, routeKey, selectedWorker, 0)
		if err != nil {
			return "", err
		}

		if wasSet {
			// We successfully assigned this worker
			slog.Info("assigned channel to worker", "channel", channel, "worker", selectedWorker)
			return selectedWorker, nil
		}

		// Another request already assigned a worker, get it
		existingWorker, err := r.redis.Get(ctx, routeKey)
		if err == nil && existingWorker != "" {
			// Verify the assigned worker is still active
			_, err := r.redis.ZScore(ctx, ActiveWorkersKey, existingWorker)
			if err == nil {
				return existingWorker, nil
			}
			// Worker is offline, delete and retry
			r.redis.Del(ctx, routeKey)
		}
	}

	return "", ErrNoActiveWorkers
}

// updateCache updates the local cache
func (r *Router) updateCache(channel, workerID string) {
	r.cache.Store(channel, &cacheEntry{
		workerID:  workerID,
		expiresAt: time.Now().Add(r.cacheTTL),
	})
}

// GetWorkerStreamKey returns the Redis stream key for a worker
func GetWorkerStreamKey(workerID string) string {
	return WorkerStreamPrefix + workerID
}

// InvalidateCache removes a channel from the local cache
func (r *Router) InvalidateCache(channel string) {
	r.cache.Delete(channel)
}

// ClearCache clears all cached routes
func (r *Router) ClearCache() {
	r.cache.Range(func(key, _ interface{}) bool {
		r.cache.Delete(key)
		return true
	})
}
