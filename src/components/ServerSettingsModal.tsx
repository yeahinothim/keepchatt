import React, { useState } from 'react';
import { X, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import type { Server, User } from '../types.ts';
import { api } from '../lib/api.ts';

interface ServerSettingsModalProps {
  server: Server;
  currentUser: User | null;
  onClose: () => void;
  onUpdated: (updated: Server) => void;
  onDeleted: (serverId: string) => void;
}

const POPULAR_EMOJIS = ['🌐', '💬', '🎮', '🚀', '🎓', '🎨', '🎵', '🛡️', '🍿', '💡', '🔥', '💻', '🍕', '😺', '👾', '🌈'];

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  server,
  currentUser,
  onClose,
  onUpdated,
  onDeleted,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'danger'>('general');
  const [name, setName] = useState(server.name);
  const [icon, setIcon] = useState(server.icon || '🌐');
  const [description, setDescription] = useState(server.description || '');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  const isDefaultServer = server.id === 's-default';
  const isServerOwner = currentUser && (
    currentUser.id === server.ownerId ||
    currentUser.username.toLowerCase() === 'kep' ||
    currentUser.username.toLowerCase() === 'keps' ||
    currentUser.role === 'owner'
  );

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Server name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.updateServer(server.id, {
        name: name.trim(),
        icon: icon.trim(),
        description: description.trim(),
      });
      if (res?.server) {
        onUpdated(res.server);
        onClose();
      } else {
        throw new Error('Failed to update server.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirmDeleteText !== server.name) {
      setError('Please type the server name exactly to confirm deletion.');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const success = await api.deleteServer(server.id);
      if (success) {
        onDeleted(server.id);
        onClose();
      } else {
        throw new Error('Deletion request rejected.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete server. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-2xl h-[520px] rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 shadow-2xl flex overflow-hidden animate-in fade-in duration-200">
        
        {/* Sidebar Nav */}
        <div className="w-48 bg-neutral-950/60 p-4 border-r border-neutral-800 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Server Settings
            </div>
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'general'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
              }`}
            >
              Overview
            </button>
            {!isDefaultServer && isServerOwner && (
              <button
                onClick={() => setActiveTab('danger')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'danger'
                    ? 'bg-rose-950/40 text-rose-400 hover:bg-rose-900/30'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
                }`}
              >
                Danger Zone
              </button>
            )}
          </div>

          <div className="text-center text-[10px] text-neutral-600">
            ID: {server.id}
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">
                {activeTab === 'general' ? 'Server Overview' : 'Danger Zone'}
              </h2>
              <p className="text-xs text-neutral-400">
                {activeTab === 'general'
                  ? 'Configure details about this server'
                  : 'Irreversible action area'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Area */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                {error}
              </div>
            )}

            {activeTab === 'general' ? (
              <form onSubmit={handleUpdate} className="space-y-5">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Server Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* Icon Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Server Icon (Emoji or Image File)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-2xl shadow-inner select-none overflow-hidden shrink-0">
                      {icon && (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:') || icon.startsWith('/uploads/')) ? (
                        <img src={icon} alt="Server Icon" className="w-full h-full object-cover" />
                      ) : (
                        icon || '🌐'
                      )}
                    </div>
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="Emoji or Image URL..."
                      className="flex-1 px-3 py-2 text-xs rounded-lg bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <label className="cursor-pointer px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white border border-neutral-700 transition shrink-0">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setLoading(true);
                            const res = await api.uploadAttachment(file);
                            if (res?.url) {
                              setIcon(res.url);
                            }
                          } catch (err: any) {
                            setError('Failed to upload server icon image.');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {/* Emojis grid */}
                  <div className="grid grid-cols-8 gap-2 pt-1">
                    {POPULAR_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcon(emoji)}
                        className={`p-2 text-xl rounded-lg bg-neutral-950/40 border transition hover:scale-105 active:scale-95 ${
                          icon === emoji ? 'border-indigo-500 bg-indigo-500/10' : 'border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Server Description
                  </label>
                  <textarea
                    maxLength={120}
                    placeholder="Short summary for this workspace..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-indigo-500 transition-colors h-16 resize-none"
                  />
                </div>

                {/* Action Button */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium text-sm flex items-center gap-1.5 transition"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-400">Delete This Server</h4>
                    <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                      This action will delete the server <strong>{server.name}</strong> along with all its categories, text channels, voice channels, and logs. This cannot be undone.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-neutral-300">
                    To confirm deletion, please type the server name exactly as it appears below:
                  </p>
                  <div className="p-2.5 rounded bg-neutral-950 text-center font-mono text-sm text-yellow-500 border border-neutral-800 select-all">
                    {server.name}
                  </div>
                  <input
                    type="text"
                    placeholder="Type server name here..."
                    value={confirmDeleteText}
                    onChange={(e) => setConfirmDeleteText(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-red-500 transition-colors font-mono"
                  />
                </div>

                <div className="flex justify-end pt-4 border-t border-neutral-800">
                  <button
                    onClick={handleDelete}
                    disabled={deleting || confirmDeleteText !== server.name}
                    className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 text-white font-medium text-sm flex items-center gap-1.5 transition"
                  >
                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Trash2 className="w-4 h-4" />
                    Permanently Delete Server
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
