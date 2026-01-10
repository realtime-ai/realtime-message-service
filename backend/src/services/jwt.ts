import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';

const SECRET_KEY = process.env.JWT_SECRET || 'my-secret-key-change-in-production';
const CENTRIFUGO_SECRET = process.env.CENTRIFUGO_SECRET || 'my-secret-key-change-in-production';

export function generateToken(userId: string, userName: string): string {
  const payload = {
    sub: userId,
    name: userName,
  };
  return jwt.sign(payload, SECRET_KEY, { expiresIn: '24h' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, SECRET_KEY) as JWTPayload;
  } catch {
    return null;
  }
}

export function generateCentrifugoToken(userId: string, userName: string): string {
  const payload = {
    sub: userId,
    info: {
      name: userName,
    },
  };
  return jwt.sign(payload, CENTRIFUGO_SECRET, { expiresIn: '24h' });
}
