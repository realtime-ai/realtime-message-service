/**
 * Token Service Port
 * Abstraction for JWT token generation
 */
export interface TokenPayload {
  sub: string;
  name?: string;
  info?: {
    name: string;
  };
}

export interface ITokenService {
  generateToken(payload: TokenPayload): Promise<string>;
  generateCentrifugoToken(payload: TokenPayload): Promise<string>;
}
