export interface User {
  id: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  user: User;
  timestamp: string;
}

export interface PresenceInfo {
  client: string;
  user: string;
  connInfo?: {
    name?: string;
  };
  chanInfo?: Record<string, unknown>;
}

export interface JoinLeaveEvent {
  info: PresenceInfo;
}

export interface AuthResponse {
  user: User;
  token: string;
  centrifugoToken: string;
}
