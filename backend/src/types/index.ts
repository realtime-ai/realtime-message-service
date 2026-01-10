// User types
export interface User {
  id: string;
  name: string;
}

// Chat message type
export interface ChatMessage {
  id: string;
  text: string;
  user: User;
  timestamp: string;
}

// Centrifugo proxy request types
export interface CentrifugoConnectRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  data?: {
    token?: string;
  };
}

export interface CentrifugoSubscribeRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  user: string;
  channel: string;
  data?: Record<string, unknown>;
}

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

// Centrifugo proxy response types
export interface CentrifugoConnectResponse {
  result?: {
    user: string;
    expire_at?: number;
    info?: Record<string, unknown>;
    channels?: string[];
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface CentrifugoSubscribeResponse {
  result?: {
    info?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface CentrifugoPublishResponse {
  result?: {
    data?: ChatMessage;
  };
  error?: {
    code: number;
    message: string;
  };
}

// JWT payload
export interface JWTPayload {
  sub: string;
  name: string;
  exp: number;
  iat: number;
}
