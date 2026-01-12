import crypto from 'crypto';
import { ITokenService, TokenPayload } from '../../core/ports/ITokenService.js';

/**
 * Node.js Crypto based JWT Token Service
 * Uses native Node.js crypto module for HMAC-SHA256 signing
 */
export class NodeCryptoTokenService implements ITokenService {
  constructor(
    private readonly jwtSecret: string,
    private readonly centrifugoSecret: string,
    private readonly tokenExpiry: number = 3600 // 1 hour
  ) {}

  private base64UrlEncode(data: string | Buffer): string {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    return buffer.toString('base64url');
  }

  private signJwt(payload: Record<string, unknown>, secret: string): string {
    const header = { alg: 'HS256', typ: 'JWT' };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64url');

    return `${signatureInput}.${signature}`;
  }

  async generateToken(payload: TokenPayload): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      ...payload,
      iat: now,
      exp: now + this.tokenExpiry,
    };

    return this.signJwt(jwtPayload, this.jwtSecret);
  }

  async generateCentrifugoToken(payload: TokenPayload): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Centrifugo token format
    const centrifugoPayload = {
      sub: payload.sub,
      info: payload.info,
      exp: now + this.tokenExpiry,
    };

    return this.signJwt(centrifugoPayload, this.centrifugoSecret);
  }
}
