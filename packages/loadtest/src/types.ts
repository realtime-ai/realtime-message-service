/**
 * Load test configuration
 */
export interface LoadTestConfig {
  /** Number of channels to create */
  channelCount: number;
  /** Number of users per channel */
  usersPerChannel: number;
  /** Message size in bytes */
  messageSizeBytes: number;
  /** Interval between messages in milliseconds */
  messageIntervalMs: number;
  /** Total test duration in milliseconds */
  durationMs: number;
  /** Centrifugo WebSocket URL */
  centrifugoUrl: string;
  /** Backend API URL */
  apiUrl: string;
}

/**
 * Authentication response from the backend
 */
export interface AuthResponse {
  user: {
    id: string;
    name: string;
  };
  token: string;
  centrifugoToken: string;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  text: string;
  user: {
    id: string;
    name: string;
  };
  timestamp: string;
  /** Timestamp when message was sent (for latency calculation) */
  sentAt?: number;
}

/**
 * Individual user metrics
 */
export interface UserMetrics {
  userId: string;
  channelName: string;
  connectionTimeMs: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  latencies: number[];
}

/**
 * Aggregated load test metrics
 */
export interface LoadTestMetrics {
  /** Test configuration */
  config: LoadTestConfig;
  /** Total number of connections attempted */
  totalConnections: number;
  /** Number of successful connections */
  successfulConnections: number;
  /** Number of failed connections */
  failedConnections: number;
  /** Total messages sent */
  totalMessagesSent: number;
  /** Total messages received (across all users) */
  totalMessagesReceived: number;
  /** Total errors during the test */
  totalErrors: number;
  /** Connection time statistics (ms) */
  connectionTime: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
  };
  /** Message latency statistics (ms) */
  latency: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
  };
  /** Messages per second (sent) */
  messagesPerSecondSent: number;
  /** Messages per second (received) */
  messagesPerSecondReceived: number;
  /** Test duration in seconds */
  actualDurationSeconds: number;
  /** Timestamp when test started */
  startTime: Date;
  /** Timestamp when test ended */
  endTime: Date;
  /** Per-user metrics */
  userMetrics: UserMetrics[];
}

/**
 * Virtual user state
 */
export interface VirtualUser {
  id: string;
  name: string;
  channelName: string;
  token: string;
  metrics: UserMetrics;
}
