import { PartitionWorker } from './partition-worker';
import { PARTITION_CONFIG, getAssignedPartitions } from '@centrifuge-realtime-message/shared';

interface WorkerEnv {
  REDIS_URL?: string;
  WORKER_ID?: string;
  TOTAL_WORKERS?: string;
  PARTITIONS?: string; // 手动指定分区，如 "0,1,2"
}

async function main() {
  const env = process.env as WorkerEnv;

  const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
  const workerId = parseInt(env.WORKER_ID || '0', 10);
  const totalWorkers = parseInt(env.TOTAL_WORKERS || '1', 10);

  let partitions: number[];

  if (env.PARTITIONS) {
    // 手动指定分区
    partitions = env.PARTITIONS.split(',').map((s) => parseInt(s.trim(), 10));
  } else {
    // 自动分配
    partitions = getAssignedPartitions(workerId, totalWorkers);
  }

  if (partitions.length === 0) {
    console.error(`Worker ${workerId} has no partitions assigned!`);
    console.error(
      `  Total partitions: ${PARTITION_CONFIG.NUM_PARTITIONS}, Total workers: ${totalWorkers}`
    );
    process.exit(1);
  }

  console.info('='.repeat(60));
  console.info('Worker Configuration:');
  console.info(`  Worker ID: ${workerId}`);
  console.info(`  Total Workers: ${totalWorkers}`);
  console.info(`  Total Partitions: ${PARTITION_CONFIG.NUM_PARTITIONS}`);
  console.info(`  Assigned Partitions: [${partitions.join(', ')}]`);
  console.info(`  Redis URL: ${redisUrl}`);
  console.info('='.repeat(60));

  const worker = new PartitionWorker({
    workerId,
    partitions,
    redisUrl,
  });

  // 优雅关闭
  const shutdown = async () => {
    console.info('\nReceived shutdown signal...');
    const stats = worker.getStats();
    console.info(`Final stats: processed ${stats.processedCount} messages`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await worker.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
