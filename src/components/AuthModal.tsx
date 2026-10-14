import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, Lock, User, AlertCircle, ArrowRight, X, Trash2, Users, PlusCircle } from 'lucide-react';
import { api, getSavedAccounts, removeSavedAccount, switchSavedAccount, type SavedAccount } from '../lib/api.ts';
import type { User as UserType } from '../types.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onAuthenticated: (user: UserType) => void;
  isMandatory?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
  isMandatory = false,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSavedAccounts(getSavedAccounts());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectSavedAccount = async (account: SavedAccount) => {
    setError(null);
    setLoading(true);
    try {
      const switched = switchSavedAccount(account.user.id);
      if (switched) {
        // Validate with server
        const me = await api.getMe();
        if (me.user) {
          onAuthenticated(me.user);
          return;
        }
      }
      // If session expired or invalid, autofill username for quick login
      setUsername(account.user.username);
      setError(`Session for @${account.user.username} expired. Please enter password to sign in.`);
    } catch (err: any) {
      setUsername(account.user.username);
      setError(err?.message || 'Failed to switch to saved account.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSaved = (e: React.MouseEvent, accUserId: string) => {
    e.stopPropagation();
    removeSavedAccount(accUserId);
    setSavedAccounts(getSavedAccounts());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (username.trim().length < 3) {
          throw new Error('Username must be at least 3 characters.');
        }
        if (password.length < 4) {
          throw new Error('Password must be at least 4 characters.');
        }
        const res = await api.signup({
          username: username.trim(),
          displayName: displayName.trim() || undefined,
          password,
        });
        onAuthenticated(res.user);
      } else {
        if (!username.trim() || !password) {
          throw new Error('Please provide both username and password.');
        }
        const res = await api.login({
          username: username.trim(),
          password,
        });
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        id="auth-modal-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 relative overflow-hidden"
      >
        {/* Subtle accent bar at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-700" />

        {!isMandatory && onClose && (
          <button
            id="auth-modal-close-btn"
            onClick={onClose}
            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-200 p-1 rounded-md hover:bg-neutral-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-xl font-bold tracking-tight text-white">
              {mode === 'signin' ? 'Sign In to Chat' : 'Create an Account'}
            </h2>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed">
            {mode === 'signin'
              ? 'Welcome back. Accounts are saved on this device and preserved in chat backups.'
              : 'Pick a username to join the channels and start messaging with team members.'}
          </p>
        </div>

        {/* Saved Accounts section */}
        {savedAccounts.length > 0 && (
          <div className="mb-5 p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Saved Accounts ({savedAccounts.length})
              </span>
              <span className="text-[10px] text-neutral-500">1-click login</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {savedAccounts.map((acc) => (
                <div
                  key={acc.user.id}
                  onClick={() => handleSelectSavedAccount(acc)}
                  className="flex items-center justify-between p-2 rounded-lg bg-neutral-900/80 hover:bg-neutral-800/90 border border-neutral-800 hover:border-neutral-700 cursor-pointer transition group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden"
                      style={{ backgroundColor: acc.user.avatarColor || '#3b82f6' }}
                    >
                      {acc.user.avatarUrl ? (
                        <img src={acc.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (acc.user.displayName || acc.user.username).slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate group-hover:text-emerald-300 transition">
                        {acc.user.displayName || acc.user.username}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate font-mono">
                        @{acc.user.username}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-neutral-800 text-neutral-300 font-medium capitalize">
                      {acc.user.role || 'member'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveSaved(e, acc.user.id)}
                      title="Remove from saved accounts"
                      className="p-1 text-neutral-500 hover:text-red-400 rounded-md hover:bg-neutral-800 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab switch */}
        <div className="flex border-b border-neutral-800 mb-5">
          <button
            id="auth-tab-signin"
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              mode === 'signin'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Sign In
          </button>
          <button
            id="auth-tab-signup"
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              mode === 'signup'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            New Account
          </button>
        </div>

        {error && (
          <div
            id="auth-error-banner"
            className="mb-4 p-3 bg-red-950/40 border border-red-900/60 rounded-lg flex items-start gap-2 text-sm text-red-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                <User className="w-4 h-4" />
              </div>
              <input
                id="auth-input-username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_rivera"
                required
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-neutral-500 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500 transition"
              />
            </div>
            {mode === 'signup' && (
              <span className="text-[11px] text-neutral-500 mt-1 block">
                Lowercase letters, numbers, and underscores
              </span>
            )}
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Display Name <span className="text-neutral-600 font-normal lowercase">(optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                  <UserCheck className="w-4 h-4" />
                </div>
                <input
                  id="auth-input-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-neutral-500 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500 transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-neutral-500 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500 transition"
              />
            </div>
          </div>

          {/* Cookie & Persistence Info Box */}
          <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-lg flex items-start gap-2.5 text-xs text-neutral-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-neutral-300">Auto-Saved Accounts: </span>
              All created accounts and logged-in profiles are saved on this device and automatically included in chat workspace backups.
            </div>
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-neutral-100 hover:bg-white text-neutral-900 font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-neutral-800 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
