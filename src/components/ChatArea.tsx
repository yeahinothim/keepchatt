import React, { useState, useRef, useEffect } from 'react';
import {
  Hash,
  Send,
  Smile,
  Reply,
  Trash2,
  Pencil,
  X,
  Search,
  ArrowDown,
  Lock,
  CornerDownRight,
  Pin,
  Plus,
  Paperclip,
  Gamepad2,
  BellRing,
  Sparkles,
  Settings,
  HelpCircle,
  FileText,
  Clock,
  ChevronRight,
  Loader2,
  Film,
  Phone,
  Video,
  Radio,
  Star,
  Bell,
  AtSign,
  Music,
} from 'lucide-react';
import type {
  Message,
  User,
  Channel,
  DirectMessageConversation,
  MessageAttachment,
  Role,
  ChannelCategory,
} from '../types.ts';
import { getHighestRole } from '../types.ts';
import { playMessageSent } from '../lib/audio.ts';
import { VoiceRoom } from './VoiceRoom.tsx';
import { GifPicker } from './GifPicker.tsx';
import { EmojiPicker } from './EmojiPicker.tsx';
import { LinkPreview, extractUrlsFromText } from './LinkPreview.tsx';
import { CodeAndGameRunner } from './CodeAndGameRunner.tsx';
import { api } from '../lib/api.ts';
import { socket } from '../lib/socket.ts';

interface ChatAreaProps {
  currentUser: User | null;
  allUsers: User[];
  targetType: 'channel' | 'dm';
  channel?: Channel;
  dm?: DirectMessageConversation;
  messages: Message[];
  typingUsers: string[];
  onlineUserIds: Set<string>;
  roles?: Role[];
  categories?: ChannelCategory[];
  onSendMessage: (
    text: string,
    replyTo?: Message['replyTo'],
    attachments?: MessageAttachment[]
  ) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, text: string) => Promise<void>;
  onTogglePin: (messageId: string) => Promise<void>;
  onSendTyping: () => void;
  onOpenAuth: () => void;
  onEditChannel?: (channel: Channel) => void;
  onSendWs?: (payload: any) => void;
  onOpenAutoMod?: () => void;
  onOpenRoles?: () => void;
  onUserClick?: (user: User) => void;
  activeCall?: { channelId: string; initialCallType: 'audio' | 'video'; isInitiator: boolean } | null;
  onStartCall?: (channelId: string, type: 'audio' | 'video', isInitiator?: boolean) => void;
  onLeaveCall?: () => void;
  isCallLobbyOpen?: boolean;
  onToggleCallLobby?: (open?: boolean) => void;
  onOpenNotifications?: () => void;
  unreadPingsCount?: number;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '🚀', '💯', '☕', '💡'];

const SLASH_COMMANDS = [
  { cmd: '/ai [prompt]', label: '/ai', desc: 'Ask Groq AI to code, build HTML/JS games, or help' },
  { cmd: '/ai on', label: '/ai on', desc: 'Enable AI Assistant in this channel' },
  { cmd: '/ai off', label: '/ai off', desc: 'Disable AI Assistant in this channel' },
  { cmd: '/aipersistentmemory [on/off/clear]', label: '/aipersistentmemory', desc: 'Toggle or clear global AI memory' },
  { cmd: '/aichannelmemory [on/off/clear]', label: '/aichannelmemory', desc: 'Toggle or clear channel context memory' },
  { cmd: '/aireset', label: '/aireset', desc: 'Reset / clear AI Assistant conversation memory' },
  { cmd: '/export', label: '/export', desc: 'Export full server chat history & channels backup (JSON)' },
  { cmd: '/import [paste json or url]', label: '/import', desc: 'Import server channels & chat history backup' },
  { cmd: '/mute @user for 10m why: spamming', label: '/mute', desc: 'Mute a user for a duration with optional why:' },
  { cmd: '/unmute @user why: appeal accepted', label: '/unmute', desc: 'Unmute a user' },
  { cmd: '/warn @user why: please follow rules', label: '/warn', desc: 'Issue an official warning to a user' },
  { cmd: '/kick @user why: disruptive', label: '/kick', desc: 'Kick user from server' },
  { cmd: '/ban @user duration: 7d why: griefing', label: '/ban', desc: 'Ban user from server' },
  { cmd: '/unban @user', label: '/unban', desc: 'Revoke ban from user' },
  { cmd: '/ipban @user duration: 1d why: severe abuse', label: '/ipban', desc: 'Ban user IP address' },
  { cmd: '/clear 20', label: '/clear', desc: 'Bulk delete the last N messages (privileged)' },
  { cmd: '/slowmode 5s', label: '/slowmode', desc: 'Set channel slowmode cooldown (e.g. 5s, 30s, 0s)' },
  { cmd: '/nick NewNickname', label: '/nick', desc: 'Change your server display name' },
  { cmd: '/roll 1d20', label: '/roll', desc: 'Roll dice (e.g. 1d6, 2d20)' },
  { cmd: '/flip', label: '/flip', desc: 'Flip a coin (Heads or Tails)' },
  { cmd: '/shrug', label: '/shrug', desc: 'Append ¯\\_(ツ)_/¯' },
  { cmd: '/help', label: '/help', desc: 'Show all available slash commands and guidelines' },
  { cmd: '/vcmute @user duration: 15m why: loud mic', label: '/vcmute', desc: 'Mute user in voice channels' },
  { cmd: '/vcunmute @user why: voice restored', label: '/vcunmute', desc: 'Unmute user in voice channels' },
  { cmd: '/createrole @Moderator colour: #3b82f6', label: '/createrole', desc: 'Create a new role with color' },
  { cmd: '/newrole @VIP colour: #eab308', label: '/newrole', desc: 'Alias to create a role' },
  { cmd: '/renamerole @oldrole @newrole', label: '/renamerole', desc: 'Rename a server role' },
  { cmd: '/deleterole @role', label: '/deleterole', desc: 'Delete an existing role' },
  { cmd: '/give @user @role why: trusted member', label: '/give', desc: 'Assign a role to user' },
  { cmd: '/remove @user @role why: demoted', label: '/remove', desc: 'Remove a role from user' },
  { cmd: '/login @user', label: '/login', desc: "Test mode: Switch / login to user's account (kep client only)" },
  { cmd: '/automod', label: '/automod', desc: 'Open AutoMod word filter & slowmode panel' },
  { cmd: '/pingmod why: urgent help needed', label: '/pingmod', desc: 'Alert all moderators to #reports' },
  { cmd: '/cmds', label: '/cmds', desc: 'List moderator and administrator commands (Privileged only)' },
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentUser,
  allUsers,
  targetType,
  channel,
  dm,
  messages,
  typingUsers,
  onlineUserIds,
  roles = [],
  categories = [],
  onSendMessage,
  onToggleReaction,
  onDeleteMessage,
  onEditMessage,
  onTogglePin,
  onSendTyping,
  onOpenAuth,
  onEditChannel,
  onSendWs,
  onOpenAutoMod,
  onUserClick,
  onOpenRoles,
  activeCall,
  onStartCall,
  onLeaveCall,
  isCallLobbyOpen,
  onToggleCallLobby,
  onOpenMusicPlayer,
}) => {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showPinsPanel, setShowPinsPanel] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showPingModModal, setShowPingModModal] = useState(false);
  const [pingModReason, setPingModReason] = useState('');
  const [pingingMod, setPingingMod] = useState(false);
  const [stagedAttachments, setStagedAttachments] = useState<MessageAttachment[]>([]);
  const messageTouchRef = React.useRef<{ timer: NodeJS.Timeout | null; startX: number; startY: number }>({
    timer: null,
    startX: 0,
    startY: 0,
  });
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [activeReactionMenuMsgId, setActiveReactionMenuMsgId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [favoritedUrls, setFavoritedUrls] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('chat_favorite_gifs');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) return new Set(arr.map((f: any) => f.url));
      }
    } catch {}
    return new Set();
  });

  const syncFavorites = () => {
    try {
      const saved = localStorage.getItem('chat_favorite_gifs');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          setFavoritedUrls(new Set(arr.map((f: any) => f.url)));
          return;
        }
      }
      setFavoritedUrls(new Set());
    } catch {}
  };

  useEffect(() => {
    syncFavorites();
    const handleUpdate = () => syncFavorites();
    window.addEventListener('favorites-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('favorites-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const toggleFavoriteAttachment = (att: MessageAttachment, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const saved = localStorage.getItem('chat_favorite_gifs');
      let arr: any[] = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(arr)) arr = [];
      const exists = arr.some((f) => f.url === att.url);
      if (exists) {
        arr = arr.filter((f) => f.url !== att.url);
      } else {
        let attType = att.type;
        if (!attType) {
          if (att.url?.match(/\.(gif|jpg|jpeg|png|webp|svg)(\?|$)/i)) attType = 'image';
          else if (att.url?.match(/\.(mp4|webm|mov)(\?|$)/i)) attType = 'video';
          else if (att.url?.match(/\.(mp3|wav|ogg|m4a)(\?|$)/i)) attType = 'audio';
          else attType = 'file';
        }
        arr.push({
          id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url: att.url,
          title: att.name || 'Saved Media',
          type: attType,
          size: att.size,
        });
      }
      localStorage.setItem('chat_favorite_gifs', JSON.stringify(arr));
      setFavoritedUrls(new Set(arr.map((f) => f.url)));
      window.dispatchEvent(new CustomEvent('favorites-updated'));
    } catch (err) {
      console.warn('Error saving favorite:', err);
    }
  };

  const isFavorited = (url: string) => favoritedUrls.has(url);

  const [activeChannelCall, setActiveChannelCall] = useState<{
    participants: string[];
    count: number;
    callType?: string;
  } | null>(null);

  // Reset channel call room status when channel changes
  useEffect(() => {
    setActiveChannelCall(null);
  }, [channel?.id, dm?.id]);

  // Listen to channel call room status
  useEffect(() => {
    const currentChId = channel?.id;
    if (!currentChId) return;

    const unsub = socket.on('vc:room-status', (data: { channelId: string; participants: string[]; count: number; callType?: string }) => {
      if (data.channelId === currentChId) {
        if (data.count > 0) {
          setActiveChannelCall(data);
        } else {
          setActiveChannelCall(null);
        }
      }
    });

    return () => {
      unsub();
    };
  }, [channel?.id]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingThrottleRef = useRef<number>(0);

  const emojiPickerContainerRef = useRef<HTMLDivElement>(null);
  const gifPickerContainerRef = useRef<HTMLDivElement>(null);

  // Click outside handlers for Emoji & GIF Pickers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check Emoji Picker
      if (
        emojiPickerContainerRef.current &&
        !emojiPickerContainerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
      // Check GIF Picker
      if (
        gifPickerContainerRef.current &&
        !gifPickerContainerRef.current.contains(event.target as Node)
      ) {
        // Also check if the click target is the GIF toggle button to prevent double toggling
        const toggleBtn = document.getElementById('gif-picker-toggle-btn');
        if (!toggleBtn || !toggleBtn.contains(event.target as Node)) {
          setShowGifPicker(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto scroll to bottom on new message if user was already at bottom
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  // Handle scroll detection
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
  };

  useEffect(() => {
    if (editingMessageId && editInputRef.current) {
      editInputRef.current.focus();
      const len = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [editingMessageId]);

  const handleStartEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.text);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (messageId: string) => {
    const trimmed = editingText.trim();
    if (!trimmed) {
      await (window as any).customAlert?.('Message cannot be empty.');
      return;
    }
    setIsSavingEdit(true);
    try {
      if (onEditMessage) {
        await onEditMessage(messageId, trimmed);
      } else {
        await api.editMessage(messageId, trimmed);
      }
      setEditingMessageId(null);
      setEditingText('');
    } catch (err: any) {
      console.error('Failed to edit message:', err);
      await (window as any).customAlert?.('Failed to save edit: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Tab' || e.key === 'Enter') && !e.shiftKey) {
      if (atMentionQuery !== null && filteredMentionUsers.length > 0) {
        e.preventDefault();
        handleSelectMentionUser(filteredMentionUsers[0].username);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === 'ArrowUp' && !inputText && !replyingTo && currentUser) {
      const myLastMsg = [...messages].reverse().find((m) => m.senderId === currentUser.id && m.text);
      if (myLastMsg) {
        e.preventDefault();
        handleStartEditing(myLastMsg);
        return;
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const now = Date.now();
    if (now - lastTypingThrottleRef.current > 2500) {
      lastTypingThrottleRef.current = now;
      onSendTyping();
    }
  };

  const handleSend = () => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const text = inputText.trim();
    if (!text && stagedAttachments.length === 0) return;

    // Check if user entered /automod
    if (text === '/automod' && onOpenAutoMod) {
      setInputText('');
      onOpenAutoMod();
      return;
    }

    const currentAttachments = [...stagedAttachments];
    const currentReply = replyingTo;
    
    // Clear instantly for smooth, zero-latency typing and sending
    setInputText('');
    setStagedAttachments([]);
    setReplyingTo(null);
    playMessageSent();

    const replySnippet = currentReply
      ? {
          id: currentReply.id,
          senderName: currentReply.senderName,
          text: currentReply.text.length > 80 ? `${currentReply.text.slice(0, 80)}...` : currentReply.text,
        }
      : undefined;

    onSendMessage(
      text,
      replySnippet,
      currentAttachments.length > 0 ? currentAttachments : undefined
    ).catch((err) => {
      console.error('Failed to send message:', err);
    });

    scrollToBottom();
  };

  const insertEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleSelectGif = (attachment: MessageAttachment) => {
    setShowGifPicker(false);
    playMessageSent();
    onSendMessage('', undefined, [attachment]);
    scrollToBottom();
  };

  const processAndUploadFile = async (file: File) => {
    setIsUploadingFile(true);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setUploadProgressText(`Uploading ${file.name} (${sizeMb} MB)...`);
    try {
      let rawText: string | undefined = undefined;
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
      const isText = isJson || file.name.toLowerCase().endsWith('.txt') || file.type.startsWith('text/');
      if (isText && file.size < 50 * 1024 * 1024) {
        try {
          rawText = await file.text();
        } catch (e) {
          console.warn('Could not read file text:', e);
        }
      }

      const res = await api.uploadFile(file);
      const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/i.test(file.name);
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|ogv)$/i.test(file.name);
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name);

      let type: MessageAttachment['type'] = 'file';
      if (isGif) type = 'gif';
      else if (isImage) type = 'image';
      else if (isVideo) type = 'video';
      else if (isAudio) type = 'audio';

      const newAttachment: MessageAttachment = {
        type,
        url: res.url,
        name: res.name || file.name,
        size: res.size || file.size,
        rawText,
      };
      setStagedAttachments((prev) => [...prev, newAttachment]);

      // If it's a JSON file, automatically set /import in the text box if empty
      if (isJson && !inputText.trim()) {
        setInputText('/import');
      }
    } catch (err: any) {
      await (window as any).customAlert('File upload failed: ' + (err.message || 'Error occurred during streaming upload.'));
    } finally {
      setIsUploadingFile(false);
      setUploadProgressText('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (file) processAndUploadFile(file);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processAndUploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowPlusMenu(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      files.forEach((f) => processAndUploadFile(f));
    }
  };

  const handlePingModSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPingingMod(true);
    try {
      await api.pingMod(pingModReason.trim() || 'Assistance requested', channel?.name || 'General');
      setShowPingModModal(false);
      setPingModReason('');
      await (window as any).customAlert('Moderators have been pinged. A priority notification was logged to #reports.');
    } catch (err: any) {
      await (window as any).customAlert('Failed to ping moderators: ' + err.message);
    } finally {
      setPingingMod(false);
    }
  };

  // Determine conversation details
  let title = '';
  let subtitle = '';
  let targetUser: User | null = null;

  const handleUserClick = (
    senderId?: string,
    senderUsername?: string,
    senderName?: string,
    avatarColor?: string,
    avatarUrl?: string
  ) => {
    if (!senderId && !senderUsername) return;
    const foundUser =
      allUsers.find(
        (u) => (senderId && u.id === senderId) || (senderUsername && u.username === senderUsername)
      ) || (currentUser && (currentUser.id === senderId || currentUser.username === senderUsername) ? currentUser : null);

    const targetUserObj: User = foundUser || {
      id: senderId || `user-${Date.now()}`,
      username: senderUsername || (senderName || 'user').toLowerCase().replace(/\s+/g, '_'),
      displayName: senderName || senderUsername || 'User',
      avatarColor: avatarColor || '#3b82f6',
      avatarUrl: avatarUrl,
      status: 'online',
      createdAt: Date.now(),
    };
    onUserClick?.(targetUserObj);
  };

  if (targetType === 'channel' && channel) {
    title = `#${channel.name}`;
    subtitle = channel.topic || channel.description || 'Welcome to this channel';
  } else if (targetType === 'dm' && dm && currentUser) {
    targetUser = dm.user1Id === currentUser.id ? dm.user2 : dm.user1;
    title = targetUser.displayName || targetUser.username;
    subtitle = targetUser.statusText || `@${targetUser.username}`;
  }

  // Filter messages by search if active
  const displayedMessages = searchQuery.trim()
    ? messages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // Filter slash commands matching input (when typing / command)
  const isPrivilegedForCmds = Boolean(
    currentUser &&
      (currentUser.role === 'owner' ||
        currentUser.role === 'co-owner' ||
        currentUser.username?.toLowerCase() === 'kep' ||
        currentUser.username?.toLowerCase() === 'keps' ||
        currentUser.roleIds?.some((rid) => {
          const r = roles.find((role) => role.id === rid);
          return r?.permissions?.canModerate || r?.permissions?.canEditChannels;
        }))
  );

  const isSlashActive = inputText.startsWith('/') && !inputText.includes(' ');
  const filteredCommands = isSlashActive
    ? SLASH_COMMANDS.filter(
        (c) => {
          if (c.label === '/cmds' && !isPrivilegedForCmds) {
            return false;
          }
          return (
            c.cmd.toLowerCase().startsWith(inputText.toLowerCase()) ||
            c.label.toLowerCase().startsWith(inputText.toLowerCase())
          );
        }
      )
    : [];

  // Determine active @mention query for autocomplete above chat area
  const activeAtMentionIndex = inputText.lastIndexOf('@');
  let atMentionQuery: string | null = null;
  if (activeAtMentionIndex !== -1) {
    const textAfterAt = inputText.slice(activeAtMentionIndex + 1);
    // Mention autocomplete is active ONLY if there is no space after @
    if (!textAfterAt.includes(' ')) {
      atMentionQuery = textAfterAt.toLowerCase();
    }
  }

  // Filter real registered users for @mention autocomplete
  const filteredMentionUsers = React.useMemo(() => {
    if (atMentionQuery === null) return [];
    return allUsers
      .filter((u) => {
        const un = u.username.toLowerCase();
        const dn = (u.displayName || '').toLowerCase();
        return un.includes(atMentionQuery!) || dn.includes(atMentionQuery!);
      })
      .slice(0, 8);
  }, [atMentionQuery, allUsers]);

  const handleSelectMentionUser = (username: string) => {
    if (activeAtMentionIndex === -1) return;
    const beforeAt = inputText.slice(0, activeAtMentionIndex);
    const updatedText = `${beforeAt}@${username} `;
    setInputText(updatedText);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Check if current user can edit channel
  const canEditCurrentChannel = Boolean(
    currentUser &&
      (currentUser.role === 'owner' ||
        currentUser.role === 'co-owner' ||
        currentUser.username.toLowerCase() === 'kep' ||
        currentUser.username.toLowerCase() === 'oliverg' ||
        currentUser.roleIds?.some((rid) => {
          const r = roles.find((role) => role.id === rid);
          return r?.permissions?.canEditChannels;
        }) ||
        (() => {
          const allowed = channel?.permissions?.canManageChannel;
          if (!allowed) return false;
          if (allowed.includes('*')) return true;
          return (currentUser.roleIds || []).some((rid) => allowed.includes(rid));
        })())
  );

  // Check if current user can type/send messages in current channel
  const canTypeInCurrentChannel = Boolean(
    targetType === 'dm' ||
      (currentUser &&
        (currentUser.role === 'owner' ||
          currentUser.role === 'co-owner' ||
          currentUser.roleIds?.some((rid) => {
            const r = roles.find((role) => role.id === rid);
            return r?.permissions?.canModerate || r?.permissions?.canEditChannels;
          }) ||
          (() => {
            const allowed = channel?.permissions?.canType || channel?.permissions?.allowedRolesType;
            if (allowed && allowed.length > 0) {
              if (allowed.includes('*')) return true;
              return (currentUser.roleIds || []).some((rid) => allowed.includes(rid));
            }
            if (channel?.categoryId) {
              const cat = categories.find((c) => c.id === channel.categoryId);
              const catAllowed = cat?.permissions?.canType;
              if (catAllowed && catAllowed.length > 0 && !catAllowed.includes('*')) {
                return (currentUser.roleIds || []).some((rid) => catAllowed.includes(rid));
              }
            }
            return true;
          })()))
  );

  // Format date headers
  const formatDateHeader = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatMessageTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Render text with code blocks, interactive games, and links
  const renderMessageContent = (text: string, isAiMsg?: boolean) => {
    const codeBlockRegex = /```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <React.Fragment key={`text-${lastIndex}`}>
            {renderInlineFormatting(text.slice(lastIndex, match.index))}
          </React.Fragment>
        );
      }
      const lang = match[1] || '';
      const codeBody = match[2] || '';
      parts.push(
        <CodeAndGameRunner
          key={`code-${match.index}`}
          code={codeBody}
          language={lang}
          isAiMessage={isAiMsg}
        />
      );
      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(
        <React.Fragment key={`text-${lastIndex}`}>
          {renderInlineFormatting(text.slice(lastIndex))}
        </React.Fragment>
      );
    }

    return parts;
  };

  const renderInlineFormatting = (str: string) => {
    const regex = /(https?:\/\/\S+|@\S+|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|^# .*|^-\# .*)/gm;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      const m = match[0];
      if (m.startsWith('http://') || m.startsWith('https://')) {
        parts.push(
          <a
            key={match.index}
            href={m}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 underline hover:text-sky-300 break-all mr-1"
          >
            {m}
          </a>
        );
      } else if (m.startsWith('@')) {
        const rawHandle = m.slice(1);
        const cleanHandle = rawHandle.replace(/[.,!?:]+$/, '');
        const trailingPunct = rawHandle.slice(cleanHandle.length);

        const realUser = allUsers.find(
          (u) => u.username.toLowerCase() === cleanHandle.toLowerCase()
        );
        const isSpecial =
          cleanHandle.toLowerCase() === 'everyone' || cleanHandle.toLowerCase() === 'here';
        const isRole = roles.some((r) => r.name.toLowerCase() === cleanHandle.toLowerCase());

        if (realUser || isSpecial || isRole) {
          parts.push(
            <span
              key={match.index}
              className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-mono font-medium text-xs mr-0.5 inline-flex items-center gap-0.5 shadow-2xs"
            >
              @{realUser ? realUser.username : cleanHandle}
            </span>
          );
          if (trailingPunct) {
            parts.push(trailingPunct);
          }
        } else {
          parts.push(m);
        }
      } else if (m.startsWith('`') && m.endsWith('`') && m.length > 2) {
        parts.push(
          <code
            key={match.index}
            className="px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800 font-mono text-xs text-amber-300 mr-1"
          >
            {m.slice(1, -1)}
          </code>
        );
      } else if (m.startsWith('**') && m.endsWith('**')) {
        parts.push(<strong key={match.index} className="font-bold">{m.slice(2, -2)}</strong>);
      } else if (m.startsWith('*') && m.endsWith('*')) {
        parts.push(<em key={match.index} className="italic">{m.slice(1, -1)}</em>);
      } else if (m.startsWith('~~') && m.endsWith('~~')) {
        parts.push(<del key={match.index} className="line-through">{m.slice(2, -2)}</del>);
      } else if (m.startsWith('# ')) {
        parts.push(<span key={match.index} className="font-bold text-xl block mt-1">{m.slice(2)}</span>);
      } else if (m.startsWith('-# ')) {
        parts.push(<span key={match.index} className="text-[10.5px] opacity-50 block">{m.slice(3)}</span>);
      } else {
        parts.push(m);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < str.length) {
      parts.push(str.slice(lastIndex));
    }
    return <>{parts}</>;
  };

  return (
    <div
      id="chat-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 h-full bg-neutral-900 flex flex-col min-w-0 relative"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-neutral-950/90 backdrop-blur-xs border-2 border-dashed border-emerald-500 rounded-2xl m-3 flex flex-col items-center justify-center pointer-events-none transition-all">
          <div className="p-4 bg-emerald-500/10 rounded-full border border-emerald-500/30 mb-3 animate-bounce">
            <Paperclip className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-base font-bold text-white tracking-tight">Drop files to attach to chat bar</p>
          <p className="text-xs text-neutral-400 mt-1 font-medium">Supports workspace backup JSONs for /import and all media types</p>
        </div>
      )}

      {/* Top Header */}
      <div className="h-14 border-b border-neutral-800 px-5 flex items-center justify-between shrink-0 bg-neutral-900/80 backdrop-blur-xs z-10">
        <div className="flex items-center gap-3 min-w-0">
          {targetType === 'channel' ? (
            <div className="flex items-center gap-1.5 min-w-0">
              {channel?.type === 'game' ? (
                <Gamepad2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <Hash className="w-5 h-5 text-neutral-400 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="font-semibold text-white tracking-tight text-sm truncate block">
                  {title}
                </span>
                <span className="text-xs text-neutral-400 truncate block max-w-md">{subtitle}</span>
              </div>
            </div>
          ) : targetUser ? (
            <button
              type="button"
              onClick={() => onUserClick?.(targetUser)}
              className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 transition group cursor-pointer"
              title={`View ${targetUser.displayName || targetUser.username}'s profile`}
            >
              <div className="relative shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs overflow-hidden"
                  style={{ backgroundColor: targetUser.avatarColor || '#3b82f6' }}
                >
                  {targetUser.avatarUrl ? (
                    <img src={targetUser.avatarUrl} alt={targetUser.username} className="w-full h-full object-cover" />
                  ) : (
                    (targetUser.displayName || targetUser.username).slice(0, 2).toUpperCase()
                  )}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-neutral-900 ${
                    onlineUserIds.has(targetUser.id) ? 'bg-emerald-500' : 'bg-neutral-600'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-white tracking-tight text-sm truncate block group-hover:underline">
                  {title}
                </span>
                <span className="text-xs text-neutral-400 truncate block max-w-md">{subtitle}</span>
              </div>
            </button>
          ) : null}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          {targetType === 'channel' && channel && canEditCurrentChannel && onEditChannel && (
            <button
              onClick={() => onEditChannel(channel)}
              title="Channel Settings & Permissions"
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setShowPinsPanel((prev) => !prev)}
            title="Pinned Messages"
            className={`p-1.5 rounded-md transition ${
              showPinsPanel
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Pin className="w-4 h-4" />
          </button>

          {isSearchOpen ? (
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter messages..."
                className="bg-neutral-950 border border-neutral-700 rounded-lg pl-8 pr-7 py-1 text-xs text-white focus:outline-none focus:border-neutral-500 w-44"
                autoFocus
              />
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                }}
                className="absolute right-2 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchOpen(true)}
              title="Search conversation"
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenMusicPlayer}
            title="Open KeepMusic Player"
            className="p-1.5 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded-md transition"
          >
            <Music className="w-4 h-4" />
          </button>
          {/* Channel Audio and Video Calling buttons */}
          {targetType === 'channel' && channel?.type !== 'voice' && currentUser && !activeCall && (
            <div className="flex items-center gap-1.5 ml-1 border-l border-neutral-800 pl-2">
              <button
                onClick={() => onStartCall?.(channel.id, 'audio', true)}
                title="Start Audio Call in this channel"
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-700/80 rounded-md transition shadow-xs"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Call</span>
              </button>
              <button
                onClick={() => onStartCall?.(channel.id, 'video', true)}
                title="Start Video Call in this channel"
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-700/80 rounded-md transition shadow-xs"
              >
                <Video className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Video Call</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Call Status when user is browsing another channel or DM */}
      {activeCall && activeCall.channelId !== channel?.id && (
        <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-xs z-20 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-neutral-300">
              Connected to Call in <span className="text-white font-semibold">#{activeCall.channelId.replace(/^c-/, '')}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleCallLobby?.(true)}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition flex items-center gap-1"
            >
              <Radio className="w-3 h-3" />
              <span>Open Call Lobby</span>
            </button>
            <button
              onClick={onLeaveCall}
              className="px-2 py-1 bg-neutral-800 hover:bg-red-600 text-neutral-300 hover:text-white rounded text-xs font-medium transition"
            >
              Leave Call
            </button>
          </div>
        </div>
      )}

      {/* Active Call in current channel notification banner (when user hasn't joined yet) */}
      {targetType === 'channel' && !activeCall && activeChannelCall && activeChannelCall.count > 0 && channel && (
        <div className="px-4 py-2 bg-emerald-950/60 border-b border-emerald-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-300">
              Active {activeChannelCall.callType === 'video' ? 'Video' : 'Audio'} Call in #{channel.name}
            </span>
            <span className="text-[11px] font-mono text-emerald-400/90">
              ({activeChannelCall.count} participant{activeChannelCall.count > 1 ? 's' : ''})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onStartCall?.(channel.id, (activeChannelCall.callType as any) || 'audio', false)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Join Call</span>
            </button>
          </div>
        </div>
      )}

      {/* Voice Room / Channel Call Stage */}
      {channel && (activeCall?.channelId === channel.id || channel.type === 'voice') && (
        isCallLobbyOpen !== false ? (
          <VoiceRoom
            channel={channel}
            currentUser={currentUser}
            allUsers={allUsers}
            initialCallType={activeCall?.initialCallType || 'audio'}
            isInitiator={activeCall?.isInitiator || false}
            compact={channel.type !== 'voice'}
            onLeaveCall={onLeaveCall}
            onMinimize={() => onToggleCallLobby?.(false)}
          />
        ) : (
          <div className="px-4 py-2 bg-emerald-950/70 border-b border-emerald-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="font-semibold text-emerald-300">Connected to Call in #{channel.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleCallLobby?.(true)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Open Call Lobby</span>
              </button>
              <button
                onClick={onLeaveCall}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-red-600 text-neutral-300 hover:text-white rounded-md text-xs font-semibold transition"
              >
                Leave
              </button>
            </div>
          </div>
        )
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {displayedMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400 select-none">
            <div className="w-12 h-12 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 mb-3 shadow-inner">
              <Hash className="w-6 h-6 text-neutral-400" />
            </div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Welcome to {title}!
            </h3>
            <p className="text-xs text-neutral-400 max-w-sm mt-1 leading-relaxed">
              This is the start of the {title} conversation. Use the + key to share files, apps, or ping mods!
            </p>
          </div>
        ) : (
          displayedMessages.map((msg, idx) => {
            const prevMsg = displayedMessages[idx - 1];
            const isSameSenderAsPrev =
              prevMsg &&
              prevMsg.senderId === msg.senderId &&
              !msg.replyTo &&
              msg.createdAt - prevMsg.createdAt < 300000;

            const isNewDay =
              !prevMsg ||
              new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            const isSelf = currentUser?.id === msg.senderId;

            const senderUser =
              allUsers.find(
                (u) =>
                  (msg.senderId && u.id === msg.senderId) ||
                  (msg.senderUsername && u.username === msg.senderUsername)
              ) || (currentUser?.id === msg.senderId ? currentUser : null);

            const effectiveAvatarUrl = senderUser?.avatarUrl || msg.senderAvatarUrl;
            const effectiveAvatarColor = senderUser?.avatarColor || msg.senderAvatarColor || '#3b82f6';
            const effectiveSenderName = senderUser?.displayName || senderUser?.username || msg.senderName;
            const effectiveSenderUsername = senderUser?.username || msg.senderUsername;

            return (
              <React.Fragment key={msg.id}>
                {/* Date separator */}
                {isNewDay && (
                  <div className="relative flex items-center justify-center my-6">
                    <div className="absolute inset-x-0 h-[1px] bg-neutral-800" />
                    <span className="relative bg-neutral-900 px-3 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      {formatDateHeader(msg.createdAt)}
                    </span>
                  </div>
                )}

                {/* Message row */}
                <div
                  id={`msg-${msg.id}`}
                  onMouseEnter={() => setActiveReactionMenuMsgId(msg.id)}
                  onMouseLeave={() => setActiveReactionMenuMsgId(null)}
                  onTouchStart={(e) => {
                    if (e.touches[0]) {
                      const x = e.touches[0].clientX;
                      const y = e.touches[0].clientY;
                      messageTouchRef.current.startX = x;
                      messageTouchRef.current.startY = y;
                      if (messageTouchRef.current.timer) clearTimeout(messageTouchRef.current.timer);
                      messageTouchRef.current.timer = setTimeout(() => {
                        try { navigator.vibrate?.(50); } catch {}
                        setActiveReactionMenuMsgId(msg.id);
                      }, 400);
                    }
                  }}
                  onTouchMove={(e) => {
                    if (e.touches[0]) {
                      const dx = Math.abs(e.touches[0].clientX - messageTouchRef.current.startX);
                      const dy = Math.abs(e.touches[0].clientY - messageTouchRef.current.startY);
                      if (dx > 10 || dy > 10) {
                        if (messageTouchRef.current.timer) {
                          clearTimeout(messageTouchRef.current.timer);
                          messageTouchRef.current.timer = null;
                        }
                      }
                    }
                  }}
                  onTouchEnd={() => {
                    if (messageTouchRef.current.timer) {
                      clearTimeout(messageTouchRef.current.timer);
                      messageTouchRef.current.timer = null;
                    }
                  }}
                  className={`group relative flex items-start gap-3 rounded-md px-2.5 -mx-2.5 hover:bg-neutral-800/30 transition-colors ${
                    isSameSenderAsPrev ? '-mt-1 py-0' : 'mt-3.5 pt-1 pb-0.5'
                  }`}
                >
                  {/* Avatar */}
                  {!isSameSenderAsPrev ? (
                    <button
                      onClick={() => {
                        handleUserClick(
                          msg.senderId,
                          effectiveSenderUsername,
                          effectiveSenderName,
                          effectiveAvatarColor,
                          effectiveAvatarUrl
                        );
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm mt-0.5 select-none overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-500/50 transition"
                      style={{ backgroundColor: effectiveAvatarColor }}
                    >
                      {effectiveAvatarUrl ? (
                        <img src={effectiveAvatarUrl} alt={effectiveSenderName} className="w-full h-full object-cover" />
                      ) : (
                        effectiveSenderName.slice(0, 2).toUpperCase()
                      )}
                    </button>
                  ) : (
                    <div className="w-9 shrink-0 flex items-center justify-end pr-1 pt-0.5 select-none">
                      <span className="text-[9px] text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity font-mono leading-none">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* Message body */}
                  <div className="flex-1 min-w-0">
                    {!isSameSenderAsPrev && (
                      <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                        {(() => {
                          const highestRole = getHighestRole(senderUser, roles || []);
                          return (
                            <>
                              <button 
                                onClick={() => {
                                  handleUserClick(
                                    msg.senderId,
                                    effectiveSenderUsername,
                                    effectiveSenderName,
                                    effectiveAvatarColor,
                                    effectiveAvatarUrl
                                  );
                                }}
                                className="text-xs font-semibold tracking-tight hover:underline cursor-pointer"
                                style={{ color: highestRole?.color || '#ffffff' }}
                              >
                                {effectiveSenderName}
                              </button>
                              {highestRole?.iconUrl && (
                                <img
                                  src={highestRole.iconUrl}
                                  alt={highestRole.name}
                                  className="w-3.5 h-3.5 object-contain shrink-0 inline-block"
                                  title={`Role Icon: ${highestRole.name}`}
                                />
                              )}
                              {highestRole && (
                                <span
                                  className="px-1.5 py-0.2 text-[9px] font-bold rounded uppercase tracking-wider select-none shrink-0"
                                  style={{
                                    backgroundColor: `${highestRole.color}20`,
                                    color: highestRole.color,
                                    border: `1px solid ${highestRole.color}40`,
                                  }}
                                  title={`Role: ${highestRole.name}`}
                                >
                                  {highestRole.name}
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {(msg.senderId === 'system-ai' || effectiveSenderUsername === 'ai') && (
                          <span className="px-1.5 py-0.2 bg-purple-600 text-white text-[9px] font-bold rounded uppercase tracking-wider select-none">
                            AI BOT
                          </span>
                        )}
                        {msg.senderId === 'system-bot' && (
                          <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-bold rounded uppercase tracking-wider select-none">
                            BOT
                          </span>
                        )}
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {msg.isPinned && (
                          <span className="flex items-center gap-0.5 text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded-sm">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </span>
                        )}
                      </div>
                    )}

                    {/* Quoted reply snippet */}
                    {msg.replyTo && (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(`msg-${msg.replyTo!.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                            setTimeout(() => {
                              el.style.backgroundColor = '';
                            }, 2000);
                          }
                        }}
                        className="flex items-center gap-1.5 mb-1.5 px-2.5 py-1 bg-neutral-950/60 border-l-2 border-neutral-500 rounded text-xs text-neutral-400 hover:bg-neutral-900/80 transition text-left cursor-pointer"
                      >
                        <CornerDownRight className="w-3 h-3 text-neutral-500 shrink-0" />
                        <span className="font-medium text-neutral-300">
                          {msg.replyTo.senderName}:
                        </span>
                        <span className="truncate italic">{msg.replyTo.text}</span>
                      </button>
                    )}

                    {/* Text content or Inline Editor */}
                    {editingMessageId === msg.id ? (
                      <div className="mt-1 space-y-1.5 w-full max-w-2xl">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition">
                          <textarea
                            ref={editInputRef}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveEdit(msg.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                handleCancelEdit();
                              }
                            }}
                            rows={Math.min(6, Math.max(1, editingText.split('\n').length))}
                            className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none resize-none leading-relaxed"
                            placeholder="Edit message..."
                            disabled={isSavingEdit}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 select-none">
                          <span className="text-[11px] text-neutral-500">
                            escape to{' '}
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="text-emerald-400 hover:underline cursor-pointer"
                            >
                              cancel
                            </button>{' '}
                            • enter to{' '}
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(msg.id)}
                              className="text-emerald-400 hover:underline cursor-pointer"
                            >
                              save
                            </button>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              disabled={isSavingEdit}
                              className="px-2.5 py-1 rounded text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(msg.id)}
                              disabled={isSavingEdit || !editingText.trim()}
                              className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-xs cursor-pointer"
                            >
                              {isSavingEdit ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text && (
                          <div 
                            className="text-sm text-neutral-200 leading-relaxed break-words whitespace-pre-wrap"
                            style={{ fontFamily: allUsers.find(u => u.username === msg.senderUsername)?.fontFamily || 'inherit' }}
                          >
                            {renderMessageContent(msg.text, msg.senderId === 'system-ai' || effectiveSenderUsername === 'ai')}
                            {msg.isEdited && (
                              <span 
                                className="text-[10px] text-neutral-400 font-normal ml-1.5 select-none inline-block align-baseline hover:underline cursor-default"
                                title={msg.editedAt ? `Edited at ${new Date(msg.editedAt).toLocaleTimeString()}` : 'Edited'}
                              >
                                (edited)
                              </span>
                            )}
                          </div>
                        )}

                        {/* Rich Link and Media Previews for URLs in message */}
                        {msg.text && (
                          <div className="space-y-2 mt-1">
                            {extractUrlsFromText(msg.text).map((url, uIdx) => (
                              <LinkPreview key={uIdx} url={url} />
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Embedded Media / Attachments (GIFs, images, files, videos, audios) */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 flex flex-col gap-2">
                        {msg.attachments.map((att, attIdx) => {
                          const isVideo = att.type === 'video' || att.url?.match(/\.(mp4|webm|mov|mkv|ogv)(\?|$)/i) || att.url?.startsWith('data:video/');
                          const isAudio = att.type === 'audio' || att.url?.match(/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i) || att.url?.startsWith('data:audio/');
                          const isImage = att.type === 'gif' || att.type === 'image' || att.url?.match(/\.(gif|jpg|jpeg|png|webp|svg)(\?|$)/i) || att.url?.startsWith('data:image/');
                          const fav = isFavorited(att.url);

                          if (isVideo) {
                            return (
                              <div
                                key={attIdx}
                                className="rounded-xl overflow-hidden border border-neutral-800 bg-black max-w-lg shadow-lg"
                              >
                                <div className="px-3 py-1.5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-300">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                    <span className="truncate font-medium">{att.name || 'Video attachment'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    <button
                                      type="button"
                                      onClick={(e) => toggleFavoriteAttachment(att, e)}
                                      title={fav ? 'Remove from Saved GIFs/Files' : 'Save to GIFs & Favorites'}
                                      className={`p-1 rounded transition ${
                                        fav ? 'text-amber-400 bg-black/40' : 'text-neutral-400 hover:text-amber-400 hover:bg-neutral-800'
                                      }`}
                                    >
                                      <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400' : ''}`} />
                                    </button>
                                    <a
                                      href={att.url}
                                      download={att.name || 'video.mp4'}
                                      className="text-neutral-400 hover:text-white text-[11px] hover:underline"
                                    >
                                      Download
                                    </a>
                                  </div>
                                </div>
                                <video
                                  src={att.url}
                                  title={att.name || 'video'}
                                  controls
                                  preload="metadata"
                                  playsInline
                                  className="max-h-80 w-full object-contain bg-black"
                                />
                              </div>
                            );
                          }

                          if (isAudio) {
                            return (
                              <div
                                key={attIdx}
                                className="rounded-xl p-3 border border-neutral-800 bg-neutral-950 max-w-md shadow-md"
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 truncate">
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                      <Music className="w-4 h-4" />
                                    </div>
                                    <div className="truncate">
                                      <p className="text-xs font-semibold text-neutral-200 truncate">
                                        {att.name || 'Audio Track'}
                                      </p>
                                      <p className="text-[10px] text-neutral-400 font-mono">Audio file</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => toggleFavoriteAttachment(att, e)}
                                      title={fav ? 'Remove from Saved GIFs/Files' : 'Save to GIFs & Favorites'}
                                      className={`p-1 rounded transition ${
                                        fav ? 'text-amber-400 bg-black/40' : 'text-neutral-400 hover:text-amber-400 hover:bg-neutral-800'
                                      }`}
                                    >
                                      <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400' : ''}`} />
                                    </button>
                                    <a
                                      href={att.url}
                                      download={att.name || 'audio.mp3'}
                                      className="text-[11px] text-neutral-400 hover:text-white hover:underline"
                                    >
                                      Download
                                    </a>
                                  </div>
                                </div>
                                <audio controls src={att.url} className="w-full h-9 rounded" preload="metadata" />
                              </div>
                            );
                          }

                          if (isImage) {
                            return (
                              <div
                                key={attIdx}
                                className="group/img relative inline-block max-w-md rounded-xl overflow-hidden border border-neutral-800/80 shadow-md transition"
                              >
                                <img
                                  src={att.url}
                                  alt={att.name || 'attachment'}
                                  className="max-h-80 w-auto h-auto max-w-full rounded-xl object-contain hover:scale-[1.01] transition cursor-pointer bg-neutral-950/50"
                                  loading="lazy"
                                  onClick={() => window.open(att.url, '_blank')}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavoriteAttachment(att, e)}
                                  title={fav ? 'Remove from Saved GIFs/Files' : 'Save to GIFs & Favorites'}
                                  className={`absolute top-2 left-2 p-1.5 rounded-lg backdrop-blur-md transition shadow-md z-10 ${
                                    fav
                                      ? 'bg-black/75 text-amber-400 opacity-100'
                                      : 'bg-black/60 text-white/80 opacity-0 group-hover/img:opacity-100 hover:text-amber-400'
                                  }`}
                                >
                                  <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400' : ''}`} />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={attIdx}
                              className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950 max-w-sm shadow-md flex items-center justify-between pr-2"
                            >
                              <a
                                href={att.url}
                                download={att.name || 'file'}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2.5 p-3 text-xs text-emerald-400 hover:text-emerald-300 transition flex-1 min-w-0"
                              >
                                <Paperclip className="w-4 h-4 text-neutral-400 shrink-0" />
                                <span className="font-medium truncate">{att.name || 'Download file'}</span>
                              </a>
                              <button
                                type="button"
                                onClick={(e) => toggleFavoriteAttachment(att, e)}
                                title={fav ? 'Remove from Saved GIFs/Files' : 'Save to GIFs & Favorites'}
                                className={`p-1.5 rounded-lg transition shrink-0 ${
                                  fav
                                    ? 'text-amber-400 bg-neutral-900'
                                    : 'text-neutral-500 hover:text-amber-400 hover:bg-neutral-900'
                                }`}
                              >
                                <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400' : ''}`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reactions Pill Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(msg.reactions).map(([emoji, userIdsRaw]) => {
                          const userIds = (userIdsRaw as string[]) || [];
                          const hasReacted = currentUser ? userIds.includes(currentUser.id) : false;
                          const isImage = emoji.startsWith('http') || emoji.startsWith('data:image');
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => onToggleReaction(msg.id, emoji)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition ${
                                hasReacted
                                  ? 'bg-neutral-800 border-neutral-600 text-white'
                                  : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                              }`}
                              title={`${userIds.length} reaction${userIds.length > 1 ? 's' : ''}`}
                            >
                              {isImage ? (
                                <img src={emoji} alt="reaction" className="h-4 w-4 object-contain inline-block" />
                              ) : (
                                <span>{emoji}</span>
                              )}
                              <span className="text-[11px] text-neutral-400 font-mono">
                                {userIds.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Hover Floating Actions Menu */}
                  <div
                    className={`absolute right-2 top-0 -translate-y-1/2 flex items-center bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg px-1 py-0.5 z-10 transition-opacity ${
                      activeReactionMenuMsgId === msg.id
                        ? 'opacity-100 pointer-events-auto'
                        : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {['👍', '❤️', '🔥'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => onToggleReaction(msg.id, emoji)}
                        className="px-1.5 py-1 text-sm hover:scale-125 transition"
                      >
                        {emoji}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={async () => {
                        const custom = await (window as any).customPrompt('Enter emoji, text, or image URL to react:');
                        if (custom && custom.trim()) {
                          onToggleReaction(msg.id, custom.trim());
                        }
                      }}
                      title="Custom Reaction"
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition ml-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-[1px] h-3.5 bg-neutral-700 mx-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(msg);
                        inputRef.current?.focus();
                      }}
                      title="Reply in thread"
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>

                    {(currentUser?.role === 'owner' || currentUser?.role === 'co-owner') && (
                      <button
                        type="button"
                        onClick={() => onTogglePin(msg.id)}
                        title={msg.isPinned ? 'Unpin message' : 'Pin message'}
                        className={`p-1 rounded hover:bg-neutral-800 transition ${
                          msg.isPinned
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isSelf && (
                      <button
                        type="button"
                        onClick={() => handleStartEditing(msg)}
                        title="Edit message"
                        className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(isSelf || currentUser?.role === 'owner' || currentUser?.role === 'co-owner') && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        title="Delete message"
                        className="p-1 text-neutral-400 hover:text-red-400 rounded hover:bg-neutral-800 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={async () => {
                          const reason = await (window as any).customPrompt('Why are you reporting this message?');
                          if (reason !== null) {
                            try {
                              await api.reportMessage(msg.id, reason);
                              await (window as any).customAlert('Message reported to moderators.');
                            } catch (err: any) {
                              await (window as any).customAlert('Failed to report: ' + err.message);
                            }
                          }
                        }}
                        title="Report message"
                        className="p-1 text-neutral-400 hover:text-amber-500 rounded hover:bg-neutral-800 transition"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-8 p-2 rounded-full bg-neutral-800 border border-neutral-700 text-white shadow-xl hover:bg-neutral-700 transition"
          title="Jump to latest"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-6 py-1 text-xs text-neutral-400 flex items-center gap-2 italic select-none">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Replying Banner */}
      {replyingTo && (
        <div className="mx-5 mb-1 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-t-lg flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2 truncate">
            <Reply className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>Replying to</span>
            <span className="font-semibold text-neutral-200">{replyingTo.senderName}:</span>
            <span className="italic truncate">{replyingTo.text}</span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="text-neutral-500 hover:text-white p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Staged Attachments Preview */}
      {stagedAttachments.length > 0 && (
        <div className="mx-5 mb-2 p-2 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center gap-2 overflow-x-auto">
          {stagedAttachments.map((att, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700 shrink-0">
              {att.type === 'gif' || att.type === 'image' || att.url?.startsWith('data:image/') ? (
                <img src={att.url} alt={att.name || 'preview'} className="h-16 w-16 object-cover" />
              ) : att.type === 'video' || att.url?.startsWith('data:video/') ? (
                <div className="h-16 w-24 p-2 flex flex-col justify-center items-center text-[10px] text-purple-300 bg-neutral-950">
                  <Film className="w-5 h-5 text-purple-400 mb-1" />
                  <span className="truncate w-full text-center">{att.name || 'Video'}</span>
                </div>
              ) : att.type === 'audio' || att.url?.startsWith('data:audio/') ? (
                <div className="h-16 w-24 p-2 flex flex-col justify-center items-center text-[10px] text-amber-300 bg-neutral-950">
                  <Music className="w-5 h-5 text-amber-400 mb-1" />
                  <span className="truncate w-full text-center">{att.name || 'Audio'}</span>
                </div>
              ) : (
                <div className="h-16 w-24 p-2 flex flex-col justify-center items-center text-[10px] text-neutral-300">
                  <FileText className="w-5 h-5 text-neutral-400 mb-1" />
                  <span className="truncate w-full text-center">{att.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setStagedAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 p-0.5 bg-black/70 text-white rounded-full hover:bg-red-500 transition"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* User Mention Autocomplete Overlay (Discord Style) */}
      {atMentionQuery !== null && filteredMentionUsers.length > 0 && (
        <div className="mx-5 mb-1 bg-neutral-950 border border-neutral-800 rounded-xl p-2 shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-neutral-900 animate-in fade-in duration-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 px-2 py-1 flex items-center justify-between">
            <span>Members matching @{atMentionQuery}</span>
            <span className="text-neutral-500 font-normal">Click or Tab to select</span>
          </div>
          {filteredMentionUsers.map((u) => {
            const isOnline = onlineUserIds.has(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelectMentionUser(u.username)}
                className="w-full text-left px-2.5 py-2 hover:bg-neutral-900 rounded-lg flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden bg-neutral-800"
                      style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
                    >
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                      ) : (
                        (u.displayName || u.username).slice(0, 2).toUpperCase()
                      )}
                    </div>
                    {isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-neutral-950" />
                    )}
                  </div>
                  <div className="truncate">
                    <span className="font-semibold text-xs text-white group-hover:text-emerald-300 mr-2">
                      {u.displayName || u.username}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-400">@{u.username}</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 opacity-0 group-hover:opacity-100 transition">
                  Mention
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Slash Commands Autocomplete Overlay */}
      {filteredCommands.length > 0 && (
        <div className="mx-5 mb-1 bg-neutral-950 border border-neutral-800 rounded-xl p-2 shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-neutral-900">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 px-2 py-1">
            Slash Commands ({filteredCommands.length})
          </div>
          {filteredCommands.map((item) => {
            const hasArgs = item.cmd.includes('[');
            return (
              <button
                key={item.cmd}
                type="button"
                onClick={() => {
                  if (item.label === '/pingmod') {
                    setInputText('');
                    setShowPingModModal(true);
                  } else if (item.label === '/automod' && onOpenAutoMod) {
                    setInputText('');
                    onOpenAutoMod();
                  } else if (item.label === '/import') {
                    setInputText('/import ');
                    inputRef.current?.focus();
                  } else if (!hasArgs) {
                    setInputText('');
                    onSendMessage(item.cmd);
                  } else {
                    setInputText(item.label + ' ');
                    inputRef.current?.focus();
                  }
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-neutral-900 rounded-lg flex items-center justify-between group transition"
              >
                <div>
                  <span className="font-mono font-bold text-xs text-emerald-400 group-hover:text-emerald-300">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-neutral-400 ml-2">{item.desc}</span>
                </div>
                <ChevronRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-300" />
              </button>
            );
          })}
        </div>
      )}

      {/* Input Box Footer */}
      <div className="p-4 pt-1 border-t border-neutral-800 bg-neutral-900">
        {!currentUser ? (
          <div
            id="chat-guest-banner"
            className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between text-xs text-neutral-400"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>You are viewing in read-only mode.</span>
            </div>
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-neutral-900 font-semibold rounded-lg transition"
            >
              Sign In to Chat
            </button>
          </div>
        ) : !canTypeInCurrentChannel ? (
          <div
            id="chat-readonly-channel-banner"
            className="p-3.5 bg-neutral-950 border border-neutral-800/90 rounded-xl flex items-center justify-between text-xs text-neutral-400"
          >
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                #<strong className="text-white">{channel?.name}</strong> is a read-only channel. Only administrators and permitted roles can send messages here.
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono select-none">
              Read-Only
            </span>
          </div>
        ) : (
          <div className="relative bg-neutral-950 border border-neutral-800 focus-within:border-neutral-600 rounded-xl p-2 transition shadow-inner flex items-start gap-2">
            {/* '+' Button to the left of the typing area (per user request) */}
            <div className="relative shrink-0 mt-0.5">
              <button
                id="chat-plus-action-btn"
                type="button"
                onClick={() => setShowPlusMenu((prev) => !prev)}
                title="Add files, apps, or ping mod"
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                  showPlusMenu
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* '+' Dropdown Menu: "choose file" and "ping mod" */}
              {showPlusMenu && (
                <div className="absolute bottom-9 left-0 w-48 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1 z-40 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-800 flex items-center gap-2.5 transition"
                  >
                    <Paperclip className="w-4 h-4 text-emerald-400" />
                    <span>Choose file</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false);
                      setShowPingModModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-950/40 flex items-center gap-2.5 transition border-t border-neutral-800"
                  >
                    <BellRing className="w-4 h-4 text-red-400" />
                    <span>Ping mod</span>
                  </button>
                </div>
              )}
            </div>

            {/* Hidden native file input - accepts any file */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Textarea */}
            <div className="flex-1 min-w-0">
              {isUploadingFile && (
                <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-neutral-900 border border-emerald-500/40 rounded-lg text-xs text-emerald-400 animate-pulse">
                  <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="font-mono truncate">{uploadProgressText || 'Uploading file...'}</span>
                </div>
              )}

              <textarea
                ref={inputRef}
                id="message-textarea"
                rows={2}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={`Message ${title}... (Paste files or images, type / for commands, Enter to send)`}
                className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none resize-none px-1 py-0.5 leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 mt-1">
                <div className="flex items-center gap-1">
                  {/* Emoji Picker */}
                  <div ref={emojiPickerContainerRef} className="relative">
                    <button
                      id="emoji-picker-toggle-btn"
                      type="button"
                      onClick={() => {
                        setShowEmojiPicker((v) => !v);
                        setShowGifPicker(false);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-800 transition"
                      title="Emoji picker"
                    >
                      <Smile className="w-4 h-4" />
                    </button>

                    {showEmojiPicker && (
                      <EmojiPicker
                        onSelectEmoji={(e) => insertEmoji(e)}
                        onClose={() => setShowEmojiPicker(false)}
                      />
                    )}
                  </div>

                  {/* Tenor / GIF Button (per user request) */}
                  <div className="relative">
                    <button
                      id="gif-picker-toggle-btn"
                      type="button"
                      onClick={() => {
                        setShowGifPicker((v) => !v);
                        setShowEmojiPicker(false);
                      }}
                      className={`px-2 py-0.5 text-xs font-bold rounded-md transition ${
                        showGifPicker
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                      }`}
                      title="Tenor & GIFs"
                    >
                      GIF
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-500 hidden sm:inline">
                    Markdown supported
                  </span>
                  <button
                    id="send-message-btn"
                    type="button"
                    disabled={!inputText.trim() && stagedAttachments.length === 0}
                    onClick={handleSend}
                    className="p-2 bg-white hover:bg-neutral-100 text-neutral-900 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tenor & GIF Picker Panel */}
      {showGifPicker && (
        <div ref={gifPickerContainerRef}>
          <GifPicker
            onSelectGif={handleSelectGif}
            onClose={() => setShowGifPicker(false)}
          />
        </div>
      )}

      {/* Ping Mod Modal */}
      {showPingModModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl p-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Ping Server Moderators</h3>
                  <p className="text-[11px] text-neutral-400">Sends high-priority notification to #reports</p>
                </div>
              </div>
              <button
                onClick={() => setShowPingModModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePingModSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  Reason for moderator alert:
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the issue or assistance required..."
                  value={pingModReason}
                  onChange={(e) => setPingModReason(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPingModModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pingingMod || !pingModReason.trim()}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                >
                  {pingingMod ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />}
                  Alert Moderators
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pins Panel */}
      {showPinsPanel && (
        <div className="absolute top-14 right-0 bottom-0 w-80 bg-neutral-900 border-l border-neutral-800 shadow-2xl z-20 flex flex-col animate-in slide-in-from-right-4 duration-200">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="font-semibold text-white tracking-tight flex items-center gap-2">
              <Pin className="w-4 h-4 text-emerald-500" />
              Pinned Messages
            </h3>
            <button
              onClick={() => setShowPinsPanel(false)}
              className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.filter((m) => m.isPinned).length === 0 ? (
              <div className="text-center text-sm text-neutral-500 mt-10">
                No pinned messages yet.
              </div>
            ) : (
              messages
                .filter((m) => m.isPinned)
                .map((msg) => {
                  const senderUser =
                    allUsers.find(
                      (u) =>
                        (msg.senderId && u.id === msg.senderId) ||
                        (msg.senderUsername && u.username === msg.senderUsername)
                    ) || (currentUser?.id === msg.senderId ? currentUser : null);

                  const effectiveAvatarUrl = senderUser?.avatarUrl || msg.senderAvatarUrl;
                  const effectiveAvatarColor = senderUser?.avatarColor || msg.senderAvatarColor || '#3b82f6';
                  const effectiveSenderName = senderUser?.displayName || senderUser?.username || msg.senderName;
                  const effectiveSenderUsername = senderUser?.username || msg.senderUsername;

                  return (
                    <div
                      key={`pin-${msg.id}`}
                      className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 relative group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => {
                            handleUserClick(
                              msg.senderId,
                              effectiveSenderUsername,
                              effectiveSenderName,
                              effectiveAvatarColor,
                              effectiveAvatarUrl
                            );
                          }}
                          className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-[9px] overflow-hidden cursor-pointer shrink-0"
                          style={{ backgroundColor: effectiveAvatarColor }}
                        >
                          {effectiveAvatarUrl ? (
                            <img src={effectiveAvatarUrl} alt={effectiveSenderName} className="w-full h-full object-cover" />
                          ) : (
                            effectiveSenderName.slice(0, 2).toUpperCase()
                          )}
                        </button>
                        <button
                          onClick={() => {
                            handleUserClick(
                              msg.senderId,
                              effectiveSenderUsername,
                              effectiveSenderName,
                              effectiveAvatarColor,
                              effectiveAvatarUrl
                            );
                          }}
                          className="text-xs font-semibold text-white tracking-tight hover:underline cursor-pointer"
                        >
                          {effectiveSenderName}
                        </button>
                        <span className="text-[10px] text-neutral-500 font-mono ml-auto">
                          {new Date(msg.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    <div className="text-xs text-neutral-300 leading-relaxed max-h-32 overflow-hidden relative">
                      {msg.text}
                      {msg.text.length > 150 && (
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-neutral-950 to-transparent pointer-events-none" />
                      )}
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                      <button
                        onClick={() => {
                          const el = document.getElementById(`msg-${msg.id}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                            setTimeout(() => {
                              el.style.backgroundColor = '';
                            }, 2000);
                          }
                          if (window.innerWidth < 768) setShowPinsPanel(false);
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition bg-emerald-950/40 px-2 py-1 rounded"
                      >
                        Jump to message
                      </button>
                      {(currentUser?.role === 'owner' || currentUser?.role === 'co-owner') && (
                        <button
                          onClick={() => onTogglePin(msg.id)}
                          title="Unpin message"
                          className="text-neutral-500 hover:text-red-400 p-1 rounded opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
