import { useState, useEffect } from 'react';
import { User } from './types';
import { login } from './services/api';
import { LoginForm } from './components/LoginForm';
import { ChatRoom } from './components/ChatRoom';
import { EnvSelector, EnvInfo } from './components/EnvSelector';
import { configService, ENVIRONMENTS } from './services/config';

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
  const [currentEnv, setCurrentEnv] = useState(configService.getEnv());

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

  const handleEnvChange = (env: string) => {
    configService.setEnv(env);
    setCurrentEnv(env);
    // Logout when environment changes to avoid token mismatch
    if (auth.user) {
      handleLogout();
    }
  };

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

  const envConfig = ENVIRONMENTS[currentEnv];

  if (!auth.user || !auth.centrifugoToken) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="absolute top-4 right-4">
          <EnvSelector currentEnv={currentEnv} onEnvChange={handleEnvChange} disabled={loading} />
        </div>
        <LoginForm onLogin={handleLogin} loading={loading} error={error} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <ChatRoom
        user={auth.user}
        centrifugoToken={auth.centrifugoToken}
        centrifugoUrl={envConfig.centrifugoUrl}
        onLogout={handleLogout}
      />
      <div className="absolute bottom-4 right-4">
        <EnvInfo config={envConfig} />
      </div>
    </div>
  );
}

export default App;
