/**
 * Environment configuration service
 * Allows switching between local and remote services
 */

export interface EnvironmentConfig {
  name: string;
  apiUrl: string;
  centrifugoUrl: string;
}

export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  local: {
    name: 'Local',
    apiUrl: 'http://localhost:8787',
    centrifugoUrl: 'ws://localhost:8000/connection/websocket',
  },
  remote: {
    name: 'Remote',
    apiUrl: 'https://centrifuge-realtime-message-api.leeoxiang.workers.dev',
    centrifugoUrl: 'wss://centrifuge-realtime-message.fly.dev/connection/websocket',
  },
};

const CONFIG_STORAGE_KEY = 'centrifuge_env_config';

class ConfigService {
  private currentEnv: string;

  constructor() {
    this.currentEnv = this.loadEnv();
  }

  private loadEnv(): string {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored && ENVIRONMENTS[stored]) {
      return stored;
    }
    // Default to remote in production, local in development
    return import.meta.env.DEV ? 'local' : 'remote';
  }

  getEnv(): string {
    return this.currentEnv;
  }

  setEnv(env: string): void {
    if (ENVIRONMENTS[env]) {
      this.currentEnv = env;
      localStorage.setItem(CONFIG_STORAGE_KEY, env);
    }
  }

  getConfig(): EnvironmentConfig {
    return ENVIRONMENTS[this.currentEnv];
  }

  getApiUrl(): string {
    return this.getConfig().apiUrl;
  }

  getCentrifugoUrl(): string {
    return this.getConfig().centrifugoUrl;
  }

  isLocal(): boolean {
    return this.currentEnv === 'local';
  }

  isRemote(): boolean {
    return this.currentEnv === 'remote';
  }
}

export const configService = new ConfigService();
