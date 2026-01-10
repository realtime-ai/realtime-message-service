import { useState } from 'react';

interface ChannelInputProps {
  onJoin: (channelName: string) => void;
  onLeave: () => void;
  currentChannel: string | null;
  disabled: boolean;
}

export function ChannelInput({ onJoin, onLeave, currentChannel, disabled }: ChannelInputProps) {
  const [channelName, setChannelName] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (channelName.trim()) {
      onJoin(channelName.trim());
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      {currentChannel ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Channel:</span>
            <span className="font-semibold text-blue-600">#{currentChannel}</span>
          </div>
          <button
            onClick={onLeave}
            className="px-4 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
          >
            Leave Channel
          </button>
        </div>
      ) : (
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="Enter channel name (e.g., general)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            disabled={disabled}
          />
          <button
            type="submit"
            disabled={disabled || !channelName.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Join
          </button>
        </form>
      )}
    </div>
  );
}
