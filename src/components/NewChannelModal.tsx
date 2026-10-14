import React, { useState, useEffect } from 'react';
import { X, Hash, Folder } from 'lucide-react';
import { api } from '../lib/api.ts';
import type { Channel, ChannelCategory } from '../types.ts';

interface NewChannelModalProps {
  isOpen: boolean;
  categories?: ChannelCategory[];
  defaultCategoryId?: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export const NewChannelModal: React.FC<NewChannelModalProps> = ({
  isOpen,
  categories = [],
  defaultCategoryId,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultCategoryId) {
      setCategoryId(defaultCategoryId);
    }
  }, [defaultCategoryId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanName = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');

      if (!cleanName) {
        throw new Error('Please enter a valid channel name.');
      }

      const res = await api.createChannel({
        name: cleanName,
        description: description.trim(),
        topic: topic.trim(),
        type,
        categoryId: categoryId || undefined,
      });

      onCreated(res.channel);
      onClose();
      setName('');
      setDescription('');
      setTopic('');
      setCategoryId('');
    } catch (err: any) {
      setError(err.message || 'Failed to create channel.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="new-channel-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        id="new-channel-modal-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 relative"
      >
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-neutral-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">Create Channel</h3>
          </div>
          <button
            id="new-channel-close-btn"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-2.5 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              Channel Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-500 font-mono">
                #
              </span>
              <input
                id="new-channel-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="announcements"
                required
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 pl-7 pr-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition font-mono"
              />
            </div>
            <span className="text-[11px] text-neutral-500 mt-1 block">
              Alphanumeric characters, dashes, and underscores
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              Channel Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('text')}
                className={`flex-1 py-2 rounded-lg text-sm transition border ${
                  type === 'text'
                    ? 'bg-neutral-800 border-neutral-600 text-white'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-900'
                }`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setType('voice')}
                className={`flex-1 py-2 rounded-lg text-sm transition border ${
                  type === 'voice'
                    ? 'bg-neutral-800 border-neutral-600 text-white'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-900'
                }`}
              >
                Voice
              </button>
            </div>
          </div>

          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
              >
                <option value="">(No Category)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    📁 {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              Purpose / Description
            </label>
            <input
              id="new-channel-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              Topic <span className="text-neutral-600 font-normal lowercase">(optional)</span>
            </label>
            <input
              id="new-channel-topic-input"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Focus on release v2.0"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
            <button
              id="new-channel-submit-btn"
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold bg-white text-neutral-900 rounded-lg hover:bg-neutral-100 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
