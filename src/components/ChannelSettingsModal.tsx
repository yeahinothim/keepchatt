import React, { useState } from 'react';
import {
  Settings,
  Hash,
  Volume2,
  Gamepad2,
  X,
  Clock,
  Shield,
  Check,
  Loader2,
  Eye,
  MessageSquare,
  Sparkles,
  Link,
  Smile,
  AtSign,
  Wrench,
  Trash2,
  AlertTriangle,
  Lock,
  Layers,
  Users,
  Share2,
  Send,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type { Channel, Role } from '../types.ts';

interface ChannelSettingsModalProps {
  channel: Channel;
  availableRoles: Role[];
  onClose: () => void;
  onUpdated: (channel: Channel) => void;
  onDeleted?: (channelId: string) => void;
}

const SLOWMODE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1s', value: 1000 },
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '15s', value: 15000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
];

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  channel,
  availableRoles,
  onClose,
  onUpdated,
  onDeleted,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'permissions' | 'presets' | 'integrations' | 'danger'>('permissions');

  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [description, setDescription] = useState(channel.description || '');
  const [slowmodeMs, setSlowmodeMs] = useState(channel.slowmodeMs || 0);
  const [webhookUrl, setWebhookUrl] = useState(channel.webhookUrl || '');
  const [exportingWebhook, setExportingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [permissions, setPermissions] = useState<{
    canView: string[];
    canType: string[];
    canManageChannel: string[];
    canEmbed: string[];
    canReact: string[];
    canPing: string[];
  }>({
    canView: channel.permissions?.canView || ['*'],
    canType: channel.permissions?.canType || ['*'],
    canManageChannel: channel.permissions?.canManageChannel || ['r-admin', 'r-mod'],
    canEmbed: channel.permissions?.canEmbed || ['*'],
    canReact: channel.permissions?.canReact || ['*'],
    canPing: channel.permissions?.canPing || ['*'],
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  type PermKey = 'canView' | 'canType' | 'canManageChannel' | 'canEmbed' | 'canReact' | 'canPing';

  const togglePermission = (permKey: PermKey, roleId: string) => {
    setPermissions((prev) => {
      const currentList = prev[permKey];
      const has = currentList.includes(roleId);
      return {
        ...prev,
        [permKey]: has ? currentList.filter((id) => id !== roleId) : [...currentList, roleId],
      };
    });
  };

  const setAllRoles = (permKey: PermKey, allow: boolean) => {
    setPermissions((prev) => {
      if (!allow) {
        return { ...prev, [permKey]: [] };
      }
      return {
        ...prev,
        [permKey]: ['*', ...availableRoles.map((r) => r.id)],
      };
    });
  };

  const setEveryoneOnly = (permKey: PermKey) => {
    setPermissions((prev) => ({
      ...prev,
      [permKey]: ['*'],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Channel name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await api.updateChannel(channel.id, {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        topic: topic.trim(),
        description: description.trim(),
        slowmodeMs,
        permissions,
        webhookUrl: webhookUrl.trim(),
      });
      onUpdated(res.channel);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update channel permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await api.deleteChannel(channel.id);
      if (onDeleted) {
        onDeleted(channel.id);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete channel');
      setDeleting(false);
    }
  };

  const PERM_ROWS: {
    key: PermKey;
    label: string;
    desc: string;
    icon: React.ElementType;
    iconColor: string;
  }[] = [
    {
      key: 'canView',
      label: 'View Channel',
      desc: 'Controls which roles can see & access this channel in the sidebar.',
      icon: Eye,
      iconColor: 'text-blue-400',
    },
    {
      key: 'canType',
      label: 'Send Messages / Type',
      desc: 'Controls who can send messages. Unchecking @everyone creates a Read-Only channel.',
      icon: MessageSquare,
      iconColor: 'text-emerald-400',
    },
    {
      key: 'canManageChannel',
      label: 'Manage Channel',
      desc: 'Allows selected roles to modify channel settings, slowmode, topic, or delete it.',
      icon: Wrench,
      iconColor: 'text-purple-400',
    },
    {
      key: 'canEmbed',
      label: 'Embed Links & Media',
      desc: 'Allows sending file attachments, image/video URLs, or Tenor GIFs.',
      icon: Link,
      iconColor: 'text-amber-400',
    },
    {
      key: 'canReact',
      label: 'Add Emoji Reactions',
      desc: 'Allows adding emoji reactions to channel messages.',
      icon: Smile,
      iconColor: 'text-pink-400',
    },
    {
      key: 'canPing',
      label: 'Ping Roles & Mentions',
      desc: 'Allows mentioning @everyone, @here, or specific role groups.',
      icon: AtSign,
      iconColor: 'text-cyan-400',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-neutral-800 border border-neutral-700/60 rounded-xl text-neutral-200">
              {channel.type === 'voice' ? (
                <Volume2 className="w-5 h-5 text-amber-400" />
              ) : channel.type === 'game' ? (
                <Gamepad2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <Hash className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">#{channel.name}</h2>
                <span className="px-2 py-0.5 text-[10px] uppercase font-mono font-semibold bg-neutral-800 text-neutral-400 rounded-md">
                  {channel.type || 'text'} channel
                </span>
              </div>
              <p className="text-xs text-neutral-400">Advanced Channel Settings & Role Permissions</p>
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
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-neutral-800 bg-neutral-950/40 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'permissions'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Role Permissions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'presets'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Quick Presets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'general'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>General & Slowmode</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'integrations'
                ? 'border-indigo-500 text-indigo-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Integrations</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('danger')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'danger'
                ? 'border-red-500 text-red-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-red-400 hover:bg-neutral-900/50'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Danger Zone</span>
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: ROLE PERMISSIONS MATRIX */}
          {activeTab === 'permissions' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Granular Permission Controls
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Click roles to toggle permissions. Active permissions are highlighted in green.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{availableRoles.length + 1} Roles Configured</span>
                </div>
              </div>

              <div className="space-y-3">
                {PERM_ROWS.map((row) => {
                  const IconComp = row.icon;
                  const selectedCount = permissions[row.key].length;
                  const isEveryone = permissions[row.key].includes('*');

                  return (
                    <div
                      key={row.key}
                      className="p-4 bg-neutral-950/90 border border-neutral-800 hover:border-neutral-700/80 rounded-xl transition space-y-3"
                    >
                      {/* Row Title & Description */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`p-2 rounded-lg bg-neutral-900 border border-neutral-800 ${row.iconColor}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-white">{row.label}</h4>
                              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400">
                                {isEveryone ? 'Everyone' : `${selectedCount} Role(s)`}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-normal mt-0.5">{row.desc}</p>
                          </div>
                        </div>

                        {/* Row Quick Action Menu */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEveryoneOnly(row.key)}
                            className="px-2 py-1 text-[10px] font-semibold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-md transition"
                            title="Reset to @everyone only"
                          >
                            @everyone
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllRoles(row.key, true)}
                            className="px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 bg-neutral-900 border border-neutral-800 hover:bg-emerald-950/40 rounded-md transition"
                            title="Allow all roles"
                          >
                            Allow All
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllRoles(row.key, false)}
                            className="px-2 py-1 text-[10px] font-semibold text-neutral-500 hover:text-red-400 bg-neutral-900 border border-neutral-800 hover:bg-red-950/40 rounded-md transition"
                            title="Clear all roles"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Role Selector Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-neutral-900">
                        {/* Everyone Badge */}
                        <button
                          type="button"
                          onClick={() => togglePermission(row.key, '*')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition ${
                            permissions[row.key].includes('*')
                              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-sm'
                              : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              permissions[row.key].includes('*') ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                            }`}
                          />
                          <span>@everyone</span>
                          {permissions[row.key].includes('*') && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>

                        {/* Roles Badges */}
                        {availableRoles.map((r) => {
                          const active = permissions[row.key].includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => togglePermission(row.key, r.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition ${
                                active
                                  ? 'bg-neutral-900 text-white shadow-sm'
                                  : 'bg-neutral-900/60 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                              }`}
                              style={{
                                borderColor: active ? r.color : undefined,
                                backgroundColor: active ? `${r.color}15` : undefined,
                              }}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: r.color }}
                              />
                              <span>@{r.name}</span>
                              {active && <Check className="w-3.5 h-3.5" style={{ color: r.color }} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: QUICK PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Channel Access Presets
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Apply a pre-configured permission template with a single click. You can customize details afterwards.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Preset 1: Public Open */}
                <button
                  type="button"
                  onClick={() => {
                    setPermissions({
                      canView: ['*'],
                      canType: ['*'],
                      canManageChannel: ['r-admin', 'r-mod'],
                      canEmbed: ['*'],
                      canReact: ['*'],
                      canPing: ['*'],
                    });
                  }}
                  className="p-4 bg-neutral-950 border border-neutral-800 hover:border-emerald-500/60 rounded-xl text-left transition group space-y-2 hover:bg-neutral-900/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition">
                        💬 Public Open Chat
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                      Default
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Everyone can view, type messages, react, post media links, and send mentions freely.
                  </p>
                </button>

                {/* Preset 2: Announcement Channel */}
                <button
                  type="button"
                  onClick={() => {
                    setPermissions({
                      canView: ['*'],
                      canType: ['r-admin', 'r-mod'],
                      canManageChannel: ['r-admin', 'r-mod'],
                      canEmbed: ['r-admin', 'r-mod'],
                      canReact: ['*'],
                      canPing: ['r-admin', 'r-mod'],
                    });
                  }}
                  className="p-4 bg-neutral-950 border border-neutral-800 hover:border-amber-500/60 rounded-xl text-left transition group space-y-2 hover:bg-neutral-900/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
                        <Volume2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-amber-400 transition">
                        📢 Read-Only Announcements
                      </span>
                    </div>
                    <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full font-mono">
                      Read-Only
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Everyone can view & react with emoji, but only staff roles can send messages, embed media, and ping.
                  </p>
                </button>

                {/* Preset 3: Private Staff Only */}
                <button
                  type="button"
                  onClick={() => {
                    setPermissions({
                      canView: ['r-admin', 'r-mod'],
                      canType: ['r-admin', 'r-mod'],
                      canManageChannel: ['r-admin', 'r-mod'],
                      canEmbed: ['r-admin', 'r-mod'],
                      canReact: ['r-admin', 'r-mod'],
                      canPing: ['r-admin', 'r-mod'],
                    });
                  }}
                  className="p-4 bg-neutral-950 border border-neutral-800 hover:border-purple-500/60 rounded-xl text-left transition group space-y-2 hover:bg-neutral-900/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-400 border border-purple-500/20">
                        <Lock className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-purple-400 transition">
                        🔒 Private / Hidden Staff Room
                      </span>
                    </div>
                    <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded-full font-mono">
                      Hidden
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Completely hidden from @everyone. Only assigned staff roles (Admin/Mod) can see or participate.
                  </p>
                </button>

                {/* Preset 4: Media Restricted */}
                <button
                  type="button"
                  onClick={() => {
                    setPermissions({
                      canView: ['*'],
                      canType: ['*'],
                      canManageChannel: ['r-admin', 'r-mod'],
                      canEmbed: ['r-admin', 'r-mod'],
                      canReact: ['*'],
                      canPing: ['r-admin', 'r-mod'],
                    });
                  }}
                  className="p-4 bg-neutral-950 border border-neutral-800 hover:border-cyan-500/60 rounded-xl text-left transition group space-y-2 hover:bg-neutral-900/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                        <Link className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-cyan-400 transition">
                        🛡️ Text Only (No Links / Media)
                      </span>
                    </div>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded-full font-mono">
                      No Embeds
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Members can chat, but posting file uploads, URLs, GIFs, or media embeds is restricted to staff.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: GENERAL DETAILS & SLOWMODE */}
          {activeTab === 'general' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 uppercase tracking-wider">
                  Channel Name
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-neutral-500 font-bold">#</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 font-mono"
                    placeholder="general-chat"
                    required
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Saved slug will be normalized to: <span className="font-mono text-neutral-300">#{name.trim().toLowerCase().replace(/\s+/g, '-')}</span>
                </p>
              </div>

              {/* Topic */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 uppercase tracking-wider">
                  Channel Topic / Subtitle
                </label>
                <input
                  type="text"
                  placeholder="Welcome to #general! Share updates and chat..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 uppercase tracking-wider">
                  Detailed Guidelines / Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="Extended description or guidelines for members in this channel..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
                />
              </div>

              {/* Slowmode */}
              <div>
                <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Channel Slowmode Cooldown
                </label>
                <p className="text-[11px] text-neutral-400 mb-2.5">
                  Require members to wait a specified cooldown duration between sending consecutive messages.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {SLOWMODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSlowmodeMs(opt.value)}
                      className={`py-2 text-xs font-bold rounded-xl border transition ${
                        slowmodeMs === opt.value
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INTEGRATIONS & DISCORD WEBHOOK */}
          {activeTab === 'integrations' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                  Discord Webhook & Integrations
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Connect a Discord Webhook URL to export or mirror channel messages directly into your Discord server.
                </p>
              </div>

              {webhookStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    webhookStatus.type === 'success'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                  }`}
                >
                  <span>{webhookStatus.text}</span>
                </div>
              )}

              {/* Webhook Input */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 uppercase tracking-wider">
                  Discord Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-indigo-300 font-mono placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Obtain this URL from Discord: Server Settings → Integrations → Webhooks → New Webhook.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={exportingWebhook || !webhookUrl.trim()}
                  onClick={async () => {
                    setExportingWebhook(true);
                    setWebhookStatus(null);
                    try {
                      const res = await api.exportToDiscordWebhook({
                        webhookUrl: webhookUrl.trim(),
                        channelId: channel.id,
                      });
                      setWebhookStatus({ type: 'success', text: res.message || 'Successfully exported channel log to Discord!' });
                    } catch (err: any) {
                      setWebhookStatus({ type: 'error', text: err.message || 'Webhook export failed.' });
                    } finally {
                      setExportingWebhook(false);
                    }
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
                >
                  {exportingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Export Channel Messages to Discord</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: DANGER ZONE */}
          {activeTab === 'danger' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-2xl space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Delete Channel #{channel.name}</h3>
                    <p className="text-xs text-neutral-400">
                      Permanently delete this channel and all stored message history. This action cannot be undone.
                    </p>
                  </div>
                </div>

                {confirmDelete ? (
                  <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-red-200">
                      Are you absolutely sure you want to delete <span className="font-mono text-white">#{channel.name}</span>?
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Confirm Permanent Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Channel</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
            <div className="text-[11px] text-neutral-500">
              Channel ID: <span className="font-mono text-neutral-400">{channel.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Permission Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
