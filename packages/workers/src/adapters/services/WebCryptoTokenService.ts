import { ITokenService, TokenPayload } from '../../core/ports/ITokenService';

/**
 * Web Crypto API based JWT Token Service
 * Compatible with Cloudflare Workers runtime
 */
export class WebCryptoTokenService implements ITokenService {
  private readonly encoder = new TextEncoder();
  private jwtKey: CryptoKey | null = null;
  private centrifugoKey: CryptoKey | null = null;

  constructor(
    private readonly jwtSecret: string,
    private readonly centrifugoSecret: string,
    private readonly tokenExpiry: number = 3600 // 1 hour
  ) {}

  private async getJwtKey(): Promise<CryptoKey> {
    if (!this.jwtKey) {
      this.jwtKey = await crypto.subtle.importKey(
        'raw',
        this.encoder.encode(this.jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
    }
    return this.jwtKey;
  }

  private async getCentrifugoKey(): Promise<CryptoKey> {
    if (!this.centrifugoKey) {
      this.centrifugoKey = await crypto.subtle.importKey(
        'raw',
        this.encoder.encode(this.centrifugoSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
    }
    return this.centrifugoKey;
  }

  private base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private async signJwt(payload: Record<string, unknown>, key: CryptoKey): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };

    const encodedHeader = this.base64UrlEncode(this.encoder.encode(JSON.stringify(header)));
    const encodedPayload = this.base64UrlEncode(this.encoder.encode(JSON.stringify(payload)));

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign('HMAC', key, this.encoder.encode(signatureInput));

    return `${signatureInput}.${this.base64UrlEncode(signature)}`;
  }

  async generateToken(payload: TokenPayload): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      ...payload,
      iat: now,
      exp: now + this.tokenExpiry,
    };

    const key = await this.getJwtKey();
    return this.signJwt(jwtPayload, key);
  }

  async generateCentrifugoToken(payload: TokenPayload): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Centrifugo token format
    const centrifugoPayload = {
      sub: payload.sub,
      info: payload.info,
      exp: now + this.tokenExpiry,
    };

    const key = await this.getCentrifugoKey();
    return this.signJwt(centrifugoPayload, key);
  }
}
