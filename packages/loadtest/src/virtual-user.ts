import { Centrifuge, Subscription, PublicationContext } from 'centrifuge';
import WebSocket from 'ws';
import { AuthResponse, ChatMessage, VirtualUser } from './types.js';
import { MetricsCollector } from './metrics.js';

// Polyfill WebSocket for Node.js
(global as unknown as Record<string, unknown>).WebSocket = WebSocket;

/**
 * Generate a random string of specified length
 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a message payload of specified size
 */
function generateMessagePayload(sizeBytes: number): string {
  // Reserve some bytes for JSON overhead
  const overhead = 100; // Approximate overhead for message structure
  const contentSize = Math.max(10, sizeBytes - overhead);
  return generateRandomString(contentSize);
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Authenticate a user with the backend API
 */
export async function authenticateUser(apiUrl: string, username: string): Promise<AuthResponse> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: username }),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as { error?: string };
    throw new Error(errorData.error || 'Login failed');
  }

  return response.json() as Promise<AuthResponse>;
}

/**
 * Virtual user that connects to Centrifugo and sends/receives messages
 */
export class VirtualUserClient {
  private user: VirtualUser;
  private centrifugoUrl: string;
  private client: Centrifuge | null = null;
  private subscription: Subscription | null = null;
  private metrics: MetricsCollector;
  private messageSizeBytes: number;
  private messageIntervalMs: number;
  private messageTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    user: VirtualUser,
    centrifugoUrl: string,
    metrics: MetricsCollector,
    messageSizeBytes: number,
    messageIntervalMs: number
  ) {
    this.user = user;
    this.centrifugoUrl = centrifugoUrl;
    this.metrics = metrics;
    this.messageSizeBytes = messageSizeBytes;
    this.messageIntervalMs = messageIntervalMs;
  }

  /**
   * Connect to Centrifugo and subscribe to the channel
   */
  async connect(): Promise<void> {
    const connectionStart = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout for user ${this.user.id}`));
      }, 30000);

      this.client = new Centrifuge(this.centrifugoUrl, {
        token: this.user.token,
        data: {
          userId: this.user.id,
          userName: this.user.name,
        },
        websocket: WebSocket as unknown as typeof globalThis.WebSocket,
      });

      this.client.on('connected', () => {
        const connectionTime = Date.now() - connectionStart;
        this.metrics.recordConnectionTime(this.user.id, connectionTime);
        clearTimeout(timeout);

        // Subscribe to channel after connection
        this.subscribeToChannel()
          .then(() => resolve())
          .catch(reject);
      });

      this.client.on('error', (ctx) => {
        this.metrics.recordError(this.user.id);
        console.error(`User ${this.user.id} connection error:`, ctx.error);
      });

      this.client.on('disconnected', () => {
        if (this.isRunning) {
          this.metrics.recordError(this.user.id);
        }
      });

      this.client.connect();
    });
  }

  /**
   * Subscribe to the user's channel
   */
  private async subscribeToChannel(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    return new Promise((resolve, reject) => {
      const fullChannelName = `chat:${this.user.channelName}`;
      this.subscription = this.client!.newSubscription(fullChannelName);

      this.subscription.on('subscribed', () => {
        resolve();
      });

      this.subscription.on('error', (ctx) => {
        this.metrics.recordError(this.user.id);
        reject(new Error(`Subscription error: ${ctx.error?.message}`));
      });

      this.subscription.on('publication', (ctx: PublicationContext) => {
        const message = ctx.data as ChatMessage;
        // Calculate latency if sentAt is present
        if (message.sentAt) {
          const latency = Date.now() - message.sentAt;
          this.metrics.recordMessageReceived(this.user.id, latency);
        } else {
          this.metrics.recordMessageReceived(this.user.id);
        }
      });

      this.subscription.subscribe();
    });
  }

  /**
   * Start sending messages at the configured interval
   */
  startSendingMessages(): void {
    this.isRunning = true;

    const sendMessage = async () => {
      if (!this.isRunning || !this.subscription) return;

      try {
        const message: ChatMessage = {
          id: generateMessageId(),
          text: generateMessagePayload(this.messageSizeBytes),
          user: {
            id: this.user.id,
            name: this.user.name,
          },
          timestamp: new Date().toISOString(),
          sentAt: Date.now(),
        };

        await this.subscription.publish(message);
        this.metrics.recordMessageSent(this.user.id);
      } catch {
        this.metrics.recordError(this.user.id);
      }
    };

    // Send first message immediately
    sendMessage();

    // Then send at intervals
    this.messageTimer = setInterval(sendMessage, this.messageIntervalMs);
  }

  /**
   * Stop sending messages and disconnect
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.messageTimer) {
      clearInterval(this.messageTimer);
      this.messageTimer = null;
    }

    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  /**
   * Get user info
   */
  getUserInfo(): VirtualUser {
    return this.user;
  }
}
