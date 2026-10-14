import React, { useState, useEffect } from 'react';
import {
  Bot,
  X,
  Play,
  FileDown,
  ShieldAlert,
  UserX,
  MicOff,
  Radio,
  Check,
  AlertCircle,
  Key,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type { Channel, User } from '../types.ts';

interface DiscordBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  channels: Channel[];
}

export const DiscordBotModal: React.FC<DiscordBotModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  channels,
}) => {
  const [activeTab, setActiveTab] = useState<'console' | 'config'>('console');
  const [botStatus, setBotStatus] = useState<{
    connected: boolean;
    hasToken: boolean;
    hasAppId: boolean;
    hasWebhook: boolean;
    mode: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: 'cmd' | 'res' | 'err'; text: string; embeds?: any[] }>>([
    {
      type: 'res',
      text: '🤖 Discord Bot Console initialized. Type commands or use buttons below to execute /export, /logs, /kick, /ban, /mute.',
    },
  ]);

  // Form states for manual command execution
  const [selectedCmd, setSelectedCmd] = useState<'export' | 'logs' | 'kick' | 'ban' | 'mute' | 'say'>('logs');
  const [targetChannel, setTargetChannel] = useState('');
  const [targetUsername, setTargetUsername] = useState('');
  const [durationMins, setDurationMins] = useState(30);
  const [reasonText, setReasonText] = useState('');
  const [sayMessage, setSayMessage] = useState('');

  // Credentials config
  const [botToken, setBotToken] = useState('');
  const [appId, setAppId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const status = await api.getDiscordBotStatus();
      setBotStatus(status);
    } catch (err) {
      console.warn('Failed to load bot status:', err);
    }
  };

  if (!isOpen) return null;

  const handleRunCommand = async () => {
    setIsLoading(true);
    let cmdName = selectedCmd;
    const args: Record<string, any> = {};

    if (selectedCmd === 'export') {
      if (targetChannel) args.channel = targetChannel;
    } else if (selectedCmd === 'logs') {
      if (targetChannel) args.channel = targetChannel;
    } else if (selectedCmd === 'kick') {
      if (!targetUsername) {
        setConsoleLogs((prev) => [...prev, { type: 'err', text: 'Error: Target username is required for /kick.' }]);
        setIsLoading(false);
        return;
      }
      args.user = targetUsername;
      args.reason = reasonText || 'Kicked by moderator via Discord Bot Console';
    } else if (selectedCmd === 'ban') {
      if (!targetUsername) {
        setConsoleLogs((prev) => [...prev, { type: 'err', text: 'Error: Target username is required for /ban.' }]);
        setIsLoading(false);
        return;
      }
      args.user = targetUsername;
      args.duration_minutes = durationMins;
      args.reason = reasonText || 'Banned by moderator via Discord Bot Console';
    } else if (selectedCmd === 'mute') {
      if (!targetUsername) {
        setConsoleLogs((prev) => [...prev, { type: 'err', text: 'Error: Target username is required for /mute.' }]);
        setIsLoading(false);
        return;
      }
      args.user = targetUsername;
      args.duration_minutes = durationMins;
      args.reason = reasonText || 'Muted by moderator via Discord Bot Console';
    } else if (selectedCmd === 'say') {
      if (!targetChannel || !sayMessage) {
        setConsoleLogs((prev) => [...prev, { type: 'err', text: 'Error: Channel and message are required for /say.' }]);
        setIsLoading(false);
        return;
      }
      args.channel = targetChannel;
      args.message = sayMessage;
    }

    const commandDisplay = `/${cmdName} ${Object.entries(args).map(([k, v]) => `${k}:${v}`).join(' ')}`.trim();
    setConsoleLogs((prev) => [...prev, { type: 'cmd', text: commandDisplay }]);

    try {
      const res = await api.executeDiscordBotCommand(cmdName, args);
      setConsoleLogs((prev) => [
        ...prev,
        {
          type: res.success ? 'res' : 'err',
          text: res.message,
          embeds: res.embeds,
        },
      ]);
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        { type: 'err', text: `Command failed: ${err.message || 'Unknown error'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSaveSuccess(false);
    try {
      const res = await api.configureDiscordBot({
        botToken: botToken || undefined,
        applicationId: appId || undefined,
        publicKey: publicKey || undefined,
      });
      setBotStatus(res.status);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setConsoleLogs((prev) => [
        ...prev,
        { type: 'res', text: '✅ Discord Bot credentials successfully updated!' },
      ]);
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        { type: 'err', text: `Failed to save credentials: ${err.message || 'Unknown error'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        id="discord-bot-modal"
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200 max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Bot className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Discord Bot Integration</h2>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    botStatus?.connected
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : botStatus?.hasToken
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      botStatus?.connected ? 'bg-emerald-400 animate-ping' : 'bg-neutral-500'
                    }`}
                  />
                  {botStatus?.connected ? 'Gateway Connected' : botStatus?.hasToken ? 'Listening' : 'Local / Webhook'}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Slash commands (/export, /logs, /kick, /ban, /mute) affect KeepChat website users.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-neutral-800 bg-neutral-950/30 text-xs">
          <button
            onClick={() => setActiveTab('console')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition ${
              activeTab === 'console'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Bot Commands & Console
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition ${
              activeTab === 'config'
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Bot Setup & Credentials
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'console' ? (
            <div className="space-y-4">
              {/* Command Runner Form */}
              <div className="p-4 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
                  <span>Execute Bot Slash Command</span>
                  <span className="text-[11px] text-indigo-400 lowercase">Affects site only</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCmd('logs')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                      selectedCmd === 'logs'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    /logs
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCmd('export')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                      selectedCmd === 'export'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    /export
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCmd('kick')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                      selectedCmd === 'kick'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    /kick
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCmd('ban')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                      selectedCmd === 'ban'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    /ban
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCmd('mute')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                      selectedCmd === 'mute'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <MicOff className="w-3.5 h-3.5" />
                    /mute
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCmd('say')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                      selectedCmd === 'say'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    /say
                  </button>
                </div>

                {/* Command specific inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {(selectedCmd === 'export' || selectedCmd === 'logs' || selectedCmd === 'say') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                        Channel {selectedCmd !== 'say' ? '(Optional)' : '(Required)'}
                      </label>
                      <select
                        value={targetChannel}
                        onChange={(e) => setTargetChannel(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                      >
                        <option value="">{selectedCmd === 'say' ? 'Select channel...' : 'All / Audit Log'}</option>
                        {channels.map((c) => (
                          <option key={c.id} value={c.name}>
                            #{c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(selectedCmd === 'kick' || selectedCmd === 'ban' || selectedCmd === 'mute') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                        Target Username (Site Member)
                      </label>
                      <input
                        type="text"
                        value={targetUsername}
                        onChange={(e) => setTargetUsername(e.target.value)}
                        placeholder="e.g. johndoe"
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {(selectedCmd === 'ban' || selectedCmd === 'mute') && (
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                        Duration (Minutes)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={durationMins}
                        onChange={(e) => setDurationMins(Number(e.target.value))}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {(selectedCmd === 'kick' || selectedCmd === 'ban' || selectedCmd === 'mute') && (
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                        Reason for Action
                      </label>
                      <input
                        type="text"
                        value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="e.g. Violating community guidelines"
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {selectedCmd === 'say' && (
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                        Message to Broadcast
                      </label>
                      <input
                        type="text"
                        value={sayMessage}
                        onChange={(e) => setSayMessage(e.target.value)}
                        placeholder="Type message to post as Discord Bot..."
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleRunCommand}
                    disabled={isLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {isLoading ? 'Executing...' : `Execute /${selectedCmd}`}
                  </button>
                </div>
              </div>

              {/* Console Output Screen */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1 font-mono">
                  <span>Terminal Stream</span>
                  <button
                    onClick={() => setConsoleLogs([])}
                    className="hover:text-white transition cursor-pointer"
                  >
                    Clear Console
                  </button>
                </div>
                <div className="h-60 overflow-y-auto bg-black border border-neutral-800 rounded-xl p-3 font-mono text-xs space-y-2 select-text">
                  {consoleLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`${
                        log.type === 'cmd'
                          ? 'text-indigo-400 font-bold'
                          : log.type === 'err'
                          ? 'text-red-400'
                          : 'text-neutral-200'
                      }`}
                    >
                      {log.type === 'cmd' && <span className="text-neutral-500 mr-1.5">&gt;</span>}
                      <span className="whitespace-pre-wrap">{log.text}</span>

                      {/* Embed rendering */}
                      {log.embeds && log.embeds.length > 0 && (
                        <div className="mt-2 space-y-1 pl-3 border-l-2 border-indigo-500">
                          {log.embeds.map((emb, idx) => (
                            <div key={idx} className="bg-neutral-900/90 p-2.5 rounded text-xs space-y-1">
                              {emb.title && <div className="font-bold text-white">{emb.title}</div>}
                              {emb.description && (
                                <div className="text-neutral-300 whitespace-pre-wrap">{emb.description}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl text-xs space-y-1 text-indigo-200">
                <div className="font-semibold flex items-center gap-1.5 text-indigo-300">
                  <Key className="w-4 h-4" />
                  Connect Discord Bot Application
                </div>
                <p>
                  To receive slash commands live directly inside your Discord server, create an app at the{' '}
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
                  >
                    Discord Developer Portal <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  and paste your credentials below.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Discord Bot Token (DISCORD_BOT_TOKEN)
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Paste Bot Token (from Bot tab -> Reset Token)"
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Application ID (Client ID)
                  </label>
                  <input
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    placeholder="e.g. 123456789012345678"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Public Key (Optional)
                  </label>
                  <input
                    type="text"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    placeholder="From General Information tab"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1.5 text-xs text-neutral-400">
                <div className="font-semibold text-white">Interactions Endpoint URL:</div>
                <div className="p-2 bg-black rounded font-mono text-[11px] text-emerald-400 select-all break-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/discord/interactions` : '/api/discord/interactions'}
                </div>
                <p className="text-[11px]">
                  Paste this into Discord Developer Portal &gt; General Information &gt; Interactions Endpoint URL.
                </p>
              </div>

              {saveSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Discord Bot credentials saved and gateway connection refreshed!</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {isLoading ? 'Saving...' : 'Save & Connect Bot'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
