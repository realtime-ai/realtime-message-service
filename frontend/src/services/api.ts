import { AuthResponse } from '../types';
import { configService } from './config';

export async function login(username: string): Promise<AuthResponse> {
  const apiUrl = configService.getApiUrl();

  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: username }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}
