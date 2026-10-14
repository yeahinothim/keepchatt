import React, { useState } from 'react';
import {
  Bell,
  AtSign,
  Hash,
  CheckCheck,
  Trash2,
  X,
  ArrowRight,
  MessageSquare,
  Sparkles,
  Users,
  Shield,
  Volume2
} from 'lucide-react';
import type { ChatNotification, Channel, User } from '../types.ts';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  channels: Channel[];
  notifications: ChatNotification[];
  channelUnreadMessages: Record<string, boolean>;
  channelUnreadPings: Record<string, number>;
  onSelectChannel: (channelId: string) => void;
  onSelectDm?: (dmId: string) => void;
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  channels,
  notifications,
  channelUnreadMessages,
  channelUnreadPings,
  onSelectChannel,
  onSelectDm,
  onMarkAllAsRead,
  onClearNotifications,
  soundEnabled = true,
  onToggleSound,
}) => {
  const [activeTab, setActiveTab] = useState<'pings' | 'unread' | 'all'>('pings');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);

  if (!isOpen) return null;

  // 1. Mentions & Pings sorted newest first
  const pingsList = notifications
    .filter((n) => n.type === 'mention')
    .sort((a, b) => b.timestamp - a.timestamp);

  const displayedPings = filterUnreadOnly ? pingsList.filter((n) => !n.isRead) : pingsList;

  // 2. Unread channels
  const unreadChannelsList = channels.filter(
    (ch) => (channelUnreadPings[ch.id] || 0) > 0 || Boolean(channelUnreadMessages[ch.id])
  );

  const totalUnreadPings = (Object.values(channelUnreadPings) as number[]).reduce((sum: number, count: number) => sum + count, 0);
  const totalUnreadChannels = unreadChannelsList.length;

  const formatRelativeTime = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleJumpToChannel = (channelId: string) => {
    onSelectChannel(channelId);
    onClose();
  };

  const handleJumpToDm = (dmId: string) => {
    onSelectDm?.(dmId);
    onClose();
  };

  return (
    <div
      id="notification-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="notification-modal-card"
        className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Inbox & Notifications</h3>
                {totalUnreadPings > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                    {totalUnreadPings} {totalUnreadPings === 1 ? 'ping' : 'pings'}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400">Mentions, unread channel alerts, and message activity</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onMarkAllAsRead}
              title="Mark all as read"
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center gap-1.5 transition"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Mark as Read</span>
            </button>
            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                title={soundEnabled ? 'Mute sound alerts' : 'Unmute sound alerts'}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition"
              >
                <Volume2 className={`w-4 h-4 ${soundEnabled ? 'text-emerald-400' : 'text-neutral-500 line-through'}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Filters */}
        <div className="px-4 pt-3 pb-2 border-b border-neutral-800/80 bg-neutral-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('pings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'pings'
                  ? 'bg-neutral-800 text-white ring-1 ring-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              <AtSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mentions & Pings</span>
              {totalUnreadPings > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                  {totalUnreadPings}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'unread'
                  ? 'bg-neutral-800 text-white ring-1 ring-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              <Hash className="w-3.5 h-3.5 text-sky-400" />
              <span>Unread Channels</span>
              {totalUnreadChannels > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/20 text-sky-400 font-bold border border-sky-500/30">
                  {totalUnreadChannels}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'all'
                  ? 'bg-neutral-800 text-white ring-1 ring-neutral-700'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>All Activity</span>
            </button>
          </div>

          {activeTab === 'pings' && pingsList.length > 0 && (
            <button
              type="button"
              onClick={onClearNotifications}
              title="Clear mention history"
              className="text-[11px] text-neutral-500 hover:text-red-400 flex items-center gap-1 transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {/* TAB 1: Pings & Mentions */}
          {activeTab === 'pings' && (
            <div>
              {displayedPings.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-600 mx-auto mb-3">
                    <AtSign className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-300">You're all caught up!</h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                    When someone mentions @{currentUser?.username || 'you'}, @everyone, or your roles in any channel, it will show up here sorted by newest first.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedPings.map((ping) => (
                    <div
                      key={ping.id}
                      className={`p-3 rounded-xl border transition group ${
                        !ping.isRead
                          ? 'bg-neutral-950 border-emerald-500/30 hover:border-emerald-500/60'
                          : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden"
                            style={{ backgroundColor: ping.senderAvatarColor || '#3b82f6' }}
                          >
                            {ping.senderAvatarUrl ? (
                              <img src={ping.senderAvatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              ping.senderName.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <span className="text-xs font-semibold text-white truncate">
                            {ping.senderName}
                          </span>
                          <span className="text-[11px] text-neutral-400 font-mono flex items-center gap-1">
                            in <strong className="text-neutral-300">#{ping.channelName || 'channel'}</strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-neutral-500">
                            {formatRelativeTime(ping.timestamp)}
                          </span>
                          {ping.channelId && (
                            <button
                              type="button"
                              onClick={() => handleJumpToChannel(ping.channelId!)}
                              className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md flex items-center gap-1 transition"
                            >
                              <span>Jump</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          {ping.dmId && (
                            <button
                              type="button"
                              onClick={() => handleJumpToDm(ping.dmId!)}
                              className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md flex items-center gap-1 transition"
                            >
                              <span>Jump</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Snippet */}
                      <p className="text-xs text-neutral-300 bg-neutral-900/90 p-2 rounded-lg border border-neutral-800/80 font-mono break-words leading-relaxed">
                        {ping.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Unread Channels */}
          {activeTab === 'unread' && (
            <div>
              {unreadChannelsList.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-600 mx-auto mb-3">
                    <CheckCheck className="w-6 h-6 text-emerald-500/60" />
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-300">All channels read!</h4>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                    There are no unread messages waiting in any channels.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unreadChannelsList.map((ch) => {
                    const pingsCount = channelUnreadPings[ch.id] || 0;
                    return (
                      <div
                        key={ch.id}
                        className="p-3 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 font-bold shrink-0">
                            #
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white truncate">
                                {ch.name}
                              </span>
                              {pingsCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500 text-white">
                                  {pingsCount} @ping
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 truncate">
                              {ch.topic || ch.description || 'New unread messages in this channel'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleJumpToChannel(ch.id)}
                          className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-neutral-100 text-neutral-900 rounded-lg flex items-center gap-1.5 transition shrink-0 shadow-xs"
                        >
                          <span>Open</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: All Activity */}
          {activeTab === 'all' && (
            <div className="space-y-3">
              {unreadChannelsList.length > 0 && (
                <div>
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-sky-400" />
                    Unread Channels ({unreadChannelsList.length})
                  </h5>
                  <div className="space-y-1.5">
                    {unreadChannelsList.map((ch) => (
                      <div
                        key={ch.id}
                        onClick={() => handleJumpToChannel(ch.id)}
                        className="p-2.5 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl flex items-center justify-between cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-white">#{ch.name}</span>
                          {(channelUnreadPings[ch.id] || 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                              {channelUnreadPings[ch.id]} pings
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-neutral-400 hover:text-white flex items-center gap-1">
                          View <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2 flex items-center gap-1.5">
                  <AtSign className="w-3.5 h-3.5 text-emerald-400" />
                  Recent Mentions ({pingsList.length})
                </h5>
                {pingsList.length === 0 ? (
                  <div className="text-xs text-neutral-500 p-4 text-center bg-neutral-950/40 rounded-xl border border-neutral-800/60">
                    No recent mentions recorded.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pingsList.slice(0, 15).map((ping) => (
                      <div
                        key={ping.id}
                        className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white">
                            {ping.senderName} <span className="text-neutral-400 font-normal">in #{ping.channelName}</span>
                          </div>
                          <p className="text-xs text-neutral-300 font-mono truncate mt-0.5">{ping.text}</p>
                        </div>
                        {ping.channelId && (
                          <button
                            type="button"
                            onClick={() => handleJumpToChannel(ping.channelId!)}
                            className="text-xs text-emerald-400 hover:underline shrink-0"
                          >
                            Jump
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-neutral-950 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
          <span>Notifications auto-sync across sessions and channels.</span>
          <span className="text-neutral-500">Press ESC to close</span>
        </div>
      </div>
    </div>
  );
};
