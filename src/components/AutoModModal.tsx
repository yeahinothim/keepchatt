import React, { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Trash2, X, Clock, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import type { AutoModConfig } from '../types.ts';

interface AutoModModalProps {
  onClose: () => void;
  onSuccess?: (config: AutoModConfig) => void;
}

const SLOWMODE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1s', value: 1000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '15s', value: 15000 },
];

export const AutoModModal: React.FC<AutoModModalProps> = ({ onClose, onSuccess }) => {
  const [config, setConfig] = useState<AutoModConfig>({
    enabled: true,
    filteredWords: [],
    slowmodeMs: 0,
    action: 'warn',
  });
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAutoMod()
      .then((res) => {
        if (res.automod) {
          setConfig(res.automod);
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load AutoMod configuration');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    const word = newWord.trim().toLowerCase();
    if (!word) return;
    if (config.filteredWords.includes(word)) {
      setError('Word is already in the filter list.');
      return;
    }
    setConfig((prev) => ({
      ...prev,
      filteredWords: [...prev.filteredWords, word],
    }));
    setNewWord('');
    setError(null);
  };

  const handleRemoveWord = (word: string) => {
    setConfig((prev) => ({
      ...prev,
      filteredWords: prev.filteredWords.filter((w) => w !== word),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateAutoMod(config);
      setSaveSuccess(true);
      if (onSuccess) {
        onSuccess(res.automod);
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update AutoMod settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AutoMod Configuration</h2>
              <p className="text-xs text-neutral-400">Automated moderation filter & slowmode settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs">Loading AutoMod configuration...</span>
          </div>
        ) : (
          <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Toggle Enable */}
            <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl">
              <div>
                <span className="text-sm font-semibold text-white block">AutoMod Status</span>
                <span className="text-xs text-neutral-400">Enable or disable all automated filtering</span>
              </div>
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.enabled ? 'bg-emerald-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Slowmode */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Chat Slowmode
                </label>
                <span className="text-xs text-neutral-400 font-mono">
                  {config.slowmodeMs ? `${config.slowmodeMs / 1000}s per message` : 'Disabled'}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {SLOWMODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, slowmodeMs: opt.value }))}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      config.slowmodeMs === opt.value
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Action */}
            <div>
              <label className="text-xs font-bold text-neutral-200 block mb-2 uppercase tracking-wider">
                Action on Filter Violation
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['warn', 'mute', 'kick'] as const).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, action: act }))}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border capitalize transition ${
                      config.action === act
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {act === 'warn' ? '⚠️ Warn & Block' : act === 'mute' ? '🔇 Auto Mute' : '👢 Auto Kick'}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtered Words List */}
            <div>
              <label className="text-xs font-bold text-neutral-200 block mb-2 uppercase tracking-wider">
                Filtered Words ({config.filteredWords.length})
              </label>
              <form onSubmit={handleAddWord} className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Type a word to block..."
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
                <button
                  type="submit"
                  disabled={!newWord.trim()}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5 p-3 bg-neutral-950 border border-neutral-800 rounded-xl max-h-36 overflow-y-auto">
                {config.filteredWords.length === 0 ? (
                  <span className="text-xs text-neutral-500 italic py-2">No words filtered. Add words above!</span>
                ) : (
                  config.filteredWords.map((word) => (
                    <span
                      key={word}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-medium text-neutral-200 group"
                    >
                      {word}
                      <button
                        type="button"
                        onClick={() => handleRemoveWord(word)}
                        className="text-neutral-500 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-2 bg-neutral-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved!
              </>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
