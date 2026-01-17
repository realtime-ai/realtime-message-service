import { spawn, ChildProcess } from 'child_process';
import { PARTITION_CONFIG } from '@centrifuge-realtime-message/shared';

interface MultiWorkerConfig {
  numWorkers: number;
  redisUrl: string;
}

class MultiWorkerManager {
  private workers: Map<number, ChildProcess> = new Map();
  private config: MultiWorkerConfig;

  constructor(config: MultiWorkerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.info('='.repeat(60));
    console.info('Multi-Worker Manager');
    console.info(`  Number of Workers: ${this.config.numWorkers}`);
    console.info(`  Total Partitions: ${PARTITION_CONFIG.NUM_PARTITIONS}`);
    console.info(`  Redis URL: ${this.config.redisUrl}`);
    console.info('='.repeat(60));
    console.info('\nStarting workers...\n');

    for (let i = 0; i < this.config.numWorkers; i++) {
      this.startWorker(i);
    }

    console.info('\nAll workers started. Press Ctrl+C to stop.\n');
  }

  private startWorker(workerId: number): void {
    const env = {
      ...process.env,
      WORKER_ID: workerId.toString(),
      TOTAL_WORKERS: this.config.numWorkers.toString(),
      REDIS_URL: this.config.redisUrl,
    };

    // 获取当前文件所在目录的路径
    const workerDir = new URL('.', import.meta.url).pathname.replace(/\/src\/?$/, '');

    const worker = spawn('npx', ['tsx', 'src/index.ts'], {
      env,
      cwd: workerDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 为每个 worker 的输出添加前缀
    const prefix = `[W${workerId}]`;

    worker.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line) => {
        if (line.trim()) {
          console.info(`${prefix} ${line}`);
        }
      });
    });

    worker.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line) => {
        if (line.trim()) {
          console.error(`${prefix} [ERROR] ${line}`);
        }
      });
    });

    worker.on('exit', (code, signal) => {
      console.info(`${prefix} Worker exited with code ${code}, signal ${signal}`);
      this.workers.delete(workerId);

      // 如果不是正常退出，尝试重启
      if (code !== 0 && !this.isShuttingDown) {
        console.info(`${prefix} Restarting worker in 2 seconds...`);
        setTimeout(() => this.startWorker(workerId), 2000);
      }
    });

    this.workers.set(workerId, worker);
    console.info(`Started worker ${workerId} (PID: ${worker.pid})`);
  }

  private isShuttingDown = false;

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    console.info('\nStopping all workers...');

    const stopPromises: Promise<void>[] = [];

    for (const [workerId, worker] of this.workers) {
      stopPromises.push(
        new Promise<void>((resolve) => {
          worker.on('exit', () => {
            console.info(`Worker ${workerId} stopped`);
            resolve();
          });
          worker.kill('SIGTERM');
        })
      );
    }

    await Promise.all(stopPromises);
    console.info('All workers stopped');
  }
}

async function main() {
  const numWorkers = parseInt(process.env.NUM_WORKERS || '2', 10);
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const manager = new MultiWorkerManager({
    numWorkers,
    redisUrl,
  });

  // 优雅关闭
  const shutdown = async () => {
    await manager.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await manager.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
