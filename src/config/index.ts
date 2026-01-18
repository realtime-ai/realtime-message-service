// Sticky channel routing (1 worker = 1 stream)
export {
  ROUTING_KEYS,
  getChannelRouteKey,
  getWorkerStreamKey,
  assignWorkerToChannel,
  getWorkerForChannel,
  invalidateChannelCache,
  clearRouteCache,
  registerWorker,
  unregisterWorker,
} from './routing.js';

// Legacy partition exports (deprecated, kept for backwards compatibility)
export {
  PARTITION_CONFIG,
  getPartitionStreamKey,
  getPartitionId,
  getStreamKeyForChannel,
} from './partition.js';
