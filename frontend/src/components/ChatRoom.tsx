import { useCentrifuge } from '../hooks/useCentrifuge';
import { User } from '../types';
import { ChannelInput } from './ChannelInput';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { UserList } from './UserList';

interface ChatRoomProps {
  user: User;
  centrifugoToken: string;
  onLogout: () => void;
}

export function ChatRoom({ user, centrifugoToken, onLogout }: ChatRoomProps) {
  const {
    connected,
    connecting,
    error,
    currentChannel,
    messages,
    users,
    joinChannel,
    leaveChannel,
    sendMessage,
  } = useCentrifuge({
    token: centrifugoToken,
    userName: user.name,
  });

  const connectionStatus = connecting
    ? 'Connecting...'
    : connected
    ? 'Connected'
    : 'Disconnected';

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">Centrifuge Chat</h1>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-500' : connecting ? 'bg-yellow-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-500">{connectionStatus}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Logged in as <strong>{user.name}</strong>
          </span>
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-100 border-b border-red-200 px-4 py-2 text-red-700 text-sm">
          Error: {error}
        </div>
      )}

      {/* Channel input */}
      <ChannelInput
        onJoin={joinChannel}
        onLeave={leaveChannel}
        currentChannel={currentChannel}
        disabled={!connected}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {currentChannel ? (
          <>
            {/* Messages area */}
            <div className="flex-1 flex flex-col bg-white">
              <MessageList messages={messages} currentUserId={user.id} />
              <MessageInput onSend={sendMessage} disabled={!connected} />
            </div>
            {/* User list */}
            <UserList users={users} currentUserId={user.id} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">Welcome to Centrifuge Chat!</p>
              <p>Enter a channel name above to join a chat room.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
