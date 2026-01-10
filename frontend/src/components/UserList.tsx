import { PresenceInfo } from '../types';

interface UserListProps {
  users: PresenceInfo[];
  currentUserId: string;
}

export function UserList({ users, currentUserId }: UserListProps) {
  const getUserName = (info: PresenceInfo) => {
    return info.connInfo?.name || info.user || 'Unknown';
  };

  return (
    <div className="w-64 bg-gray-50 border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-700">
          Online Users ({users.length})
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {users.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-4">
            No users online
          </div>
        ) : (
          <ul className="space-y-1">
            {users.map((user) => {
              const isCurrentUser = user.user === currentUserId;
              return (
                <li
                  key={user.client}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                    isCurrentUser ? 'bg-blue-50' : 'hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className={`text-sm ${isCurrentUser ? 'font-semibold text-blue-600' : 'text-gray-700'}`}>
                    {getUserName(user)}
                    {isCurrentUser && ' (you)'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
