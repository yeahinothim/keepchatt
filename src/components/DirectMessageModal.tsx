import React, { useState } from 'react';
import { X, Search, MessageSquare, User as UserIcon } from 'lucide-react';
import type { User, DirectMessageConversation } from '../types.ts';
import { api } from '../lib/api.ts';

interface DirectMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  onlineUserIds: Set<string>;
  onSelectDm: (dm: DirectMessageConversation) => void;
}

export const DirectMessageModal: React.FC<DirectMessageModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  onlineUserIds,
  onSelectDm,
}) => {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredUsers = allUsers.filter(
    (u) =>
      u.id !== currentUser.id &&
      (u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName.toLowerCase().includes(search.toLowerCase()))
  );

  const handleStartDm = async (targetUser: User) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.createDm(targetUser.id);
      onSelectDm(res.dm);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not start conversation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="dm-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        id="dm-modal-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 relative flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-neutral-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">Direct Message</h3>
          </div>
          <button
            id="dm-modal-close-btn"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="pt-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="dm-search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find someone by name or @handle..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 mt-2 pr-1">
          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              {allUsers.length <= 1
                ? 'No other users registered yet. Open an incognito window or invite a colleague to sign up!'
                : 'No users found matching your search.'}
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isOnline = onlineUserIds.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={loading}
                  onClick={() => handleStartDm(u)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-800 transition text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-xs"
                        style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
                      >
                        {(u.displayName || u.username).slice(0, 2).toUpperCase()}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-neutral-900 ${
                          isOnline ? 'bg-emerald-500' : 'bg-neutral-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                        {u.displayName || u.username}
                        <span className="text-xs text-neutral-500 font-normal">@{u.username}</span>
                      </div>
                      <div className="text-xs text-neutral-400 truncate">
                        {u.statusText || (isOnline ? 'Online now' : 'Offline')}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-neutral-500 group-hover:text-neutral-300 transition shrink-0">
                    Chat →
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
