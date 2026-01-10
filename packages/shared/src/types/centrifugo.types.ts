/**
 * Centrifugo Protocol Types
 * Based on Centrifugo proxy protocol specification
 */

// Connect proxy
export interface CentrifugoConnectRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  data?: {
    token?: string;
  };
}

export interface CentrifugoConnectResponse {
  result?: {
    user: string;
    expire_at?: number;
    info?: Record<string, unknown>;
    channels?: string[];
  };
  error?: CentrifugoError;
}

// Subscribe proxy
export interface CentrifugoSubscribeRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  user: string;
  channel: string;
  data?: Record<string, unknown>;
}

export interface CentrifugoSubscribeResponse {
  result?: {
    info?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  error?: CentrifugoError;
}

// Publish proxy
export interface CentrifugoPublishRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  user: string;
  channel: string;
  data: {
    text: string;
  };
  info?: {
    name?: string;
  };
}

export interface CentrifugoPublishResponse {
  result?: {
    data?: Record<string, unknown>;
  };
  error?: CentrifugoError;
}

// Common error type
export interface CentrifugoError {
  code: number;
  message: string;
}
