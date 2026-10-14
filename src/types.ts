export interface RolePermissions {
  canSee?: boolean;
  canType?: boolean;
  canReact?: boolean;
  canEmbed?: boolean;
  canPing?: boolean;
  canModerate?: boolean;
  canEditChannels?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  canMute?: boolean;
  canManageRoles?: boolean;
  canManageMessages?: boolean;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  iconUrl?: string;
  hoist?: boolean;
  permissions?: RolePermissions;
  isDefault?: boolean;
  position?: number;
}

export interface Server {
  id: string;
  name: string;
  icon?: string; // Emoji or URL
  ownerId: string;
  createdAt: number;
  description?: string;
  memberIds?: string[];
  inviteCode?: string;
  webhookUrl?: string;
}

export interface ChannelCategory {
  id: string;
  name: string;
  position?: number;
  serverId?: string;
  permissions?: {
    canView?: string[];
    canType?: string[];
    canConnect?: string[];
  };
  isPrivate?: boolean;
}

export function getHighestRole(user: User | null | undefined, roles: Role[]): Role | null {
  if (!user) return null;
  const userRoleIds = user.roleIds || user.assignedRoleIds || [];
  
  // Sort roles by position ascending (0 is top/highest priority) if position is defined
  const sortedRoles = [...roles].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  
  for (const role of sortedRoles) {
    if (userRoleIds.includes(role.id)) {
      return role;
    }
  }
  
  if (user.role && user.role !== 'member') {
    const matched = sortedRoles.find(r => r.name.toLowerCase() === user.role?.toLowerCase());
    if (matched) return matched;
  }
  
  return null;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  bannerUrl?: string;
  fontFamily?: string;
  bio?: string;
  statusText?: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  role?: 'member' | 'co-owner' | 'owner';
  roleIds?: string[];
  assignedRoleIds?: string[];
  blockedUserIds?: string[];
  friendIds?: string[];
  mutedUntil?: number;
  vcMutedUntil?: number;
  bannedUntil?: number;
  createdAt: number;
}

export interface ChannelPermissions {
  canView?: string[];
  canType?: string[];
  canReact?: string[];
  canEmbed?: string[];
  canPing?: string[];
  canManageChannel?: string[];
  allowedRolesSee?: string[];
  allowedRolesType?: string[];
  allowedRolesReact?: string[];
  allowedRolesEmbed?: string[];
  allowedRolesPing?: string[];
  allowedRolesModerate?: string[];
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  isPrivate?: boolean;
  type?: 'text' | 'voice' | 'game';
  topic?: string;
  slowmodeMs?: number;
  permissions?: ChannelPermissions;
  categoryId?: string;
  createdAt: number;
  createdById: string;
  serverId?: string;
  webhookUrl?: string;
  discordChannelId?: string;
  discordAiEnabled?: boolean;
}

export interface DirectMessageConversation {
  id: string;
  user1Id: string;
  user2Id: string;
  user1: User;
  user2: User;
  isGroup?: boolean;
  name?: string;
  memberIds?: string[];
  members?: User[];
  createdAt: number;
  lastMessageAt: number;
}

export interface MessageReplySnippet {
  id: string;
  senderName: string;
  text: string;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'gif' | 'video' | 'audio';
  url: string;
  name?: string;
  size?: number;
  rawText?: string;
}

export interface SiteStyleRevision {
  revision: number;
  prompt: string;
  author: string;
  timestamp: number;
  css: string;
  themeConfig?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    accentColor?: string;
    borderRadius?: string;
    customVars?: Record<string, string>;
  };
}

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  mediaType?: 'youtube' | 'video' | 'audio' | 'image' | 'website';
  videoId?: string;
}

export interface Message {
  id: string;
  targetType: 'channel' | 'dm';
  targetId: string; // channelId or dmConversationId
  senderId: string;
  senderName: string;
  senderUsername?: string;
  senderAvatarColor: string;
  senderAvatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  text: string;
  attachments?: MessageAttachment[];
  replyTo?: MessageReplySnippet;
  reactions: Record<string, string[]>; // emoji -> array of userIds
  isPinned?: boolean;
  isEdited?: boolean;
  editedAt?: number;
  createdAt: number;
  timestamp?: number;
  updatedAt?: number;
}

export interface AutoModConfig {
  enabled?: boolean;
  filteredWords: string[];
  slowmodeMs: number;
  action: 'warn' | 'mute' | 'kick';
  spamThreshold?: number;
}

export interface AuthResponse {
  user: User;
  token: string;
  customToken?: string;
}

export type WsClientPayload =
  | { type: 'auth'; token: string }
  | { type: 'typing'; targetType: 'channel' | 'dm'; targetId: string }
  | { type: 'vc:join'; channelId: string; video?: boolean }
  | { type: 'vc:leave'; channelId: string }
  | { type: 'vc:signal'; targetUserId: string; signal: any; channelId: string }
  | { type: 'call:speaking'; channelId: string; isSpeaking: boolean }
  | { type: 'call:state'; channelId: string; hasVideo: boolean; isMuted: boolean }
  | { type: 'ping' };

export type WsServerPayload =
  | { type: 'init'; data: { onlineUserIds: string[]; siteShutdown?: boolean; version?: string; buildTime?: number } }
  | { type: 'version:new'; data: { version: string; buildTime: number } }
  | { type: 'message:new'; data: Message }
  | { type: 'message:update'; data: Message }
  | { type: 'message:reaction'; data: { messageId: string; reactions: Record<string, string[]> } }
  | { type: 'message:delete'; data: { messageId: string } }
  | { type: 'user:presence'; data: { userId: string; status: 'online' | 'away' | 'busy' | 'offline'; lastSeen: number } }
  | { type: 'user:typing'; data: { targetType: 'channel' | 'dm'; targetId: string; userId: string; username: string } }
  | { type: 'channel:created'; data: Channel }
  | { type: 'channel:updated'; data: Channel }
  | { type: 'channels:reordered'; data: Channel[] }
  | { type: 'channel:deleted'; data: { channelId: string } }
  | { type: 'category:created'; data: ChannelCategory }
  | { type: 'category:updated'; data: ChannelCategory }
  | { type: 'category:deleted'; data: { categoryId: string } }
  | { type: 'user:updated'; data: User }
  | { type: 'role:created'; data: Role }
  | { type: 'role:updated'; data: Role }
  | { type: 'roles:reordered'; data: Role[] }
  | { type: 'role:deleted'; data: { roleId: string } }
  | { type: 'automod:updated'; data: AutoModConfig }
  | { type: 'sitestyle:updated'; data: SiteStyleRevision }
  | { type: 'site:status'; data?: any; shutdown: boolean; shutdownBy?: string; releasedBy?: string }
  | { type: 'call:speaking'; data?: any; channelId: string; userId: string; isSpeaking: boolean }
  | { type: 'call:state'; data?: any; channelId: string; userId: string; hasVideo: boolean; isMuted: boolean }
  | { type: 'vc:participants'; data: { channelId: string; participants: string[]; callType?: 'audio' | 'video'; initiatorId?: string } }
  | { type: 'vc:user-joined'; data: { channelId: string; userId: string; callType?: 'audio' | 'video' } }
  | { type: 'vc:user-left'; data: { channelId: string; userId: string } }
  | { type: 'vc:room-status'; data: { channelId: string; participants: string[]; count: number; callType?: string } }
  | { type: 'vc:signal'; data: { fromUserId: string; signal: any; channelId: string } };

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  artworkUrl?: string;
  streamUrl: string;
  source?: 'itunes' | 'custom' | 'youtube';
}

export interface ChatNotification {
  id: string;
  type: 'mention' | 'unread_channel' | 'dm';
  channelId?: string;
  channelName?: string;
  dmId?: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatarColor?: string;
  senderAvatarUrl?: string;
  text: string;
  timestamp: number;
  isRead: boolean;
  mentionType?: 'direct' | 'everyone' | 'here' | 'role';
}

export interface FontOption {
  id: string;
  name: string;
  family: string;
  category: 'Cartoon' | 'Blocky' | 'Sci-Fi' | 'Display' | 'Clean';
  previewText?: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  // Clean & Modern
  { id: 'default', name: 'Plus Jakarta Sans (Default)', family: "'Plus Jakarta Sans', sans-serif", category: 'Clean' },
  { id: 'outfit', name: 'Outfit', family: "'Outfit', sans-serif", category: 'Clean' },
  { id: 'jetbrains', name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", category: 'Clean' },
  // Cartoon & Playful
  { id: 'fredoka', name: 'Fredoka (Cartoon Soft)', family: "'Fredoka', cursive, sans-serif", category: 'Cartoon' },
  { id: 'chewy', name: 'Chewy (Cartoon Bubbly)', family: "'Chewy', cursive, sans-serif", category: 'Cartoon' },
  { id: 'comic', name: 'Comic Neue (Casual Comic)', family: "'Comic Neue', cursive, sans-serif", category: 'Cartoon' },
  { id: 'bungee', name: 'Bungee (Retro Cartoon/Arcade)', family: "'Bungee', cursive, sans-serif", category: 'Cartoon' },
  // Blocky & Pixel / 8-Bit
  { id: 'silkscreen', name: 'Silkscreen (Pixel Crisp)', family: "'Silkscreen', monospace", category: 'Blocky' },
  { id: 'press-start', name: 'Press Start 2P (8-Bit Arcade)', family: "'Press Start 2P', monospace", category: 'Blocky' },
  { id: 'black-ops', name: 'Black Ops One (Military Stencil)', family: "'Black Ops One', cursive, sans-serif", category: 'Blocky' },
  { id: 'russo', name: 'Russo One (Heavy Russian Block)', family: "'Russo One', sans-serif", category: 'Blocky' },
  // Sci-Fi & Display
  { id: 'orbitron', name: 'Orbitron (Cyberpunk Sci-Fi)', family: "'Orbitron', sans-serif", category: 'Sci-Fi' },
  { id: 'righteous', name: 'Righteous (Retro Wave)', family: "'Righteous', cursive, sans-serif", category: 'Sci-Fi' },
  // Display & Expressive
  { id: 'bebas', name: 'Bebas Neue (Bold Impact)', family: "'Bebas Neue', sans-serif", category: 'Display' },
  { id: 'cinzel', name: 'Cinzel (Royal Serif)', family: "'Cinzel', serif", category: 'Display' },
  { id: 'marker', name: 'Permanent Marker (Graffiti)', family: "'Permanent Marker', cursive", category: 'Display' },
  { id: 'lobster', name: 'Lobster (Smooth Script)', family: "'Lobster', cursive", category: 'Display' },
];

