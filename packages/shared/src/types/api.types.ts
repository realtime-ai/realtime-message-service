/**
 * API Request/Response types
 */

// Auth types
export interface LoginRequest {
  username: string;
}

export interface LoginResponse {
  user: {
    id: string;
    name: string;
  };
  token: string;
  centrifugoToken: string;
}

// Chat message type (for API responses)
export interface ChatMessageDTO {
  id: string;
  text: string;
  user: {
    id: string;
    name: string;
  };
  timestamp: string;
}

// Error response
export interface ErrorResponse {
  error: string;
}
