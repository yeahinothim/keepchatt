import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Server } from '../types.ts';
import { api } from '../lib/api.ts';

interface NewServerModalProps {
  onClose: () => void;
  onCreated: (newServer: Server) => void;
}

const POPULAR_EMOJIS = ['🌐', '💬', '🎮', '🚀', '🎓', '🎨', '🎵', '🛡️', '🍿', '💡', '🔥', '💻', '🍕', '😺', '👾', '🌈'];

export const NewServerModal: React.FC<NewServerModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🌐');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Server name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.createServer({
        name: name.trim(),
        icon: icon.trim(),
        description: description.trim(),
      });
      if (res?.server) {
        onCreated(res.server);
        onClose();
      } else {
        throw new Error('Failed to create server.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 shadow-2xl animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Create a Server</h2>
            <p className="text-xs text-neutral-400">Your server is where you and your friends hang out.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Server Name
            </label>
            <input
              type="text"
              required
              maxLength={40}
              placeholder="e.g. kep's cool workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Icon Selector */}
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
                      setError('Failed to upload image icon.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                />
              </label>
            </div>
            {/* Emojis Grid */}
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

          {/* Description Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Description (Optional)
            </label>
            <textarea
              maxLength={120}
              placeholder="Give your server a brief topic or description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-neutral-950 border border-neutral-800 focus:outline-none focus:border-indigo-500 transition-colors h-16 resize-none"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium text-sm flex items-center gap-1.5 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
