import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase.ts';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Menu, X, Bell, Users, MessageSquare } from 'lucide-react';
import type {
  User,
  Channel,
  ChannelCategory,
  DirectMessageConversation,
  Message,
  Role,
  MessageAttachment,
  Server,
} from './types.ts';
import { api, getStoredToken } from './lib/api.ts';
import { socket } from './lib/socket.ts';
import { isSoundEnabled, setSoundEnabled, playMessageReceived, playPingNotification } from './lib/audio.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatArea } from './components/ChatArea.tsx';
import { MembersPanel } from './components/MembersPanel.tsx';
import { FriendsView } from './components/FriendsView.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { UserProfileModal } from './components/UserProfileModal.tsx';
import { NewChannelModal } from './components/NewChannelModal.tsx';
import { NewCategoryModal } from './components/NewCategoryModal.tsx';
import { EditCategoryModal } from './components/EditCategoryModal.tsx';
import { DirectMessageModal } from './components/DirectMessageModal.tsx';
import { AutoModModal } from './components/AutoModModal.tsx';
import { ChannelSettingsModal } from './components/ChannelSettingsModal.tsx';
import { RolesModal } from './components/RolesModal.tsx';
import { UpdatesModal } from './components/UpdatesModal.tsx';
import { PublicProfileModal } from './components/PublicProfileModal.tsx';
import { NotificationModal } from './components/NotificationModal.tsx';
import { BrowserView } from './components/BrowserView.tsx';
import { CustomPopupModal } from './components/CustomPopupModal.tsx';
import { NewServerModal } from './components/NewServerModal.tsx';
import { ServerSettingsModal } from './components/ServerSettingsModal.tsx';
import { ServerContextMenu } from './components/ServerContextMenu.tsx';
import { InviteModal } from './components/InviteModal.tsx';
import { VersionUpdateBanner } from './components/VersionUpdateBanner.tsx';
import type { ChatNotification } from './types.ts';

function applySiteStyle(styleData: any) {
  if (!styleData) return;
  let styleEl = document.getElementById('ai-site-style-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ai-site-style-overrides';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = styleData.css || '';

  if (styleData.themeConfig) {
    const root = document.documentElement;
    if (styleData.themeConfig.primaryColor) {
      root.style.setProperty('--ai-primary', styleData.themeConfig.primaryColor);
    }
    if (styleData.themeConfig.backgroundColor) {
      root.style.setProperty('--ai-bg', styleData.themeConfig.backgroundColor);
    }
    if (styleData.themeConfig.textColor) {
      root.style.setProperty('--ai-text', styleData.themeConfig.textColor);
    }
    if (styleData.themeConfig.accentColor) {
      root.style.setProperty('--ai-accent', styleData.themeConfig.accentColor);
    }
  }
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFadeOut, setSplashFadeOut] = useState(false);

  useEffect(() => {
    // Keep splash animation for minimum 2.0s, then fade out smoothly
    const timer = setTimeout(() => {
      setSplashFadeOut(true);
      const endTimer = setTimeout(() => {
        setShowSplash(false);
      }, 500); // fade transition
      return () => clearTimeout(endTimer);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dms, setDms] = useState<DirectMessageConversation[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeTarget, setActiveTarget] = useState<{ type: 'channel' | 'dm'; id: string }>({
    type: 'channel',
    id: 'c-general',
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled());
  const [channelUnreadMessages, setChannelUnreadMessages] = useState<Record<string, boolean>>({});
  const [channelUnreadPings, setChannelUnreadPings] = useState<Record<string, number>>({});
  const [showFirstVisitPrompt, setShowFirstVisitPrompt] = useState<boolean>(false);
  const [showAuthConfirmPrompt, setShowAuthConfirmPrompt] = useState<boolean>(false);

  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm' | 'prompt';
    title?: string;
    message: string;
    defaultValue?: string;
    onConfirm: (value?: string) => void;
    onCancel: () => void;
  } | null>(null);

  const showAlert = useCallback((message: string, title = 'Notification') => {
    return new Promise<void>((resolve) => {
      setPopup({
        isOpen: true,
        type: 'alert',
        title,
        message,
        onConfirm: () => {
          setPopup(null);
          resolve();
        },
        onCancel: () => {
          setPopup(null);
          resolve();
        },
      });
    });
  }, []);

  const showConfirm = useCallback((message: string, title = 'Confirmation') => {
    return new Promise<boolean>((resolve) => {
      setPopup({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          setPopup(null);
          resolve(true);
        },
        onCancel: () => {
          setPopup(null);
          resolve(false);
        },
      });
    });
  }, []);

  const showPrompt = useCallback((message: string, defaultValue = '', title = 'Input Required') => {
    return new Promise<string | null>((resolve) => {
      setPopup({
        isOpen: true,
        type: 'prompt',
        title,
        message,
        defaultValue,
        onConfirm: (val) => {
          setPopup(null);
          resolve(val !== undefined ? val : null);
        },
        onCancel: () => {
          setPopup(null);
          resolve(null);
        },
      });
    });
  }, []);

  useEffect(() => {
    (window as any).customAlert = showAlert;
    (window as any).customConfirm = showConfirm;
    (window as any).customPrompt = showPrompt;
  }, [showAlert, showConfirm, showPrompt]);

  // UI Drawer & Modal States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isNewChannelModalOpen, setIsNewChannelModalOpen] = useState(false);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<ChannelCategory | null>(null);
  const [newChannelCategoryId, setNewChannelCategoryId] = useState<string | undefined>(undefined);
  const [isNewDmModalOpen, setIsNewDmModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [isAutoModModalOpen, setIsAutoModModalOpen] = useState(false);
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const [isUpdatesModalOpen, setIsUpdatesModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [publicProfileUser, setPublicProfileUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<ChatNotification[]>(() => {
    try {
      const saved = localStorage.getItem('chat_notifications_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('chat_notifications_v1', JSON.stringify(notifications.slice(0, 100)));
    } catch {}
  }, [notifications]);

  // Multiple Servers State
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string>('s-default');
  const [isNewServerModalOpen, setIsNewServerModalOpen] = useState(false);
  const [isServerSettingsModalOpen, setIsServerSettingsModalOpen] = useState(false);
  const [contextMenuServer, setContextMenuServer] = useState<{ server: Server; x: number; y: number } | null>(null);
  const [inviteModalServer, setInviteModalServer] = useState<Server | null>(null);
  const [serverVersion, setServerVersion] = useState<string | undefined>(undefined);

  // Disable default browser right-click menu across site as requested
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Persistent Active Voice / Video Call across channel navigation
  const [activeCall, setActiveCall] = useState<{
    channelId: string;
    initialCallType: 'audio' | 'video';
    isInitiator: boolean;
  } | null>(null);
  const [isCallLobbyOpen, setIsCallLobbyOpen] = useState(true);

  const handleStartCall = (channelId: string, type: 'audio' | 'video', isInitiator = false) => {
    setActiveCall({ channelId, initialCallType: type, isInitiator });
    setIsCallLobbyOpen(true);
  };

  const handleLeaveCall = () => {
    setActiveCall(null);
    setIsCallLobbyOpen(false);
  };

  const handleOpenCallLobby = (channelId: string) => {
    if (activeCall?.channelId === channelId) {
      setIsCallLobbyOpen(true);
      setActiveTarget({ type: 'channel', id: channelId });
    } else {
      setActiveCall({ channelId, initialCallType: 'audio', isInitiator: false });
      setIsCallLobbyOpen(true);
      setActiveTarget({ type: 'channel', id: channelId });
    }
  };

  const typingTimeoutRef = useRef<Map<string, number>>(new Map());
  const lastTypingSentRef = useRef<number>(0);
  const activeTargetRef = useRef(activeTarget);
  activeTargetRef.current = activeTarget;

  const serverIsHoldingRef = useRef<boolean>(false);
  const serverStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const serverHoldTimerRef = useRef<any>(null);

  const loadRoles = useCallback(async () => {
    try {
      const res = await api.getRoles();
      if (res.roles) setRoles(res.roles);
    } catch (err) {
      console.warn('Failed to load roles:', err);
    }
  }, []);

  // 1. Initial Load: Check session via cookie or stored token, load channels and roles
  useEffect(() => {
    async function initSession() {
      try {
        const { user } = await api.getMe();
        if (user) {
          setCurrentUser(user);
          socket.connect();
        }
      } catch (err) {
        console.warn('No active session found on initial load:', err);
      } finally {
        setAuthChecked(true);
        if (!localStorage.getItem('first_visit_prompt_dismissed')) {
          setShowFirstVisitPrompt(true);
        }
      }

      // Load initial servers, channels, categories & roles
      try {
        const [{ servers: loadedServers }, { channels: loadedChannels }, { categories: loadedCategories }] = await Promise.all([
          api.getServers().catch(() => ({ servers: [{ id: 's-default', name: 'Default Workspace', icon: '💬', ownerId: 'system', createdAt: Date.now() }] })),
          api.getChannels(),
          api.getCategories().catch(() => ({ categories: [] })),
          loadRoles(),
        ]);
        setServers(loadedServers);
        setChannels(loadedChannels);
        setCategories(loadedCategories || []);
        
        const serverChannels = loadedChannels.filter((c) => (c.serverId || 's-default') === 's-default');
        if (serverChannels.length > 0) {
          setActiveTarget({ type: 'channel', id: serverChannels[0].id });
        } else if (loadedChannels.length > 0) {
          setActiveTarget({ type: 'channel', id: loadedChannels[0].id });
        }
      } catch (err) {
        console.error('Failed to load initial workspace data:', err);
      }

      // Load initial site style overrides
      try {
        const styleRes = await api.getSiteStyle();
        if (styleRes?.style) {
          applySiteStyle(styleRes.style);
        }
      } catch {
        // Ignore
      }
    }

    initSession();
  }, [loadRoles]);

  // 2. Load users & DMs when authenticated
  const refreshUserData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [{ users }, { dms: userDms }] = await Promise.all([
        api.getUsers(),
        api.getDms(),
      ]);
      setAllUsers(users);
      setDms(userDms);
      loadRoles();
    } catch (err) {
      console.error('Failed to fetch user list or DMs:', err);
    }
  }, [currentUser, loadRoles]);

  useEffect(() => {
    if (currentUser) {
      refreshUserData();
      socket.connect();
    }
  }, [currentUser, refreshUserData]);

  // 3. Load messages when active target changes
  useEffect(() => {
    let isCancelled = false;

    async function loadMessages() {
      try {
        if (activeTarget.type === 'channel') {
          const { messages: msgs } = await api.getChannelMessages(activeTarget.id);
          if (!isCancelled) setMessages(msgs);
        } else {
          const { messages: msgs } = await api.getDmMessages(activeTarget.id);
          if (!isCancelled) setMessages(msgs);
        }
      } catch (err) {
        console.error('Failed to load messages for target:', err);
      }
    }

    if (activeTarget.id) {
      loadMessages();
    }

    return () => {
      isCancelled = true;
    };
  }, [activeTarget]);

  // 4. Independent 1-second refresh intervals
  // (a) Chat messages refresher (every 1s)
  useEffect(() => {
    if (!activeTarget.id) return;
    const interval = setInterval(async () => {
      try {
        if (activeTarget.type === 'channel') {
          const { messages: msgs } = await api.getChannelMessages(activeTarget.id);
          setMessages((prev) => {
            if (
              prev.length === msgs.length &&
              prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id &&
              prev[prev.length - 1]?.reactions === msgs[msgs.length - 1]?.reactions
            ) {
              const same = prev.every(
                (m, i) =>
                  m.id === msgs[i]?.id &&
                  m.text === msgs[i]?.text &&
                  m.isPinned === msgs[i]?.isPinned &&
                  m.senderAvatarUrl === msgs[i]?.senderAvatarUrl &&
                  m.senderName === msgs[i]?.senderName &&
                  JSON.stringify(m.reactions) === JSON.stringify(msgs[i]?.reactions)
              );
              if (same) return prev;
            }
            return msgs;
          });
        } else {
          const { messages: msgs } = await api.getDmMessages(activeTarget.id);
          setMessages((prev) => {
            if (prev.length === msgs.length && prev[prev.length - 1]?.id === msgs[msgs.length - 1]?.id) {
              const same = prev.every(
                (m, i) =>
                  m.id === msgs[i]?.id &&
                  m.text === msgs[i]?.text &&
                  m.isPinned === msgs[i]?.isPinned &&
                  m.senderAvatarUrl === msgs[i]?.senderAvatarUrl &&
                  m.senderName === msgs[i]?.senderName &&
                  JSON.stringify(m.reactions) === JSON.stringify(msgs[i]?.reactions)
              );
              if (same) return prev;
            }
            return msgs;
          });
        }
      } catch {
        // silent background poll
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTarget.id, activeTarget.type]);

  // (b) Channels refresher (every 1s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { channels: fetched } = await api.getChannels();
        setChannels((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(fetched)) return prev;
          return fetched;
        });
      } catch {
        // silent background poll
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // (c) DMs refresher (every 1s)
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(async () => {
      try {
        const { dms: fetched } = await api.getDms();
        setDms((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(fetched)) return prev;
          return fetched;
        });
      } catch {
        // silent background poll
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // (d) Members & Profiles refresher (every 1s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { users: fetchedUsers } = await api.getUsers();
        setAllUsers((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(fetchedUsers)) return prev;
          return fetchedUsers;
        });
        if (currentUser?.id) {
          const matchingCurrent = fetchedUsers.find((u) => u.id === currentUser.id);
          if (
            matchingCurrent &&
            (matchingCurrent.avatarUrl !== currentUser.avatarUrl ||
              matchingCurrent.username !== currentUser.username ||
              matchingCurrent.status !== currentUser.status)
          ) {
            setCurrentUser(matchingCurrent);
          }
        }
      } catch {
        // silent background poll
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.avatarUrl, currentUser?.username, currentUser?.status]);

  // 5. Set up WebSocket event listeners
  useEffect(() => {
    const unsubInit = socket.on('init', (data: { onlineUserIds: string[]; version?: string }) => {
      if (data?.onlineUserIds) {
        setOnlineUserIds(new Set(data.onlineUserIds));
      }
      if (data?.version) {
        setServerVersion(data.version);
      }
    });

    const unsubVersion = socket.on('version:new', (data: { version: string }) => {
      if (data?.version) {
        setServerVersion(data.version);
      }
    });

    const unsubMsg = socket.on('message:new', (newMsg: Message) => {
      const current = activeTargetRef.current;
      if (newMsg.targetType === current.type && newMsg.targetId === current.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } else {
        if (newMsg.targetType === 'channel') {
          setChannelUnreadMessages((prev) => ({ ...prev, [newMsg.targetId]: true }));
          const isUserMentioned =
            currentUser &&
            (new RegExp(`\\b@${currentUser.username}\\b`, 'i').test(newMsg.text) ||
              newMsg.text.includes('@everyone') ||
              newMsg.text.includes('@here'));

          if (isUserMentioned) {
            setChannelUnreadPings((prev) => ({
              ...prev,
              [newMsg.targetId]: (prev[newMsg.targetId] || 0) + 1,
            }));
          }
        }
      }

      // Track notification history if received from someone else
      if (currentUser && newMsg.senderId !== currentUser.id) {
        const isMention =
          new RegExp(`\\b@${currentUser.username}\\b`, 'i').test(newMsg.text) ||
          newMsg.text.includes('@everyone') ||
          newMsg.text.includes('@here');

        if (isMention || newMsg.targetType === 'dm') {
          const ch = channels.find((c) => c.id === newMsg.targetId);
          const newNotif: ChatNotification = {
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type: isMention ? 'mention' : 'dm',
            channelId: newMsg.targetType === 'channel' ? newMsg.targetId : undefined,
            channelName: ch?.name || 'channel',
            dmId: newMsg.targetType === 'dm' ? newMsg.targetId : undefined,
            messageId: newMsg.id,
            senderId: newMsg.senderId,
            senderName: newMsg.senderName,
            senderAvatarColor: newMsg.senderAvatarColor,
            senderAvatarUrl: newMsg.senderAvatarUrl,
            text: newMsg.text,
            timestamp: newMsg.timestamp || newMsg.createdAt,
            isRead: false,
          };
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
        }

        const mutedChannels = JSON.parse(localStorage.getItem('muted_channels') || '[]');
        const isMuted = newMsg.targetType === 'channel' && mutedChannels.includes(newMsg.targetId);

        if (newMsg.text.includes('@silent') || isMuted) {
          // Do not notify
        } else if (isMention) {
          playPingNotification();
        } else {
          playMessageReceived();
        }
      }

      // Refresh DM list to show latest timestamp if it's a DM
      if (newMsg.targetType === 'dm') {
        refreshUserData();
      }
    });

    const unsubReaction = socket.on(
      'message:reaction',
      (data: { messageId: string; reactions: Record<string, string[]> }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
        );
      }
    );

    const unsubUpdate = socket.on('message:update', (updatedMsg: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
      );
    });

    const unsubDelete = socket.on('message:delete', (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    });

    const unsubPresence = socket.on(
      'user:presence',
      (data: { userId: string; status: 'online' | 'offline' | 'away' | 'busy' }) => {
        setOnlineUserIds((prev) => {
          const updated = new Set(prev);
          if (data.status === 'offline') {
            updated.delete(data.userId);
          } else {
            updated.add(data.userId);
          }
          return updated;
        });

        setAllUsers((prev) =>
          prev.map((u) => (u.id === data.userId ? { ...u, status: data.status } : u))
        );
      }
    );

    const unsubTyping = socket.on(
      'user:typing',
      (data: { targetType: 'channel' | 'dm'; targetId: string; userId: string; username: string }) => {
        const current = activeTargetRef.current;
        if (
          data.targetType === current.type &&
          data.targetId === current.id &&
          data.userId !== currentUser?.id
        ) {
          setTypingUsers((prev) => (prev.includes(data.username) ? prev : [...prev, data.username]));

          const existingTimer = typingTimeoutRef.current.get(data.username);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = window.setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== data.username));
            typingTimeoutRef.current.delete(data.username);
          }, 2500);

          typingTimeoutRef.current.set(data.username, timer);
        }
      }
    );

    const unsubChannel = socket.on('channel:created', (newChannel: Channel) => {
      setChannels((prev) => {
        if (prev.some((c) => c.id === newChannel.id)) return prev;
        return [...prev, newChannel];
      });
    });

    const unsubChannelUpdated = socket.on('channel:updated', (updatedChannel: Channel) => {
      setChannels((prev) => prev.map((c) => (c.id === updatedChannel.id ? updatedChannel : c)));
    });

    const unsubChannelsReordered = socket.on('channels:reordered', (newChannels: Channel[]) => {
      setChannels(newChannels);
    });

    const unsubChannelDeleted = socket.on('channel:deleted', (data: { channelId: string }) => {
      setChannels((prev) => prev.filter((c) => c.id !== data.channelId));
      setActiveTarget((prev) => {
        if (prev.type === 'channel' && prev.id === data.channelId) {
          return { type: 'channel', id: 'c-general' };
        }
        return prev;
      });
    });

    const unsubUserUpdated = socket.on('user:updated', (updatedUser: User) => {
      setAllUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      if (currentUser && currentUser.id === updatedUser.id) {
        setCurrentUser(updatedUser);
      }
    });

    const unsubRoleCreated = socket.on('role:created', (newRole: Role) => {
      setRoles((prev) => [...prev.filter((r) => r.id !== newRole.id), newRole]);
    });

    const unsubRoleUpdated = socket.on('role:updated', (updatedRole: Role) => {
      setRoles((prev) => prev.map((r) => (r.id === updatedRole.id ? updatedRole : r)));
    });

    const unsubRoleDeleted = socket.on('role:deleted', (data: { roleId: string }) => {
      setRoles((prev) => prev.filter((r) => r.id !== data.roleId));
    });

    const unsubRolesReordered = socket.on('roles:reordered', (newRoles: Role[]) => {
      setRoles(newRoles);
    });

    const unsubCategoryCreated = socket.on('category:created', (newCat: ChannelCategory) => {
      setCategories((prev) => {
        if (prev.some((c) => c.id === newCat.id)) return prev;
        return [...prev, newCat];
      });
    });

    const unsubCategoryUpdated = socket.on('category:updated', (updatedCat: ChannelCategory) => {
      setCategories((prev) => prev.map((c) => (c.id === updatedCat.id ? updatedCat : c)));
    });

    const unsubCategoryDeleted = socket.on('category:deleted', (data: { categoryId: string }) => {
      setCategories((prev) => prev.filter((c) => c.id !== data.categoryId));
      setChannels((prev) =>
        prev.map((ch) => (ch.categoryId === data.categoryId ? { ...ch, categoryId: undefined } : ch))
      );
    });

    const unsubWorkspaceImported = socket.on('workspace:imported', async () => {
      try {
        const [{ channels: chs }, { roles: rols }] = await Promise.all([
          api.getChannels(),
          api.getRoles(),
        ]);
        setChannels(chs);
        setRoles(rols);
        if (activeTargetRef.current.type === 'channel' && activeTargetRef.current.id) {
          const { messages: msgs } = await api.getChannelMessages(activeTargetRef.current.id);
          setMessages(msgs);
        }
      } catch (err) {
        console.warn('Error refreshing after workspace import:', err);
      }
    });

    const unsubSiteStyle = socket.on('sitestyle:updated', (data: any) => {
      if (data) {
        applySiteStyle(data);
      }
    });

    const unsubServerCreated = socket.on('server:created' as any, (newServer: Server) => {
      setServers((prev) => {
        if (prev.some((s) => s.id === newServer.id)) return prev;
        return [...prev, newServer];
      });
    });

    const unsubServerUpdated = socket.on('server:updated' as any, (updatedServer: Server) => {
      setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
    });

    const unsubServerDeleted = socket.on('server:deleted' as any, (data: { serverId: string }) => {
      setServers((prev) => prev.filter((s) => s.id !== data.serverId));
      setActiveServerId((prev) => {
        if (prev === data.serverId) return 's-default';
        return prev;
      });
    });

    return () => {
      unsubInit();
      unsubVersion();
      unsubMsg();
      unsubReaction();
      unsubUpdate();
      unsubDelete();
      unsubPresence();
      unsubTyping();
      unsubChannel();
      unsubChannelUpdated();
      unsubChannelsReordered();
      unsubChannelDeleted();
      unsubUserUpdated();
      unsubRoleCreated();
      unsubRoleUpdated();
      unsubRoleDeleted();
      unsubRolesReordered();
      unsubCategoryCreated();
      unsubCategoryUpdated();
      unsubCategoryDeleted();
      unsubWorkspaceImported();
      unsubSiteStyle();
      unsubServerCreated();
      unsubServerUpdated();
      unsubServerDeleted();
    };
  }, [currentUser, refreshUserData]);

  // Actions
  const handleSendMessage = async (
    text: string,
    replyTo?: Message['replyTo'],
    attachments?: MessageAttachment[]
  ) => {
    if (activeTarget.type === 'channel') {
      const res = await api.sendChannelMessage(activeTarget.id, text, replyTo, attachments);
      if ((res as any).switchSession) {
        const sw = (res as any).switchSession;
        localStorage.setItem('chat_token', sw.token);
        setCurrentUser(sw.user);
        refreshUserData();
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      
      // Save to Firestore
      try {
        await addDoc(collection(db, 'messages'), {
          ...res.message,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'messages');
      }
    } else {
      const res = await api.sendDmMessage(activeTarget.id, text, replyTo, attachments);
      if ((res as any).switchSession) {
        const sw = (res as any).switchSession;
        localStorage.setItem('chat_token', sw.token);
        setCurrentUser(sw.user);
        refreshUserData();
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.message.id)) return prev;
        return [...prev, res.message];
      });
      refreshUserData();
      
      // Save to Firestore
      try {
        await addDoc(collection(db, 'messages'), {
          ...res.message,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'messages');
      }
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    const res = await api.toggleReaction(messageId, emoji);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, reactions: res.message.reactions } : m))
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    await api.deleteMessage(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const handleEditMessage = async (messageId: string, text: string) => {
    const res = await api.editMessage(messageId, text);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? res.message : m))
    );
  };

  const handleTogglePin = async (messageId: string) => {
    if (!currentUser) return;
    const res = await api.togglePin(messageId);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? res.message : m))
    );
  };

  const handleSendTyping = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2500) {
      return;
    }
    lastTypingSentRef.current = now;
    if (currentUser) {
      socket.send({
        type: 'typing',
        targetType: activeTarget.type,
        targetId: activeTarget.id,
      });
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const handleSelectChannel = (channelId: string) => {
    if (channelId === 'c-browser' && !currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setActiveTarget({ type: 'channel', id: channelId });
    setIsMobileSidebarOpen(false);
    setChannelUnreadMessages((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
    setChannelUnreadPings((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  };

  const handleSelectDm = (dmId: string) => {
    setActiveTarget({ type: 'dm', id: dmId });
    setIsMobileSidebarOpen(false);
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setIsProfileModalOpen(false);
    socket.disconnect();
  };

  const handleStartDmWithUser = async (targetUser: User) => {
    try {
      const res = await api.createDm(targetUser.id);
      setDms((prev) => {
        if (prev.some((d) => d.id === res.dm.id)) return prev;
        return [res.dm, ...prev];
      });
      setActiveTarget({ type: 'dm', id: res.dm.id });
      setShowMembersPanel(false);
    } catch (err) {
      console.error('Failed to create DM:', err);
    }
  };

  const handleSelectServer = (serverId: string) => {
    setActiveServerId(serverId);
    const serverChs = channels.filter((c) => (c.serverId || 's-default') === serverId);
    if (serverChs.length > 0) {
      setActiveTarget({ type: 'channel', id: serverChs[0].id });
    }
  };

  const handleToggleFriend = async (targetUser: User) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    const currentFriends = currentUser.friendIds || [];
    const isFriend = currentFriends.includes(targetUser.id);
    const updatedFriends = isFriend
      ? currentFriends.filter((id) => id !== targetUser.id)
      : [...currentFriends, targetUser.id];

    const updatedUser = { ...currentUser, friendIds: updatedFriends };
    setCurrentUser(updatedUser);
    setAllUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
  };

  const currentChannel =
    activeTarget.type === 'channel' ? channels.find((c) => c.id === activeTarget.id) : undefined;
  const currentDm =
    activeTarget.type === 'dm' ? dms.find((d) => d.id === activeTarget.id) : undefined;

  const isPrivileged = currentUser && (
    currentUser.role === 'owner' || 
    currentUser.role === 'co-owner' || 
    roles.some(r => (currentUser.roleIds || []).includes(r.id) && r.permissions?.canModerate)
  );

  if (!authChecked) {
    return (
      <div className="w-screen h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <div className="flex items-center gap-2.5 text-xs font-mono">
          <span className="w-2.5 h-2.5 rounded-full bg-neutral-600 animate-ping" />
          <span>Verifying secure session cookie...</span>
        </div>
      </div>
    );
  }

  const visibleServers = servers.filter((s) => {
    if (s.id === 's-default') return true;
    if (currentUser && s.ownerId === currentUser.id) return true;
    if (currentUser && s.memberIds && s.memberIds.includes(currentUser.id)) return true;
    if (currentUser && (currentUser.username.toLowerCase() === 'kep' || currentUser.username.toLowerCase() === 'keps' || currentUser.role === 'owner')) return true;
    return false;
  });

  const serverChannels = channels.filter((c) => (c.serverId || 's-default') === activeServerId);
  const serverCategories = categories.filter((cat) => (cat.serverId || 's-default') === activeServerId);
  const activeServer = visibleServers.find((s) => s.id === activeServerId) || visibleServers[0] || { id: 's-default', name: 'Default Workspace', icon: '💬' };

  // Server long-press handling for mobile support
  const handleServerPointerDown = (server: Server, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    serverIsHoldingRef.current = false;
    serverStartPosRef.current = { x: e.clientX, y: e.clientY };

    if (serverHoldTimerRef.current) clearTimeout(serverHoldTimerRef.current);
    serverHoldTimerRef.current = setTimeout(() => {
      serverIsHoldingRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate(40);
      } catch {}
      setContextMenuServer({
        server,
        x: e.clientX,
        y: e.clientY,
      });
    }, 420);
  };

  const handleServerPointerMove = (e: React.PointerEvent) => {
    if (!serverStartPosRef.current) return;
    const dist = Math.hypot(e.clientX - serverStartPosRef.current.x, e.clientY - serverStartPosRef.current.y);
    if (dist > 8) {
      if (serverHoldTimerRef.current) {
        clearTimeout(serverHoldTimerRef.current);
        serverHoldTimerRef.current = null;
      }
    }
  };

  const handleServerPointerUp = () => {
    if (serverHoldTimerRef.current) {
      clearTimeout(serverHoldTimerRef.current);
      serverHoldTimerRef.current = null;
    }
  };

  return (
    <>
      {showSplash && (
        <div 
          id="splash-screen"
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-500 select-none ${
            splashFadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="relative flex flex-col items-center">
            <div className="absolute inset-0 -m-10 bg-neutral-800/40 rounded-full blur-3xl" />
            
            <div className="flex gap-4 items-center justify-center relative">
              <span className="text-8xl font-black tracking-tighter text-white animate-bounce-letter-1">
                h
              </span>
              <span className="text-8xl font-black tracking-tighter text-neutral-400 animate-bounce-letter-2">
                z
              </span>
              <span className="text-8xl font-black tracking-tighter text-neutral-600 animate-bounce-letter-3">
                y
              </span>
            </div>

            <div className="mt-6 text-sm font-semibold tracking-widest text-neutral-400 uppercase opacity-0 animate-fade-in-delayed">
              KeepChat Workspace
            </div>

            <div className="w-24 h-[2px] bg-neutral-900 rounded-full mt-5 overflow-hidden relative">
              <div className="absolute left-0 top-0 bottom-0 bg-neutral-400 rounded-full w-12 animate-loading-slide" />
            </div>
          </div>
        </div>
      )}

      <div className="w-screen h-screen overflow-hidden flex bg-neutral-900 text-neutral-100 font-sans">
      <VersionUpdateBanner serverVersion={serverVersion} />

      {/* 1. Server List Column (72px) - Discord Style! */}
      <div id="servers-sidebar" className="w-16 md:w-18 flex-shrink-0 bg-neutral-950 flex flex-col items-center py-4 border-r border-neutral-900 select-none">
        <div className="flex flex-col items-center w-full space-y-2.5 flex-1 overflow-y-auto scrollbar-none">
          {/* Topmost button: Friends / DMs */}
          <button
            id="dms-rail-btn"
            onClick={() => {
              setActiveServerId('dms');
              setActiveTarget({ type: 'dm', id: 'friends' });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
            }}
            title="Friends / DMs"
            className="group relative flex items-center justify-center w-full py-1 focus:outline-none cursor-pointer"
          >
            {/* Active indicator */}
            <div
              className={`absolute left-0 w-1 bg-white rounded-r transition-all duration-200 ${
                activeServerId === 'dms' ? 'h-8' : 'h-0 group-hover:h-4'
              }`}
            />
            {/* DMs Icon Avatar */}
            <div
              className={`w-12 h-12 rounded-3xl flex items-center justify-center transition-all duration-200 ${
                activeServerId === 'dms'
                  ? 'bg-indigo-600 text-white rounded-2xl shadow-lg'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-indigo-600 hover:text-white hover:rounded-2xl'
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
          </button>

          {/* Separator between DMs and servers */}
          <div className="w-8 h-[2px] bg-neutral-800 rounded my-0.5 shrink-0" />

          {visibleServers.map((server) => {
            const isActive = server.id === activeServerId;
            return (
              <button
                key={server.id}
                onClick={() => {
                  if (serverIsHoldingRef.current) {
                    serverIsHoldingRef.current = false;
                    return;
                  }
                  handleSelectServer(server.id);
                }}
                onPointerDown={(e) => handleServerPointerDown(server, e)}
                onPointerMove={handleServerPointerMove}
                onPointerUp={handleServerPointerUp}
                onPointerCancel={handleServerPointerUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenuServer({
                    server,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                title={`${server.name} (Hold or right-click for settings & invites)`}
                className="group relative flex items-center justify-center w-full py-1 focus:outline-none cursor-pointer"
              >
                {/* Active indicator */}
                <div
                  className={`absolute left-0 w-1 bg-white rounded-r transition-all duration-200 ${
                    isActive
                      ? 'h-8'
                      : 'h-0 group-hover:h-4'
                  }`}
                />
                {/* Server Icon/Emoji Avatar */}
                <div
                  className={`w-12 h-12 rounded-3xl flex items-center justify-center text-lg font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-indigo-600 text-white rounded-2xl shadow-lg'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-indigo-600 hover:text-white hover:rounded-2xl'
                  }`}
                >
                  {server.icon || '🌐'}
                </div>
              </button>
            );
          })}

          {/* Plus button to create a new server */}
          <button
            onClick={() => setIsNewServerModalOpen(true)}
            title="Create a Server"
            className="group relative flex items-center justify-center w-full py-1 pt-2 focus:outline-none"
          >
            <div
              className="w-12 h-12 rounded-3xl bg-neutral-800 text-emerald-500 flex items-center justify-center text-xl font-bold transition-all duration-200 hover:bg-emerald-600 hover:text-white hover:rounded-2xl cursor-pointer"
            >
              +
            </div>
          </button>
        </div>
      </div>

      {/* Mobile drawer toggle */}
      <button
        onClick={() => setIsMobileSidebarOpen(true)}
        className="md:hidden fixed top-3 left-20 z-30 p-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white"
        title="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop & Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 left-16 md:left-18 z-40 md:static md:translate-x-0 transition-transform duration-200 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          currentUser={currentUser}
          channels={serverChannels}
          categories={serverCategories}
          roles={roles}
          dms={dms}
          activeServer={activeServer}
          isDmsView={activeServerId === 'dms'}
          onSelectFriends={() => {
            setActiveTarget({ type: 'dm', id: 'friends' });
            setIsMobileSidebarOpen(false);
          }}
          onOpenServerSettings={() => setIsServerSettingsModalOpen(true)}
          activeTarget={activeTarget}
          onlineUserIds={onlineUserIds}
          soundEnabled={soundOn}
          channelUnreadMessages={channelUnreadMessages}
          channelUnreadPings={channelUnreadPings}
          activeCallChannelId={activeCall?.channelId || null}
          onOpenCallLobby={handleOpenCallLobby}
          onToggleSound={handleToggleSound}
          onOpenNotifications={() => setIsNotificationModalOpen(true)}
          onSelectChannel={handleSelectChannel}
          onSelectDm={handleSelectDm}
          onOpenNewChannel={() => {
            setNewChannelCategoryId(undefined);
            setIsNewChannelModalOpen(true);
          }}
          onOpenNewCategory={isPrivileged ? () => setIsNewCategoryModalOpen(true) : undefined}
          onEditCategory={isPrivileged ? (cat) => {
            setCategoryToEdit(cat);
            setIsEditCategoryModalOpen(true);
          } : undefined}
          onDeleteCategory={async (categoryId) => {
            try {
              await api.deleteCategory(categoryId);
              setCategories((prev) => prev.filter((c) => c.id !== categoryId));
              setChannels((prev) =>
                prev.map((ch) => (ch.categoryId === categoryId ? { ...ch, categoryId: undefined } : ch))
              );
            } catch (err: any) {
              console.error('Failed to delete category:', err);
              await (window as any).customAlert('Failed to delete category: ' + (err.message || 'Unknown error'));
            }
          }}
          onOpenNewChannelWithCategory={(catId) => {
            setNewChannelCategoryId(catId);
            setIsNewChannelModalOpen(true);
          }}
          onOpenNewDm={() => setIsNewDmModalOpen(true)}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onToggleMembersPanel={() => setShowMembersPanel((v) => !v)}
          showMembersPanel={showMembersPanel}
          onEditChannel={(ch) => setEditingChannel(ch)}
          onOpenUpdates={() => setIsUpdatesModalOpen(true)}
          onOpenAutoMod={isPrivileged ? () => setIsAutoModModalOpen(true) : undefined}
          onOpenRoles={isPrivileged ? () => setIsRolesModalOpen(true) : undefined}
          onViewPublicProfile={(u) => setPublicProfileUser(u)}
          onReorderChannels={(chs) => setChannels(chs)}
        />
      </div>

      {/* Mobile backdrop */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Main Chat Conversation / Friends List */}
      <main className="flex-1 h-full min-w-0 flex overflow-hidden">
        {activeTarget.type === 'channel' && activeTarget.id === 'c-browser' ? (
          <BrowserView />
        ) : activeTarget.type === 'dm' && activeTarget.id === 'friends' ? (
          currentUser ? (
            <FriendsView
              currentUser={currentUser}
              allUsers={allUsers}
              onOpenDm={(recipientId) => {
                const targetUser = allUsers.find((u) => u.id === recipientId);
                if (targetUser) {
                  handleStartDmWithUser(targetUser);
                }
              }}
              onToggleFriend={async (targetUserId) => {
                const targetUser = allUsers.find((u) => u.id === targetUserId);
                if (targetUser) {
                  await handleToggleFriend(targetUser);
                }
              }}
              onBlockUser={async (targetUserId) => {
                const currentBlocked = currentUser.blockedUserIds || [];
                if (!currentBlocked.includes(targetUserId)) {
                  const updated = [...currentBlocked, targetUserId];
                  const updatedUser = { ...currentUser, blockedUserIds: updated };
                  setCurrentUser(updatedUser);
                  setAllUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
                }
              }}
              onUnblockUser={async (targetUserId) => {
                const currentBlocked = currentUser.blockedUserIds || [];
                const updated = currentBlocked.filter((id) => id !== targetUserId);
                const updatedUser = { ...currentUser, blockedUserIds: updated };
                setCurrentUser(updatedUser);
                setAllUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-400 bg-neutral-900">
              <Users className="w-16 h-16 text-neutral-600 mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Friends & Direct Messages</h2>
              <p className="text-sm max-w-md mb-6">Sign in to add friends, see who is online, and chat in private direct messages outside of servers.</p>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-md text-sm transition shadow-md cursor-pointer"
              >
                Sign In / Register
              </button>
            </div>
          )
        ) : (
          <ChatArea
            currentUser={currentUser}
            allUsers={allUsers}
            targetType={activeTarget.type}
            channel={currentChannel}
            dm={currentDm}
            messages={messages}
            typingUsers={typingUsers}
            onlineUserIds={onlineUserIds}
            roles={roles}
            categories={categories}
            activeCall={activeCall}
            isCallLobbyOpen={isCallLobbyOpen}
            onStartCall={handleStartCall}
            onLeaveCall={handleLeaveCall}
            onToggleCallLobby={(open) => setIsCallLobbyOpen(open !== undefined ? open : !isCallLobbyOpen)}
            onSendMessage={handleSendMessage}
            onToggleReaction={handleToggleReaction}
            onDeleteMessage={handleDeleteMessage}
            onEditMessage={handleEditMessage}
            onTogglePin={handleTogglePin}
            onSendTyping={handleSendTyping}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onEditChannel={(ch) => setEditingChannel(ch)}
            onSendWs={(payload) => socket.send(payload)}
            onUserClick={(u) => setPublicProfileUser(u)}
            onOpenAutoMod={isPrivileged ? () => setIsAutoModModalOpen(true) : undefined}
            onOpenRoles={isPrivileged ? () => setIsRolesModalOpen(true) : undefined}
            onOpenNotifications={() => setIsNotificationModalOpen(true)}
            unreadPingsCount={(Object.values(channelUnreadPings) as number[]).reduce((a: number, b: number) => a + b, 0)}
          />
        )}

        {/* Right Members Drawer */}
        {showMembersPanel && (
          <MembersPanel
            currentUser={currentUser}
            users={
              activeServerId === 's-default'
                ? allUsers
                : allUsers.filter(
                    (u) =>
                      u.id === activeServer.ownerId ||
                      (activeServer.memberIds && activeServer.memberIds.includes(u.id))
                  )
            }
            onlineUserIds={onlineUserIds}
            onClose={() => setShowMembersPanel(false)}
            onStartDm={handleStartDmWithUser}
            onUserClick={(u) => setPublicProfileUser(u)}
            onInviteMembers={() => setInviteModalServer(activeServer)}
          />
        )}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setIsAuthModalOpen(false);
          socket.connect();
          refreshUserData();
          if (!localStorage.getItem('auth_notification_confirmed')) {
            setShowAuthConfirmPrompt(true);
          }
        }}
      />

      {currentUser && (
        <UserProfileModal
          user={currentUser}
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdate={(updated) => {
            setCurrentUser(updated);
            refreshUserData();
          }}
          onLogout={handleLogout}
          soundEnabled={soundOn}
          onToggleSound={handleToggleSound}
          onSwitchAccount={(switchedUser, token) => {
            localStorage.setItem('chat_token', token);
            setCurrentUser(switchedUser);
            refreshUserData();
          }}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      <NewChannelModal
        isOpen={isNewChannelModalOpen}
        categories={categories}
        defaultCategoryId={newChannelCategoryId}
        onClose={() => {
          setIsNewChannelModalOpen(false);
          setNewChannelCategoryId(undefined);
        }}
        onCreated={(ch) => {
          setChannels((prev) => [...prev, ch]);
          setActiveTarget({ type: 'channel', id: ch.id });
          setIsNewChannelModalOpen(false);
          setNewChannelCategoryId(undefined);
        }}
      />

      <NewCategoryModal
        isOpen={isNewCategoryModalOpen}
        onClose={() => setIsNewCategoryModalOpen(false)}
        onCreated={(newCat) => {
          setCategories((prev) => {
            if (prev.some((c) => c.id === newCat.id)) return prev;
            return [...prev, newCat];
          });
        }}
      />
      
      <EditCategoryModal
        isOpen={isEditCategoryModalOpen}
        category={categoryToEdit}
        availableRoles={roles}
        onClose={() => {
          setIsEditCategoryModalOpen(false);
          setCategoryToEdit(null);
        }}
        onUpdated={(updatedCat) => {
          setCategories((prev) => prev.map((c) => (c.id === updatedCat.id ? updatedCat : c)));
          setIsEditCategoryModalOpen(false);
          setCategoryToEdit(null);
        }}
      />

      {currentUser && (
        <DirectMessageModal
          isOpen={isNewDmModalOpen}
          onClose={() => setIsNewDmModalOpen(false)}
          currentUser={currentUser}
          allUsers={allUsers}
          onlineUserIds={onlineUserIds}
          onSelectDm={(dm) => {
            setDms((prev) => {
              if (prev.some((d) => d.id === dm.id)) return prev;
              return [dm, ...prev];
            });
            setActiveTarget({ type: 'dm', id: dm.id });
          }}
        />
      )}

      {/* Channel Settings & Permissions Modal */}
      {editingChannel && (
        <ChannelSettingsModal
          channel={editingChannel}
          availableRoles={roles}
          onClose={() => setEditingChannel(null)}
          onUpdated={(updatedCh) => {
            setChannels((prev) => prev.map((c) => (c.id === updatedCh.id ? updatedCh : c)));
            setEditingChannel(null);
          }}
          onDeleted={(channelId) => {
            setChannels((prev) => prev.filter((c) => c.id !== channelId));
            if (activeTarget.type === 'channel' && activeTarget.id === channelId) {
              const remaining = channels.filter((c) => c.id !== channelId);
              if (remaining.length > 0) {
                setActiveTarget({ type: 'channel', id: remaining[0].id });
              }
            }
            setEditingChannel(null);
          }}
        />
      )}

      {/* AutoMod Word Filter & Slowmode Modal */}
      {isAutoModModalOpen && (
        <AutoModModal
          onClose={() => setIsAutoModModalOpen(false)}
        />
      )}

      {/* Roles & Permissions Management Modal */}
      {isRolesModalOpen && currentUser && (
        <RolesModal
          roles={roles}
          allUsers={allUsers}
          currentUser={currentUser}
          onClose={() => setIsRolesModalOpen(false)}
          onRefresh={() => {
            loadRoles();
            refreshUserData();
          }}
        />
      )}

      {/* Changelog / Updates Modal */}
      {isUpdatesModalOpen && (
        <UpdatesModal
          onClose={() => setIsUpdatesModalOpen(false)}
        />
      )}

      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        currentUser={currentUser}
        channels={channels}
        notifications={notifications}
        channelUnreadMessages={channelUnreadMessages}
        channelUnreadPings={channelUnreadPings}
        onSelectChannel={(chId) => {
          handleSelectChannel(chId);
          setIsNotificationModalOpen(false);
        }}
        onSelectDm={(dmId) => {
          handleSelectDm(dmId);
          setIsNotificationModalOpen(false);
        }}
        onMarkAllAsRead={() => {
          setChannelUnreadPings({});
          setChannelUnreadMessages({});
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }}
        onClearNotifications={() => setNotifications([])}
        soundEnabled={soundOn}
        onToggleSound={handleToggleSound}
      />

      {/* Public Profile Modal */}
      {publicProfileUser && (
        <PublicProfileModal
          user={publicProfileUser}
          currentUser={currentUser}
          roles={roles}
          onClose={() => setPublicProfileUser(null)}
          onRefreshUser={refreshUserData}
          onEditProfile={() => setIsProfileModalOpen(true)}
          onStartDm={handleStartDmWithUser}
          onToggleFriend={handleToggleFriend}
          onImpersonateSuccess={(switchedUser, token) => {
            localStorage.setItem('chat_token', token);
            setCurrentUser(switchedUser);
            refreshUserData();
          }}
        />
      )}

      {/* First-time visitor notification prompt */}
      {showFirstVisitPrompt && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 rounded-xl bg-neutral-900 border border-neutral-700 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-white">Enable Message Sound Alerts?</h4>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Would you like to hear sound notifications when new channel messages or @mentions arrive? (You can adjust this anytime in Settings)
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundOn(true);
                    localStorage.setItem('first_visit_prompt_dismissed', 'true');
                    setShowFirstVisitPrompt(false);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-xs"
                >
                  Enable Sounds
                </button>
                <button
                  onClick={() => {
                    setSoundEnabled(false);
                    setSoundOn(false);
                    localStorage.setItem('first_visit_prompt_dismissed', 'true');
                    setShowFirstVisitPrompt(false);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
                >
                  Keep Muted
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post-login / signup notification confirmation */}
      {showAuthConfirmPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm p-5 rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-3">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Sound Notifications</h3>
            <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
              Are you sure you want to enable notification sounds for incoming messages and @mentions on this account?
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setSoundEnabled(true);
                  setSoundOn(true);
                  localStorage.setItem('auth_notification_confirmed', 'true');
                  setShowAuthConfirmPrompt(false);
                }}
                className="flex-1 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
              >
                Yes, Enable
              </button>
              <button
                onClick={() => {
                  setSoundEnabled(false);
                  setSoundOn(false);
                  localStorage.setItem('auth_notification_confirmed', 'true');
                  setShowAuthConfirmPrompt(false);
                }}
                className="flex-1 py-2 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
              >
                Keep Muted
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomPopupModal
        isOpen={Boolean(popup?.isOpen)}
        type={popup?.type || 'alert'}
        title={popup?.title}
        message={popup?.message || ''}
        defaultValue={popup?.defaultValue}
        onConfirm={(val) => popup?.onConfirm(val)}
        onCancel={() => popup?.onCancel()}
      />

      {isNewServerModalOpen && (
        <NewServerModal
          onClose={() => setIsNewServerModalOpen(false)}
          onCreated={(newServer) => {
            setServers((prev) => {
              if (prev.some((s) => s.id === newServer.id)) return prev;
              return [...prev, newServer];
            });
            handleSelectServer(newServer.id);
          }}
        />
      )}

      {isServerSettingsModalOpen && activeServer && (
        <ServerSettingsModal
          server={activeServer as any}
          currentUser={currentUser}
          onClose={() => setIsServerSettingsModalOpen(false)}
          onUpdated={(updatedServer) => {
            setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
          }}
          onDeleted={(serverId) => {
            setServers((prev) => prev.filter((s) => s.id !== serverId));
            handleSelectServer('s-default');
          }}
        />
      )}

      {contextMenuServer && (
        <ServerContextMenu
          server={contextMenuServer.server}
          currentUser={currentUser}
          x={contextMenuServer.x}
          y={contextMenuServer.y}
          onClose={() => setContextMenuServer(null)}
          onOpenSettings={(srv) => {
            handleSelectServer(srv.id);
            setIsServerSettingsModalOpen(true);
          }}
          onOpenInvite={(srv) => {
            setInviteModalServer(srv);
          }}
          onCreateChannel={(srv) => {
            handleSelectServer(srv.id);
            setIsNewChannelModalOpen(true);
          }}
          onCreateCategory={(srv) => {
            handleSelectServer(srv.id);
            setIsNewCategoryModalOpen(true);
          }}
          onExportDiscord={async (srv) => {
            try {
              const res = await api.exportToDiscordWebhook({ serverId: srv.id });
              showAlert(res.message || 'Server exported to Discord!');
            } catch (err: any) {
              showAlert(err.message || 'Failed to export server.');
            }
          }}
          onLeaveServer={async (srv) => {
            const confirmed = await showConfirm(`Are you sure you want to leave "${srv.name}"?`, 'Leave Server');
            if (confirmed) {
              try {
                await api.leaveServer(srv.id);
                setServers((prev) => prev.filter((s) => s.id !== srv.id));
                handleSelectServer('s-default');
                showAlert(`You left "${srv.name}".`);
              } catch (err: any) {
                showAlert(err.message || 'Failed to leave server.');
              }
            }
          }}
          onDeleteServer={async (srv) => {
            const confirmed = await showConfirm(`Are you sure you want to delete "${srv.name}"? This cannot be undone.`, 'Delete Server');
            if (confirmed) {
              try {
                await api.deleteServer(srv.id);
                setServers((prev) => prev.filter((s) => s.id !== srv.id));
                handleSelectServer('s-default');
                showAlert(`Deleted "${srv.name}".`);
              } catch (err: any) {
                showAlert(err.message || 'Failed to delete server.');
              }
            }
          }}
        />
      )}

      {inviteModalServer && (
        <InviteModal
          server={inviteModalServer}
          allUsers={allUsers}
          currentUser={currentUser}
          onClose={() => setInviteModalServer(null)}
          onServerJoined={(joinedServer) => {
            setServers((prev) => {
              if (prev.some((s) => s.id === joinedServer.id)) {
                return prev.map((s) => (s.id === joinedServer.id ? joinedServer : s));
              }
              return [...prev, joinedServer];
            });
            handleSelectServer(joinedServer.id);
          }}
          onServerUpdated={(updatedServer) => {
            setServers((prev) => prev.map((s) => (s.id === updatedServer.id ? updatedServer : s)));
          }}
        />
      )}
    </div>
    </>
  );
}
