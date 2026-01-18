/**
 * Centrifuge WebSocket Reconnection Client
 *
 * A wrapper around centrifuge-js that provides enhanced reconnection handling,
 * event monitoring, and metrics collection.
 */

import { Centrifuge, Subscription, PublicationContext, SubscribedContext } from 'centrifuge';
import WebSocket from 'ws';

/**
 * Reconnection configuration options
 */
export interface ReconnectConfig {
  /** WebSocket URL */
  url: string;
  /** Authentication token (optional) */
  token?: string;
  /** Connection data sent on connect */
  data?: Record<string, unknown>;
  /** Minimum reconnection delay in ms (default: 500) */
  minReconnectDelay?: number;
  /** Maximum reconnection delay in ms (default: 20000) */
  maxReconnectDelay?: number;
  /** Maximum time to wait for server ping in ms (default: 10000) */
  maxServerPingDelay?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * Reconnection statistics
 */
export interface ReconnectStats {
  /** Total number of connection attempts */
  connectAttempts: number;
  /** Number of successful connections */
  connectSuccess: number;
  /** Number of failed connections */
  connectFailed: number;
  /** Number of reconnections */
  reconnectCount: number;
  /** Current connection state */
  state: ConnectionState;
  /** Last disconnect reason */
  lastDisconnectReason?: string;
  /** Last disconnect code */
  lastDisconnectCode?: number;
  /** Time of last successful connection */
  lastConnectedAt?: Date;
  /** Time of last disconnection */
  lastDisconnectedAt?: Date;
  /** Connection uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Event types for the reconnection client
 */
export interface ReconnectClientEvents {
  /** Fired on first successful connection */
  connected: (ctx: { clientId: string; transport: string }) => void;
  /** Fired when disconnected */
  disconnected: (ctx: { reason: string; code: number; reconnect: boolean }) => void;
  /** Fired when reconnection attempt starts */
  reconnecting: (ctx: { attempt: number; delay: number }) => void;
  /** Fired when successfully reconnected */
  reconnected: (ctx: { clientId: string; attempt: number }) => void;
  /** Fired on connection error */
  error: (ctx: { error: Error }) => void;
  /** Fired on state change */
  stateChange: (ctx: { oldState: ConnectionState; newState: ConnectionState }) => void;
}

type EventHandler<T extends keyof ReconnectClientEvents> = ReconnectClientEvents[T];

/**
 * ReconnectClient - Enhanced Centrifuge client with reconnection handling
 */
export class ReconnectClient {
  private centrifuge: Centrifuge;
  private config: Required<ReconnectConfig>;
  private stats: ReconnectStats;
  private state: ConnectionState = 'disconnected';
  private connectionStartTime?: Date;
  private reconnectAttempt = 0;
  private eventHandlers: Map<keyof ReconnectClientEvents, Set<Function>> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(config: ReconnectConfig) {
    this.config = {
      url: config.url,
      token: config.token || '',
      data: config.data || {},
      minReconnectDelay: config.minReconnectDelay || 500,
      maxReconnectDelay: config.maxReconnectDelay || 20000,
      maxServerPingDelay: config.maxServerPingDelay || 10000,
      debug: config.debug || false,
    };

    this.stats = {
      connectAttempts: 0,
      connectSuccess: 0,
      connectFailed: 0,
      reconnectCount: 0,
      state: 'disconnected',
      uptimeSeconds: 0,
    };

    this.centrifuge = this.createCentrifuge();
    this.setupEventHandlers();
  }

  private createCentrifuge(): Centrifuge {
    const options: any = {
      websocket: WebSocket as any,
      minReconnectDelay: this.config.minReconnectDelay,
      maxReconnectDelay: this.config.maxReconnectDelay,
      maxServerPingDelay: this.config.maxServerPingDelay,
      data: this.config.data,
    };

    if (this.config.token) {
      options.token = this.config.token;
    }

    return new Centrifuge(this.config.url, options);
  }

  private setupEventHandlers(): void {
    this.centrifuge.on('connecting', (ctx) => {
      this.log('Connecting...', ctx);
      this.stats.connectAttempts++;

      if (this.state === 'disconnected' && this.stats.connectSuccess > 0) {
        this.reconnectAttempt++;
        this.emit('reconnecting', {
          attempt: this.reconnectAttempt,
          delay: this.calculateBackoffDelay(),
        });
      }

      this.setState('connecting');
    });

    this.centrifuge.on('connected', (ctx) => {
      const wasReconnect = this.stats.connectSuccess > 0 && this.state !== 'connected';
      this.stats.connectSuccess++;
      this.connectionStartTime = new Date();
      this.stats.lastConnectedAt = this.connectionStartTime;

      this.setState('connected');

      if (wasReconnect) {
        this.stats.reconnectCount++;
        this.log('Reconnected', { attempt: this.reconnectAttempt });
        this.emit('reconnected', {
          clientId: ctx.client,
          attempt: this.reconnectAttempt,
        });
        this.reconnectAttempt = 0;
      } else {
        this.log('Connected', ctx);
        this.emit('connected', {
          clientId: ctx.client,
          transport: ctx.transport,
        });
      }
    });

    this.centrifuge.on('disconnected', (ctx) => {
      this.log('Disconnected', ctx);
      this.stats.lastDisconnectReason = ctx.reason;
      this.stats.lastDisconnectCode = ctx.code;
      this.stats.lastDisconnectedAt = new Date();

      // Update uptime
      if (this.connectionStartTime) {
        this.stats.uptimeSeconds += (Date.now() - this.connectionStartTime.getTime()) / 1000;
        this.connectionStartTime = undefined;
      }

      this.setState('disconnected');

      this.emit('disconnected', {
        reason: ctx.reason,
        code: ctx.code,
        reconnect: ctx.reconnect,
      });
    });

    this.centrifuge.on('error', (ctx) => {
      this.log('Error', ctx);
      this.stats.connectFailed++;
      this.emit('error', { error: ctx.error });
    });
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.stats.state = newState;
      this.emit('stateChange', { oldState, newState });
    }
  }

  private calculateBackoffDelay(): number {
    const delay = Math.min(
      this.config.minReconnectDelay * Math.pow(2, this.reconnectAttempt),
      this.config.maxReconnectDelay
    );
    return delay;
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[ReconnectClient] ${message}`, data || '');
    }
  }

  private emit<T extends keyof ReconnectClientEvents>(
    event: T,
    data: Parameters<ReconnectClientEvents[T]>[0]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          (handler as Function)(data);
        } catch (err) {
          console.error(`Error in event handler for ${event}:`, err);
        }
      });
    }
  }

  /**
   * Register an event handler
   */
  on<T extends keyof ReconnectClientEvents>(event: T, handler: EventHandler<T>): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove an event handler
   */
  off<T extends keyof ReconnectClientEvents>(event: T, handler: EventHandler<T>): this {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
    return this;
  }

  /**
   * Connect to the server
   */
  connect(): void {
    this.log('Initiating connection');
    this.centrifuge.connect();
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.log('Disconnecting');
    this.reconnectAttempt = 0;
    this.centrifuge.disconnect();
  }

  /**
   * Subscribe to a channel
   */
  subscribe(
    channel: string,
    handlers?: {
      onPublication?: (ctx: PublicationContext) => void;
      onSubscribed?: (ctx: SubscribedContext) => void;
      onError?: (ctx: { error: Error }) => void;
    }
  ): Subscription {
    let sub = this.subscriptions.get(channel);
    if (!sub) {
      sub = this.centrifuge.newSubscription(channel);
      this.subscriptions.set(channel, sub);

      if (handlers?.onPublication) {
        sub.on('publication', handlers.onPublication);
      }
      if (handlers?.onSubscribed) {
        sub.on('subscribed', handlers.onSubscribed);
      }
      if (handlers?.onError) {
        sub.on('error', handlers.onError);
      }

      sub.subscribe();
    }
    return sub;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    const sub = this.subscriptions.get(channel);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(channel);
    }
  }

  /**
   * Get the underlying Centrifuge instance
   */
  getCentrifuge(): Centrifuge {
    return this.centrifuge;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get reconnection statistics
   */
  getStats(): Readonly<ReconnectStats> {
    // Update uptime if currently connected
    let uptimeSeconds = this.stats.uptimeSeconds;
    if (this.connectionStartTime) {
      uptimeSeconds += (Date.now() - this.connectionStartTime.getTime()) / 1000;
    }

    return {
      ...this.stats,
      uptimeSeconds,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      connectAttempts: 0,
      connectSuccess: 0,
      connectFailed: 0,
      reconnectCount: 0,
      state: this.state,
      uptimeSeconds: 0,
    };
    if (this.connectionStartTime) {
      this.connectionStartTime = new Date();
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }
}

/**
 * Create a ReconnectClient with default configuration
 */
export function createReconnectClient(config: ReconnectConfig): ReconnectClient {
  return new ReconnectClient(config);
}
