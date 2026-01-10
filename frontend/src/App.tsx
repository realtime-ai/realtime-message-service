import { useState, useEffect } from 'react';
import { User } from './types';
import { login } from './services/api';
import { LoginForm } from './components/LoginForm';
import { ChatRoom } from './components/ChatRoom';

interface AuthState {
  user: User | null;
  token: string | null;
  centrifugoToken: string | null;
}

const AUTH_STORAGE_KEY = 'centrifuge_chat_auth';

function App() {
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    token: null,
    centrifugoToken: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load auth from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAuth(parsed);
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  }, []);

  const handleLogin = async (username: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await login(username);
      const newAuth: AuthState = {
        user: response.user,
        token: response.token,
        centrifugoToken: response.centrifugoToken,
      };
      setAuth(newAuth);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newAuth));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuth({
      user: null,
      token: null,
      centrifugoToken: null,
    });
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  if (!auth.user || !auth.centrifugoToken) {
    return <LoginForm onLogin={handleLogin} loading={loading} error={error} />;
  }

  return (
    <ChatRoom user={auth.user} centrifugoToken={auth.centrifugoToken} onLogout={handleLogout} />
  );
}

export default App;
