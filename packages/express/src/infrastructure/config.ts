import dotenv from 'dotenv';
import { LogLevel } from '../core/ports/ILogger.js';

// Load environment variables
dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  centrifugoSecret: string;
  frontendUrl: string;
  logLevel: LogLevel;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // Provide defaults for development
    const defaults: Record<string, string> = {
      JWT_SECRET: 'dev-jwt-secret-change-in-production',
      CENTRIFUGO_SECRET: 'dev-centrifugo-secret-change-in-production',
    };
    if (defaults[key]) {
      return defaults[key];
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config: Config = {
  port: parseInt(getOptionalEnv('PORT', '8787'), 10),
  nodeEnv: getOptionalEnv('NODE_ENV', 'development'),
  jwtSecret: getRequiredEnv('JWT_SECRET'),
  centrifugoSecret: getRequiredEnv('CENTRIFUGO_SECRET'),
  frontendUrl: getOptionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  logLevel: getOptionalEnv('LOG_LEVEL', 'info') as LogLevel,
};

export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    if (config.jwtSecret.includes('dev-') || config.centrifugoSecret.includes('dev-')) {
      throw new Error('Production environment requires proper secrets');
    }
  }
}
