import { LoadTestConfig, VirtualUser } from './types.js';
import { MetricsCollector } from './metrics.js';
import { VirtualUserClient, authenticateUser } from './virtual-user.js';

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load test runner for Centrifugo
 */
export class LoadTestRunner {
  private config: LoadTestConfig;
  private metrics: MetricsCollector;
  private users: VirtualUserClient[] = [];

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.metrics = new MetricsCollector(config);
  }

  /**
   * Run the load test
   */
  async run(): Promise<void> {
    console.log('Starting load test...');
    console.log(`Channels: ${this.config.channelCount}`);
    console.log(`Users per channel: ${this.config.usersPerChannel}`);
    console.log(`Total users: ${this.config.channelCount * this.config.usersPerChannel}`);
    console.log(`Message size: ${this.config.messageSizeBytes} bytes`);
    console.log(`Message interval: ${this.config.messageIntervalMs}ms`);
    console.log(`Duration: ${this.config.durationMs / 1000}s`);
    console.log('');

    try {
      // Phase 1: Authenticate all users
      console.log('Phase 1: Authenticating users...');
      const virtualUsers = await this.authenticateAllUsers();
      console.log(`Authenticated ${virtualUsers.length} users`);

      // Phase 2: Connect all users
      console.log('\nPhase 2: Connecting users to Centrifugo...');
      await this.connectAllUsers(virtualUsers);
      console.log(`Connected ${this.users.length} users`);

      // Phase 3: Start sending messages
      console.log('\nPhase 3: Starting message load...');
      this.metrics.start();
      this.startAllUserMessages();

      // Phase 4: Wait for test duration
      console.log(`\nRunning load test for ${this.config.durationMs / 1000} seconds...`);
      await this.runWithProgress(this.config.durationMs);

      // Phase 5: Stop and collect metrics
      console.log('\nPhase 5: Stopping test and collecting metrics...');
      await this.stopAllUsers();
      this.metrics.stop();

      // Print results
      this.metrics.printMetrics();
    } catch (error) {
      console.error('Load test failed:', error);
      await this.stopAllUsers();
      throw error;
    }
  }

  /**
   * Authenticate all virtual users
   */
  private async authenticateAllUsers(): Promise<VirtualUser[]> {
    const virtualUsers: VirtualUser[] = [];
    const batchSize = 10; // Authenticate in batches to avoid overwhelming the API

    for (let channel = 0; channel < this.config.channelCount; channel++) {
      const channelName = `loadtest-channel-${channel}`;

      for (let user = 0; user < this.config.usersPerChannel; user++) {
        const userId = `user-${channel}-${user}`;
        const userName = `LoadTestUser_${channel}_${user}`;

        virtualUsers.push({
          id: userId,
          name: userName,
          channelName,
          token: '', // Will be filled after authentication
          metrics: {
            userId,
            channelName,
            connectionTimeMs: 0,
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            latencies: [],
          },
        });
      }
    }

    // Authenticate in batches
    const batches = [];
    for (let i = 0; i < virtualUsers.length; i += batchSize) {
      batches.push(virtualUsers.slice(i, i + batchSize));
    }

    let authenticated = 0;
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (user) => {
          try {
            const authResponse = await authenticateUser(this.config.apiUrl, user.name);
            user.id = authResponse.user.id;
            user.token = authResponse.centrifugoToken;
            // Re-initialize metrics with new user ID
            this.metrics.initUser(user.id, user.channelName);
            authenticated++;

            // Progress indicator
            if (authenticated % 20 === 0) {
              console.log(`  Authenticated ${authenticated}/${virtualUsers.length} users`);
            }
          } catch (error) {
            console.error(`Failed to authenticate user ${user.name}:`, error);
            this.metrics.recordError(user.id);
          }
        })
      );

      // Small delay between batches
      await sleep(50);
    }

    return virtualUsers.filter((u) => u.token !== '');
  }

  /**
   * Connect all users to Centrifugo
   */
  private async connectAllUsers(virtualUsers: VirtualUser[]): Promise<void> {
    const batchSize = 20; // Connect in batches
    const batches = [];

    for (let i = 0; i < virtualUsers.length; i += batchSize) {
      batches.push(virtualUsers.slice(i, i + batchSize));
    }

    let connected = 0;
    for (const batch of batches) {
      await Promise.all(
        batch.map(async (virtualUser) => {
          const client = new VirtualUserClient(
            virtualUser,
            this.config.centrifugoUrl,
            this.metrics,
            this.config.messageSizeBytes,
            this.config.messageIntervalMs
          );

          try {
            await client.connect();
            this.users.push(client);
            connected++;

            if (connected % 20 === 0) {
              console.log(`  Connected ${connected}/${virtualUsers.length} users`);
            }
          } catch (error) {
            console.error(
              `Failed to connect user ${virtualUser.id}:`,
              error instanceof Error ? error.message : error
            );
            this.metrics.recordError(virtualUser.id);
          }
        })
      );

      // Small delay between batches
      await sleep(100);
    }
  }

  /**
   * Start all users sending messages
   */
  private startAllUserMessages(): void {
    // Stagger the start to avoid thundering herd
    this.users.forEach((user, index) => {
      setTimeout(
        () => {
          user.startSendingMessages();
        },
        (index % 100) * 10
      ); // Stagger by 10ms for each group of 100
    });
  }

  /**
   * Run the test with progress indicator
   */
  private async runWithProgress(durationMs: number): Promise<void> {
    const updateInterval = 5000; // Update every 5 seconds
    const updates = Math.floor(durationMs / updateInterval);
    let elapsed = 0;

    for (let i = 0; i < updates; i++) {
      await sleep(updateInterval);
      elapsed += updateInterval;
      const progress = ((elapsed / durationMs) * 100).toFixed(0);
      const currentMetrics = this.metrics.getMetrics();
      console.log(
        `  Progress: ${progress}% | Sent: ${currentMetrics.totalMessagesSent} | Received: ${currentMetrics.totalMessagesReceived} | Errors: ${currentMetrics.totalErrors}`
      );
    }

    // Wait for remaining time
    const remaining = durationMs - elapsed;
    if (remaining > 0) {
      await sleep(remaining);
    }
  }

  /**
   * Stop all users
   */
  private async stopAllUsers(): Promise<void> {
    await Promise.all(this.users.map((user) => user.stop()));
    this.users = [];
  }

  /**
   * Get the metrics collector
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }
}
