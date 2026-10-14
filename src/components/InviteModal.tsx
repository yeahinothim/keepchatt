import React, { useState } from 'react';
import { X, Copy, Check, UserPlus, Search, Shield, ArrowRight, Loader2 } from 'lucide-react';
import type { Server, User } from '../types.ts';
import { api } from '../lib/api.ts';

interface InviteModalProps {
  server: Server;
  allUsers: User[];
  currentUser: User | null;
  onClose: () => void;
  onServerJoined?: (server: Server) => void;
  onServerUpdated?: (server: Server) => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  server,
  allUsers,
  currentUser,
  onClose,
  onServerJoined,
  onServerUpdated,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const inviteCode = server.inviteCode || `srv-${server.id}`;
  const serverMembers = new Set(server.memberIds || [server.ownerId]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInviteUser = async (user: User) => {
    try {
      const res = await api.inviteUserToServer(server.id, user.id);
      if (res.server) {
        setInvitedUserIds((prev) => new Set(prev).add(user.id));
        if (onServerUpdated) onServerUpdated(res.server);
        setStatusMessage({ type: 'success', text: `Invited @${user.username} to ${server.name}!` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to invite user.' });
    }
  };

  const handleJoinServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setStatusMessage(null);
    try {
      const res = await api.joinServer(joinCode.trim());
      if (res.server) {
        if (onServerJoined) onServerJoined(res.server);
        setStatusMessage({ type: 'success', text: `Successfully joined server "${res.server.name}"!` });
        setTimeout(() => onClose(), 1200);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Invalid invite code or server not found.' });
    } finally {
      setJoining(false);
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.id !== currentUser?.id &&
      (u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700/80 flex items-center justify-center text-xl shadow-inner shrink-0">
              {server.icon || '🌐'}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Invite Friends to {server.name}</h2>
              <p className="text-xs text-neutral-400">Share your invite code or add members directly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/80 border border-rose-800 text-rose-300'
              }`}
            >
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Section 1: Invite Code Share */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-300 block">
              Server Invite Code / Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteCode}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-emerald-400 font-mono font-bold select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              Anyone with this code can instantly join this server.
            </p>
          </div>

          {/* Section 2: Direct Friend / Member List */}
          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                Directly Invite Workspace Users
              </label>
              <span className="text-[11px] text-neutral-500">{filteredUsers.length} Users</span>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Search by username or display name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-700"
              />
            </div>

            {/* Users List */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 pt-1">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-6 text-xs text-neutral-500">
                  No users found matching "{searchQuery}"
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const inServer = serverMembers.has(u.id) || invitedUserIds.has(u.id);
                  return (
                    <div
                      key={u.id}
                      className="p-2 bg-neutral-950/70 border border-neutral-800/80 rounded-xl flex items-center justify-between hover:border-neutral-700/80 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white overflow-hidden shrink-0"
                          style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
                        >
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            (u.displayName || u.username).slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {u.displayName || u.username}
                          </div>
                          <div className="text-[10px] text-neutral-500 truncate">@{u.username}</div>
                        </div>
                      </div>

                      {inServer ? (
                        <span className="px-2.5 py-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 rounded-lg flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Joined</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleInviteUser(u)}
                          className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Invite</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 3: Join Another Server Code Input */}
          <div className="space-y-2 pt-3 border-t border-neutral-800">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-300 block">
              Join Another Server With Code
            </label>
            <form onSubmit={handleJoinServer} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter invite code (e.g. srv-a1b2c3)..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0"
              >
                {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                <span>Join</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
