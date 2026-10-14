import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Plus,
  MessageSquare,
  Volume2,
  VolumeX,
  Settings,
  LogIn,
  Users,
  Radio,
  Gamepad2,
  History,
  Shield,
  ShieldAlert,
  Bell,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import type { Channel, DirectMessageConversation, User, Role, ChannelCategory, Server } from '../types.ts';
import { api } from '../lib/api.ts';

interface SidebarProps {
  currentUser: User | null;
  channels: Channel[];
  categories?: ChannelCategory[];
  dms: DirectMessageConversation[];
  activeTarget: { type: 'channel' | 'dm'; id: string };
  onlineUserIds: Set<string>;
  soundEnabled: boolean;
  channelUnreadMessages?: Record<string, boolean>;
  channelUnreadPings?: Record<string, number>;
  activeCallChannelId?: string | null;
  roles?: Role[];
  activeServer?: Server;
  isDmsView?: boolean;
  onSelectFriends?: () => void;
  onOpenServerSettings?: () => void;
  onOpenCallLobby?: (channelId: string) => void;
  onToggleSound: () => void;
  onSelectChannel: (channelId: string) => void;
  onSelectDm: (dmId: string) => void;
  onOpenNewChannel: () => void;
  onOpenNewCategory?: () => void;
  onDeleteCategory?: (categoryId: string) => void;
  onEditCategory?: (category: ChannelCategory) => void;
  onOpenNewChannelWithCategory?: (categoryId?: string) => void;
  onOpenNewDm: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onToggleMembersPanel: () => void;
  showMembersPanel: boolean;
  onEditChannel?: (channel: Channel) => void;
  onOpenUpdates?: () => void;
  onOpenAutoMod?: () => void;
  onOpenRoles?: () => void;
  onViewPublicProfile?: (user: User) => void;
  onOpenNotifications?: () => void;
  onReorderChannels?: (channels: Channel[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  channels,
  categories = [],
  dms,
  activeTarget,
  onlineUserIds,
  soundEnabled,
  channelUnreadMessages = {},
  channelUnreadPings = {},
  activeCallChannelId,
  roles = [],
  activeServer,
  isDmsView = false,
  onSelectFriends,
  onOpenServerSettings,
  onOpenCallLobby,
  onToggleSound,
  onOpenNotifications,
  onSelectChannel,
  onSelectDm,
  onOpenNewChannel,
  onOpenNewCategory,
  onEditCategory,
  onDeleteCategory,
  onOpenNewChannelWithCategory,
  onOpenNewDm,
  onOpenProfile,
  onOpenAuth,
  onToggleMembersPanel,
  showMembersPanel,
  onEditChannel,
  onOpenUpdates,
  onOpenAutoMod,
  onOpenRoles,
  onViewPublicProfile,
  onReorderChannels,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    channel: Channel;
  } | null>(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState<{
    x: number;
    y: number;
    category: ChannelCategory;
  } | null>(null);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Long-press handling for mobile support (channel & category holding)
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const startChannelHold = (ch: Channel, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isHoldingRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate(40);
      } catch {}
      if (onEditChannel) {
        setContextMenu({ x: e.clientX, y: e.clientY, channel: ch });
      }
    }, 420);
  };

  const moveChannelHold = (e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
    if (dist > 8) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
  };

  const clearChannelHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const startCategoryHold = (cat: ChannelCategory, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isHoldingRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate(40);
      } catch {}
      if (isPrivilegedUser) {
        setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: cat });
      }
    }, 420);
  };

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  // Close context menus on any click-off, right click outside, or Escape
  useEffect(() => {
    const handleGlobalDismiss = () => {
      setContextMenu(null);
      setCategoryContextMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setCategoryContextMenu(null);
      }
    };
    window.addEventListener('pointerdown', handleGlobalDismiss);
    window.addEventListener('contextmenu', handleGlobalDismiss);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalDismiss);
      window.removeEventListener('contextmenu', handleGlobalDismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleDeleteChannel = async (channel: Channel) => {
    const confirmed = await (window as any).customConfirm(`Are you sure you want to delete #${channel.name}? This cannot be undone.`);
    if (confirmed) {
      try {
        await api.deleteChannel(channel.id);
      } catch (err) {
        console.error('Failed to delete channel:', err);
      }
    }
  };

  const handleDropChannel = async (targetChannelId: string) => {
    setDragOverChannelId(null);
    if (!draggedChannelId || draggedChannelId === targetChannelId) return;

    const targetChannel = channels.find((c) => c.id === targetChannelId);
    const draggedChannel = channels.find((c) => c.id === draggedChannelId);
    if (!targetChannel || !draggedChannel) return;

    // Determine target category
    const targetCategoryId = targetChannel.categoryId || undefined;
    const prevCategoryId = draggedChannel.categoryId || undefined;

    let updatedChannels = [...channels];

    if (prevCategoryId !== targetCategoryId) {
      // Optimistic update of channel's category
      updatedChannels = channels.map((ch) => {
        if (ch.id === draggedChannelId) {
          return { ...ch, categoryId: targetCategoryId };
        }
        return ch;
      });
      if (onReorderChannels) {
        onReorderChannels(updatedChannels);
      }

      try {
        // Persist category update via PATCH
        await api.request(`/api/channels/${draggedChannelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: targetCategoryId || null }),
        });
      } catch (err) {
        console.error('Failed to update channel category during drag:', err);
      }
    }

    // Process flat list reordering
    const currentIds = updatedChannels.map((c) => c.id);
    const fromIndex = currentIds.indexOf(draggedChannelId);
    const toIndex = currentIds.indexOf(targetChannelId);
    
    if (fromIndex !== -1 && toIndex !== -1) {
      const newIds = [...currentIds];
      newIds.splice(fromIndex, 1);
      newIds.splice(toIndex, 0, draggedChannelId);

      if (onReorderChannels) {
        const reordered = newIds.map((id) => updatedChannels.find((c) => c.id === id)!).filter(Boolean);
        onReorderChannels(reordered);
      }

      try {
        const res = await api.reorderChannels(newIds);
        if (res?.channels && onReorderChannels) {
          onReorderChannels(res.channels);
        }
      } catch (err: any) {
        console.error('Failed to reorder channels:', err);
      }
    }

    setDraggedChannelId(null);
  };

  const renderChannelItem = (ch: Channel) => {
    const isActive = activeTarget.type === 'channel' && activeTarget.id === ch.id;
    const unreadPings = !isActive ? channelUnreadPings[ch.id] || 0 : 0;
    const hasUnreadMsgs = !isActive && unreadPings === 0 && Boolean(channelUnreadMessages[ch.id]);

    const isReadOnlyForEveryone = Boolean(
      ch.permissions?.canType &&
      ch.permissions.canType.length > 0 &&
      !ch.permissions.canType.includes('*')
    );

    const isHiddenChannel = Boolean(
      ch.permissions?.canView &&
      ch.permissions.canView.length > 0 &&
      !ch.permissions.canView.includes('*')
    );

    const Icon = ch.type === 'voice' ? (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
    ) : isReadOnlyForEveryone || isHiddenChannel ? (
      <span className="relative flex items-center justify-center">
        <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
        <span className="absolute -bottom-1 -right-1 text-[8px] leading-none">🔒</span>
      </span>
    ) : (
      <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
    );

    return (
      <React.Fragment key={ch.id}>
        <div
          className={`group relative flex items-center transition ${
            dragOverChannelId === ch.id ? 'border-t-2 border-blue-500' : ''
          }`}
          draggable
          onDragStart={(e) => {
            if (isHoldingRef.current) {
              e.preventDefault();
              return;
            }
            setDraggedChannelId(ch.id);
            e.dataTransfer.setData('text/plain', ch.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragOverChannelId !== ch.id) setDragOverChannelId(ch.id);
          }}
          onDragLeave={() => {
            if (dragOverChannelId === ch.id) setDragOverChannelId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDropChannel(ch.id);
          }}
          onPointerDown={(e) => startChannelHold(ch, e)}
          onPointerMove={moveChannelHold}
          onPointerUp={clearChannelHold}
          onPointerCancel={clearChannelHold}
          onContextMenu={(e) => {
            e.preventDefault();
            if (onEditChannel) {
              setContextMenu({ x: e.clientX, y: e.clientY, channel: ch });
            }
          }}
        >
          <button
            id={`channel-btn-${ch.name}`}
            onClick={(e) => {
              if (isHoldingRef.current) {
                e.preventDefault();
                e.stopPropagation();
                isHoldingRef.current = false;
                return;
              }
              onSelectChannel(ch.id);
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition group text-left ${
              isActive
                ? 'bg-neutral-800 text-white font-semibold shadow-xs border-l-2 border-white pl-2'
                : hasUnreadMsgs || unreadPings > 0
                ? 'text-white font-medium hover:bg-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            {hasUnreadMsgs && (
              <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 -ml-0.5 mr-0.5" title="New messages" />
            )}
            {Icon}
            <span className="truncate flex-1">{ch.name}</span>
            {isReadOnlyForEveryone && !isHiddenChannel && (
              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-neutral-950 text-neutral-500 font-mono" title="Read-only channel">
                RO
              </span>
            )}
            {unreadPings > 0 && (
              <span
                className="ml-auto bg-red-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1.5 flex items-center justify-center shadow-xs shrink-0 animate-pulse"
                title={`${unreadPings} unread ping(s)`}
              >
                {unreadPings > 99 ? '99+' : unreadPings}
              </span>
            )}
          </button>

          {onEditChannel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditChannel(ch);
              }}
              title="Edit channel & permissions (or right-click)"
              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-700 transition mr-1"
            >
              <Settings className="w-3.5 h-3.5 cogwheel-interactive" />
            </button>
          )}
        </div>

        {(activeCallChannelId === ch.id || ch.type === 'voice') && (
          <button
            id={`channel-call-lobby-${ch.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCallLobby?.(ch.id);
            }}
            className={`w-[calc(100%-1.25rem)] ml-5 mt-0.5 mb-1 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center justify-between transition border shadow-xs ${
              activeCallChannelId === ch.id
                ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-400 hover:bg-emerald-900/90'
                : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Radio className={`w-3.5 h-3.5 shrink-0 ${activeCallChannelId === ch.id ? 'text-emerald-400 animate-pulse' : 'text-neutral-400'}`} />
              <span className="truncate">Call</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              activeCallChannelId === ch.id ? 'bg-emerald-900/80 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
            }`}>
              {activeCallChannelId === ch.id ? 'In Call' : 'Join'}
            </span>
          </button>
        )}
      </React.Fragment>
    );
  };

  const isPrivilegedUser =
    currentUser?.role === 'owner' ||
    currentUser?.role === 'co-owner' ||
    currentUser?.username?.toLowerCase() === 'kep' ||
    currentUser?.username?.toLowerCase() === 'keps' ||
    (activeServer && activeServer.ownerId === currentUser?.id) ||
    roles.some(
      (r) =>
        (currentUser?.roleIds || []).includes(r.id) &&
        (r.permissions?.canModerate || r.permissions?.canEditChannels)
    );

  const hasCategoryAccess = (cat: ChannelCategory): boolean => {
    if (currentUser?.role === 'owner' || currentUser?.role === 'co-owner') {
      return true;
    }
    const userRoles = roles.filter((r) => (currentUser?.roleIds || []).includes(r.id));
    if (userRoles.some((r) => r.permissions?.canModerate || r.permissions?.canEditChannels)) {
      return true;
    }
    if (cat.isPrivate) {
      const allowedView = cat.permissions?.canView;
      if (!allowedView || allowedView.length === 0) {
        return false;
      }
      return (currentUser?.roleIds || []).some((rid) => allowedView.includes(rid));
    }
    const allowedView = cat.permissions?.canView;
    if (allowedView && allowedView.length > 0 && !allowedView.includes('*')) {
      return (currentUser?.roleIds || []).some((rid) => allowedView.includes(rid));
    }
    return true;
  };

  const visibleCategories = categories.filter(hasCategoryAccess);

  const visibleChannels = channels.filter((ch) => {
    if (ch.id === 'c-reports') {
      return currentUser?.role === 'owner' || currentUser?.role === 'co-owner';
    }
    if (currentUser?.role === 'owner' || currentUser?.role === 'co-owner') {
      return true;
    }
    const userRoles = roles.filter((r) => (currentUser?.roleIds || []).includes(r.id));
    if (userRoles.some((r) => r.permissions?.canModerate || r.permissions?.canEditChannels)) {
      return true;
    }
    if (ch.categoryId) {
      const parentCat = categories.find((c) => c.id === ch.categoryId);
      if (parentCat && !hasCategoryAccess(parentCat)) {
        return false;
      }
    }
    const allowedView = ch.permissions?.canView || ch.permissions?.allowedRolesSee;
    if (allowedView && allowedView.length > 0 && !allowedView.includes('*')) {
      const hasAccess = (currentUser?.roleIds || []).some((rid) => allowedView.includes(rid));
      if (!hasAccess) return false;
    }
    return true;
  });

  const uncategorizedChannels = visibleChannels.filter(
    (ch) => !ch.categoryId || !visibleCategories.some((cat) => cat.id === ch.categoryId)
  );

  const isPrivileged = currentUser?.role === 'owner' || currentUser?.role === 'co-owner' || currentUser?.username?.toLowerCase() === 'kep' || currentUser?.username?.toLowerCase() === 'keps' || (activeServer && activeServer.ownerId === currentUser?.id);
  const userRoles = roles.filter((r) => (currentUser?.roleIds || []).includes(r.id));
  const isServerAdmin = isPrivileged || userRoles.some((r) => r.permissions?.canModerate || r.permissions?.canEditChannels);

  return (
    <aside
      id="chat-sidebar"
      className="w-64 h-full bg-neutral-950 border-r border-neutral-800 flex flex-col select-none shrink-0"
    >
      {/* Workspace Header */}
      {isDmsView ? (
        <div className="h-14 border-b border-neutral-800 px-3 flex items-center bg-neutral-950">
          <button
            onClick={onOpenNewDm}
            className="w-full bg-[#1e1f22] hover:bg-[#2b2d31] text-xs text-neutral-400 hover:text-neutral-200 py-1.5 px-2.5 rounded flex items-center justify-between transition"
          >
            <span className="truncate">Find or start a conversation</span>
            <Search className="w-3.5 h-3.5 shrink-0 ml-1 text-neutral-500" />
          </button>
        </div>
      ) : (
        <div className="h-14 border-b border-neutral-800 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white font-bold text-sm tracking-wider flex-shrink-0">
              {activeServer?.icon || '💬'}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white tracking-tight leading-tight truncate" title={activeServer?.name || 'Community Chat'}>
                {activeServer?.name || 'Community Chat'}
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span>{onlineUserIds.size} online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isServerAdmin && onOpenServerSettings && (
              <button
                onClick={onOpenServerSettings}
                title="Server Settings"
                className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
              >
                <Settings className="w-4 h-4 cogwheel-interactive" />
              </button>
            )}
            <button
              id="toggle-members-btn"
              onClick={onToggleMembersPanel}
              title="Toggle members sidebar"
              className={`p-1.5 rounded-md transition ${
                showMembersPanel
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
              }`}
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation & Channel / DM List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {isDmsView ? (
          /* Dedicated Friends & Direct Messages Section */
          <div className="space-y-4">
            {/* Friends Button */}
            <button
              onClick={() => onSelectFriends?.()}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition text-left cursor-pointer ${
                activeTarget.id === 'friends'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <Users className={`w-5 h-5 shrink-0 ${activeTarget.id === 'friends' ? 'text-white' : 'text-neutral-400'}`} />
              <span className="flex-1 font-semibold">Friends</span>
              {onlineUserIds.size > 0 && (
                <span className="text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-mono">
                  {onlineUserIds.size}
                </span>
              )}
            </button>

            {/* Direct Messages Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  DIRECT MESSAGES
                </span>
                {currentUser && (
                  <button
                    id="add-dm-btn"
                    onClick={onOpenNewDm}
                    title="Start a direct message"
                    className="text-neutral-400 hover:text-white p-0.5 rounded-md hover:bg-neutral-800 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              {!currentUser ? (
                <p className="text-[11px] text-neutral-500 px-2 py-2">
                  Sign in to message people privately.
                </p>
              ) : dms.length === 0 ? (
                <button
                  onClick={onOpenNewDm}
                  className="w-full text-left text-xs text-neutral-400 hover:text-neutral-300 px-3 py-2 rounded-md hover:bg-neutral-900 transition flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start your first DM...</span>
                </button>
              ) : (
                <div className="space-y-0.5">
                  {dms.map((dm) => {
                    const otherUser = dm.user1Id === currentUser.id ? dm.user2 : dm.user1;
                    const isOnline = onlineUserIds.has(otherUser.id);
                    const isActive = activeTarget.type === 'dm' && activeTarget.id === dm.id;

                    return (
                      <button
                        key={dm.id}
                        id={`dm-btn-${otherUser.username}`}
                        onClick={() => onSelectDm(dm.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition group text-left ${
                          isActive
                            ? 'bg-neutral-800 text-white font-medium shadow-xs'
                            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs overflow-hidden bg-neutral-800 border border-neutral-700 shrink-0"
                            style={{ backgroundColor: otherUser.avatarColor || '#3b82f6' }}
                          >
                            {otherUser.avatarUrl ? (
                              <img src={otherUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              (otherUser.displayName || otherUser.username).slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-neutral-950 ${
                              isOnline ? 'bg-emerald-500' : 'bg-neutral-600'
                            }`}
                          />
                        </div>
                        <div className="truncate flex-1">
                          <div className="truncate font-semibold text-xs text-neutral-200">
                            {otherUser.displayName || otherUser.username}
                          </div>
                          {otherUser.statusText && (
                            <div className="text-[10px] text-neutral-400 truncate">
                              {otherUser.statusText}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Server Channels Section */
          <>
            <div>
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Channels
                </span>
                {currentUser && (
                  <div className="flex items-center gap-1">
                    {onOpenNewCategory && (
                      <button
                        id="add-category-btn"
                        onClick={onOpenNewCategory}
                        title="Create a category"
                        className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      id="add-channel-btn"
                      onClick={onOpenNewChannel}
                      title="Create a channel"
                      className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* If there are categories, group channels by category */}
              {visibleCategories.length > 0 ? (
                <div className="space-y-3">
                  {/* Uncategorized channels if any */}
                  {uncategorizedChannels.length > 0 && (
                    <div className="space-y-0.5">
                      {uncategorizedChannels.map((ch) => renderChannelItem(ch))}
                    </div>
                  )}

                  {/* Categorized groups */}
                  {visibleCategories.map((cat) => {
                    const isCollapsed = collapsedCategories.has(cat.id);
                    const catChannels = visibleChannels.filter((ch) => ch.categoryId === cat.id);

                    return (
                      <div key={cat.id} className="space-y-0.5">
                        {/* Category Header */}
                        <div
                          className="group flex items-center justify-between px-1 py-1 text-xs font-semibold text-neutral-400 hover:text-neutral-200 select-none cursor-pointer"
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (dragOverChannelId !== cat.id) setDragOverChannelId(cat.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverChannelId === cat.id) setDragOverChannelId(null);
                          }}
                          onPointerDown={(e) => startCategoryHold(cat, e)}
                          onPointerMove={moveChannelHold}
                          onPointerUp={clearChannelHold}
                          onPointerCancel={clearChannelHold}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (isPrivilegedUser) {
                              setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: cat });
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverChannelId(null);
                            if (draggedChannelId) {
                              api.request(`/api/channels/${draggedChannelId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ categoryId: cat.id }),
                              }).catch(err => {
                                console.error('Failed to move channel:', err);
                              });
                              setDraggedChannelId(null);
                            }
                          }}
                        >
                          <button
                            onClick={() => {
                              if (isHoldingRef.current) {
                                isHoldingRef.current = false;
                                return;
                              }
                              toggleCategoryCollapse(cat.id);
                            }}
                            className="flex items-center gap-1.5 flex-1 text-left truncate cursor-pointer"
                            title={isCollapsed ? 'Expand category' : 'Collapse category'}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            )}
                            <span className="text-[11px] font-bold uppercase tracking-wider truncate text-neutral-400 group-hover:text-neutral-300">
                              {cat.name}
                            </span>
                            <span className="text-[10px] text-neutral-600 font-mono">
                              ({catChannels.length})
                            </span>
                          </button>

                          <div className="flex items-center gap-0.5">
                            {currentUser && (
                              <button
                                onClick={() =>
                                  onOpenNewChannelWithCategory
                                    ? onOpenNewChannelWithCategory(cat.id)
                                    : onOpenNewChannel()
                                }
                                title={`Create channel in ${cat.name}`}
                                className="p-1 text-neutral-500 hover:text-white rounded hover:bg-neutral-800 transition"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isPrivilegedUser && onEditCategory && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditCategory(cat);
                                }}
                                title={`Edit category ${cat.name}`}
                                className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-white rounded hover:bg-neutral-800 transition"
                              >
                                <Settings className="w-3 h-3 cogwheel-interactive" />
                              </button>
                            )}
                            {isPrivilegedUser && onDeleteCategory && (
                              <button
                                onClick={async () => {
                                  const confirmed = await (window as any).customConfirm(
                                    `Are you sure you want to delete category "${cat.name}"? Channels inside will become uncategorized.`
                                  );
                                  if (confirmed) {
                                    onDeleteCategory(cat.id);
                                  }
                                }}
                                title={`Delete category ${cat.name}`}
                                className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 rounded hover:bg-neutral-800 transition"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Channels inside category */}
                        {!isCollapsed && (
                          <div className="pl-1 space-y-0.5">
                            {catChannels.length > 0 ? (
                              catChannels.map((ch) => renderChannelItem(ch))
                            ) : (
                              <div className="px-4 py-1 text-[11px] text-neutral-600 italic">
                                No channels in this category
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* No categories configured - render flat list */
                <div className="space-y-0.5">
                  {visibleChannels.map((ch) => renderChannelItem(ch))}
                </div>
              )}
            </div>

            {/* Administration & Updates Links */}
            <div className="pt-2 border-t border-neutral-900 space-y-1">
              {onOpenUpdates && (
                <button
                  onClick={onOpenUpdates}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition"
                >
                  <History className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Changelog / Updates</span>
                  <span className="ml-auto font-mono text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
                    1.5v
                  </span>
                </button>
              )}

              {currentUser && onOpenAutoMod && (
                <button
                  onClick={onOpenAutoMod}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>AutoMod Filter</span>
                </button>
              )}

              {currentUser && onOpenRoles && (
                <button
                  onClick={onOpenRoles}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition"
                >
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                  <span>Roles & Perms</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer / User Profile Strip */}
      <div className="border-t border-neutral-800 p-2.5 bg-neutral-950">
        {currentUser ? (
          <div className="flex items-center justify-between">
            <button
              id="sidebar-user-profile-btn"
              onClick={() => {
                if (onViewPublicProfile) {
                  onViewPublicProfile(currentUser);
                } else {
                  onOpenProfile();
                }
              }}
              title="View your profile"
              className="flex items-center gap-2.5 text-left p-1 rounded-lg hover:bg-neutral-900 transition flex-1 min-w-0 mr-1 cursor-pointer"
            >
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shadow-xs overflow-hidden bg-neutral-800 border border-neutral-700 shrink-0"
                  style={{ backgroundColor: currentUser.avatarColor || '#3b82f6' }}
                >
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    (currentUser.displayName || currentUser.username).slice(0, 2).toUpperCase()
                  )}
                </div>
                <span
                  className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-neutral-950 ${
                    currentUser.status === 'online'
                      ? 'bg-emerald-500'
                      : currentUser.status === 'busy'
                      ? 'bg-red-500'
                      : 'bg-amber-500'
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">
                  {currentUser.displayName || currentUser.username}
                </div>
                <div className="text-[11px] text-neutral-400 truncate">
                  {currentUser.statusText || `@${currentUser.username}`}
                </div>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                id="sidebar-notifications-btn"
                onClick={onOpenNotifications}
                title="Notifications & Mentions"
                className="relative p-1.5 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-900 transition group"
              >
                <Bell className="w-4 h-4 bell-hover-ring" />
                {(() => {
                  const totalPings = (Object.values(channelUnreadPings) as number[]).reduce((a: number, b: number) => a + b, 0);
                  if (totalPings > 0) {
                    return (
                      <span className="absolute -top-1 -right-1 px-1 min-w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                        {totalPings > 9 ? '9+' : totalPings}
                      </span>
                    );
                  }
                  if (Object.values(channelUnreadMessages).some(Boolean)) {
                    return <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400" />;
                  }
                  return null;
                })()}
              </button>
              <button
                id="sidebar-sound-toggle-btn"
                onClick={onToggleSound}
                title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                className="p-1.5 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-900 transition"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                id="sidebar-settings-btn"
                onClick={onOpenProfile}
                title="Profile settings & session"
                className="p-1.5 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-900 transition"
              >
                <Settings className="w-4 h-4 cogwheel-interactive" />
              </button>
            </div>
          </div>
        ) : (
          <button
            id="sidebar-signin-btn"
            onClick={onOpenAuth}
            className="w-full bg-white hover:bg-neutral-100 text-neutral-900 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 transition shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In / Create Account</span>
          </button>
        )}
      </div>

      {/* Context menus click-off dismiss backdrop */}
      {(contextMenu || categoryContextMenu) && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => {
            setContextMenu(null);
            setCategoryContextMenu(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
            setCategoryContextMenu(null);
          }}
        />
      )}

      {contextMenu && (
        <div
          className="fixed z-50 w-48 bg-neutral-900 border border-neutral-800 rounded-md shadow-2xl py-1 text-sm animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-neutral-400 border-b border-neutral-800 mb-1">
            #{contextMenu.channel.name}
          </div>
          <button
            onClick={async () => {
              const mutedChannels = JSON.parse(localStorage.getItem('muted_channels') || '[]');
              if (mutedChannels.includes(contextMenu.channel.id)) {
                localStorage.setItem('muted_channels', JSON.stringify(mutedChannels.filter((id: string) => id !== contextMenu.channel.id)));
                await (window as any).customAlert('Channel unmuted');
              } else {
                mutedChannels.push(contextMenu.channel.id);
                localStorage.setItem('muted_channels', JSON.stringify(mutedChannels));
                await (window as any).customAlert('Channel muted');
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-neutral-200 hover:bg-emerald-600 hover:text-white transition"
          >
            {JSON.parse(localStorage.getItem('muted_channels') || '[]').includes(contextMenu.channel.id) ? 'Unmute' : 'Mute'} channel
          </button>
          <button
            onClick={() => onEditChannel?.(contextMenu.channel)}
            className="w-full text-left px-3 py-1.5 text-neutral-200 hover:bg-emerald-600 hover:text-white transition"
          >
            Rename
          </button>
          <button
            onClick={() => onEditChannel?.(contextMenu.channel)}
            className="w-full text-left px-3 py-1.5 text-neutral-200 hover:bg-emerald-600 hover:text-white transition"
          >
            Advanced channel settings
          </button>
          <div className="h-px bg-neutral-800 my-1" />
          <button
            onClick={() => handleDeleteChannel(contextMenu.channel)}
            className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-600 hover:text-white transition"
          >
            Delete channel
          </button>
        </div>
      )}

      {categoryContextMenu && (
        <div
          className="fixed z-50 w-48 bg-neutral-900 border border-neutral-800 rounded-md shadow-2xl py-1 text-sm animate-in fade-in zoom-in-95 duration-100"
          style={{ left: categoryContextMenu.x, top: categoryContextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-neutral-400 border-b border-neutral-800 mb-1">
            Folder: {categoryContextMenu.category.name}
          </div>
          <button
            onClick={() => {
              if (onEditCategory) onEditCategory(categoryContextMenu.category);
              setCategoryContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-neutral-200 hover:bg-emerald-600 hover:text-white transition"
          >
            Rename Category
          </button>
          <button
            onClick={() => {
              if (onOpenNewChannelWithCategory) {
                onOpenNewChannelWithCategory(categoryContextMenu.category.id);
              } else {
                onOpenNewChannel();
              }
              setCategoryContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-neutral-200 hover:bg-emerald-600 hover:text-white transition"
          >
            Create Channel
          </button>
          <div className="h-px bg-neutral-800 my-1" />
          <button
            onClick={async () => {
              const confirmed = await (window as any).customConfirm(`Are you sure you want to delete category "${categoryContextMenu.category.name}"? Channels inside will become uncategorized.`);
              if (confirmed && onDeleteCategory) {
                try {
                  await onDeleteCategory(categoryContextMenu.category.id);
                } catch (err: any) {
                  console.error('Failed to delete category:', err);
                }
              }
              setCategoryContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-600 hover:text-white transition"
          >
            Delete Category
          </button>
        </div>
      )}
    </aside>
  );
};
