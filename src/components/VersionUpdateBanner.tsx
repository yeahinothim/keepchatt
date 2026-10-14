import React, { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, X, ArrowRight, Zap } from 'lucide-react';
import { api } from '../lib/api.ts';

interface VersionUpdateBannerProps {
  serverVersion?: string;
  serverBuildTime?: number;
}

export const VersionUpdateBanner: React.FC<VersionUpdateBannerProps> = ({
  serverVersion,
  serverBuildTime,
}) => {
  const [initialVersion, setInitialVersion] = useState<string | null>(null);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 1. Store initial version on load
  useEffect(() => {
    async function checkInitialVersion() {
      try {
        const res = await api.getVersion();
        if (res.version) {
          setInitialVersion(res.version);
        }
      } catch (err) {
        console.warn('Failed to fetch initial version:', err);
      }
    }
    checkInitialVersion();
  }, []);

  // 2. Compare serverVersion prop from WebSocket or polling
  useEffect(() => {
    if (serverVersion && initialVersion && serverVersion !== initialVersion) {
      setHasNewVersion(true);
    }
  }, [serverVersion, initialVersion]);

  // 3. Periodic Polling fallback every 45s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.getVersion();
        if (res.version && initialVersion && res.version !== initialVersion) {
          setHasNewVersion(true);
        }
      } catch {}
    }, 45000);

    return () => clearInterval(interval);
  }, [initialVersion]);

  // 4. Auto refresh countdown when new version detected
  useEffect(() => {
    if (!hasNewVersion || snoozed || !autoRefresh) return;

    if (countdown <= 0) {
      window.location.reload();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [hasNewVersion, snoozed, autoRefresh, countdown]);

  const handleRefresh = () => {
    window.location.reload();
  };

  if (!hasNewVersion) return null;

  // Snoozed small pill
  if (snoozed) {
    return (
      <div className="fixed top-3 right-4 z-50 animate-in fade-in slide-in-from-top duration-200">
        <button
          onClick={() => setSnoozed(false)}
          className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full text-xs font-bold shadow-xl border border-indigo-400/40 flex items-center gap-2 group transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>Update Ready</span>
          <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </div>
    );
  }

  // Full floating banner at top center
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 animate-in fade-in slide-in-from-top-4 duration-200 select-none">
      <div className="bg-neutral-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl p-3.5 shadow-2xl shadow-indigo-950/50 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative overflow-hidden">
        {/* Animated Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse" />

        {/* Content */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0 text-indigo-400">
            <Zap className="w-5 h-5 fill-indigo-400/20" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>New KeepChat Version Deployed!</span>
              <span className="px-1.5 py-0.2 bg-indigo-950 border border-indigo-700/60 text-indigo-300 text-[10px] font-mono rounded">
                Live Update
              </span>
            </div>
            <p className="text-[11px] text-neutral-300 truncate">
              {autoRefresh
                ? `Auto-refreshing in ${countdown}s to load the latest features...`
                : 'A newer build is ready. Refresh to update!'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRefresh}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Now</span>
          </button>
          <button
            onClick={() => setSnoozed(true)}
            title="Snooze for now"
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
