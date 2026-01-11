import { ENVIRONMENTS, EnvironmentConfig } from '../services/config';

interface EnvSelectorProps {
  currentEnv: string;
  onEnvChange: (env: string) => void;
  disabled?: boolean;
}

export function EnvSelector({ currentEnv, onEnvChange, disabled }: EnvSelectorProps) {
  const config = ENVIRONMENTS[currentEnv];

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Environment:</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-300">
        {Object.entries(ENVIRONMENTS).map(([key, env]) => (
          <button
            key={key}
            onClick={() => onEnvChange(key)}
            disabled={disabled}
            className={`px-3 py-1 transition-colors ${
              currentEnv === key
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {env.name}
          </button>
        ))}
      </div>
      <div
        className={`w-2 h-2 rounded-full ${
          currentEnv === 'local' ? 'bg-yellow-500' : 'bg-green-500'
        }`}
        title={config.apiUrl}
      />
    </div>
  );
}

interface EnvInfoProps {
  config: EnvironmentConfig;
}

export function EnvInfo({ config }: EnvInfoProps) {
  return (
    <div className="text-xs text-gray-400 mt-1">
      <div>API: {config.apiUrl}</div>
      <div>WS: {config.centrifugoUrl}</div>
    </div>
  );
}
