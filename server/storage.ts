import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sendDiscordWebhook } from './discordWebhook.ts';
import type {
  User,
  Channel,
  ChannelCategory,
  DirectMessageConversation,
  Message,
  Role,
  RolePermissions,
  MessageAttachment,
  Server,
} from '../src/types.ts';

interface StoredUser extends User {
  password: string; // encrypted
  passwordHash?: string;
  lastIp?: string;
}

interface StoredSession {
  token: string;
  userId: string;
  ip?: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
}

export interface AutoModConfig {
  filteredWords: string[];
  slowmodeMs: number;
  spamThreshold: number; // e.g. 5 msgs / 10s
  action: 'mute' | 'warn' | 'kick';
}

interface DatabaseSchema {
  users: StoredUser[];
  sessions: StoredSession[];
  channels: Channel[];
  categories?: ChannelCategory[];
  servers?: Server[];
  dms: DirectMessageConversation[];
  messages: Message[];
  roles: Role[];
  automod: AutoModConfig;
  bannedIps: string[];
  siteShutdown?: boolean;
  browserStates?: Record<string, { currentUrl: string; history: string[]; bookmarks: string[]; tabs: Array<{ id: string; url: string; title: string }>; activeTabId: string }>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'chat-store.json');

const AVATAR_COLORS = [
  '#2563eb', // blue
  '#0d9488', // teal
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#db2777', // pink
  '#475569', // slate
  '#4f46e5', // indigo
];

function getRandomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

const ALGORITHM = 'aes-256-gcm';
// Use a persistent key (in a real app, use environment variables)
const SECRET_KEY = crypto.scryptSync('keepchat-super-secret-key-12345', 'static-salt', 32);

export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

export function decryptPassword(encryptedHex: string): string {
  const buf = Buffer.from(encryptedHex, 'hex');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const encrypted = buf.slice(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

class ChatStorage {
  private startTime: number;
  private data: DatabaseSchema;
  
  private saveTimeout: NodeJS.Timeout | null = null;
  private isSaving = false;
  private hasPendingSave = false;

  constructor() {
    this.startTime = Date.now();
    this.data = this.load();
  }

  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  private load(): DatabaseSchema {
    const defaultRoles: Role[] = [
      {
        id: 'r-admin',
        name: 'Admin',
        color: '#ef4444',
        permissions: { canSee: true, canType: true, canReact: true, canEmbed: true, canPing: true, canModerate: true, canEditChannels: true },
      },
      {
        id: 'r-mod',
        name: 'Moderator',
        color: '#f59e0b',
        permissions: { canSee: true, canType: true, canReact: true, canEmbed: true, canPing: true, canModerate: true, canEditChannels: false },
      },
      {
        id: 'r-artist',
        name: 'Artist',
        color: '#8b5cf6',
        permissions: { canSee: true, canType: true, canReact: true, canEmbed: true, canPing: false, canModerate: false, canEditChannels: false },
      },
      {
        id: 'r-vip',
        name: 'VIP',
        color: '#10b981',
        permissions: { canSee: true, canType: true, canReact: true, canEmbed: true, canPing: true, canModerate: false, canEditChannels: false },
      },
    ];

    const defaultChannels: Channel[] = [
      {
        id: 'c-general',
        name: 'general',
        description: 'The main watering hole for everyone in the space',
        topic: 'Company updates, open discussions, and team syncs',
        createdAt: Date.now() - 86400000 * 7,
        createdById: 'system',
      },
      {
        id: 'c-dev-talk',
        name: 'dev-talk',
        description: 'Code snippets, tech breakthroughs, and system design',
        topic: 'TypeScript, architecture, optimizations, and questions',
        createdAt: Date.now() - 86400000 * 5,
        createdById: 'system',
      },
      {
        id: 'c-random',
        name: 'random',
        description: 'Casual thoughts, coffee breaks, memes, and fun banter',
        topic: 'Zero work talk allowed here!',
        createdAt: Date.now() - 86400000 * 4,
        createdById: 'system',
      },
      {
        id: 'c-music-and-vibes',
        name: 'music-and-vibes',
        description: 'Tracks to write code to, albums of the week, and synth jams',
        topic: 'Share whatever is currently on your headphones 🎧',
        createdAt: Date.now() - 86400000 * 3,
        createdById: 'system',
      },
      {
        id: 'c-reports',
        name: 'reports',
        description: 'Audit and moderation reports',
        topic: 'All moderation actions, audit trails, and security logs',
        createdAt: Date.now() - 86400000 * 2,
        createdById: 'system',
        isPrivate: true,
      },
      {
        id: 'c-browser',
        name: 'browser',
        description: 'Individual secure web browser routed via Oceania proxy (AU/NZ)',
        topic: 'Browse the web securely with individual user state and Oceania proxy routing 🌐🇦🇺',
        createdAt: Date.now() - 86400000 * 1,
        createdById: 'system',
      },
    ];

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: DatabaseSchema = JSON.parse(raw);
        if (!parsed.roles || parsed.roles.length === 0) {
          parsed.roles = defaultRoles;
        }
        if (!parsed.automod) {
          parsed.automod = { filteredWords: [], slowmodeMs: 0, spamThreshold: 5, action: 'warn' };
        }
        if (!parsed.bannedIps) {
          parsed.bannedIps = [];
        }
        // Remove all skribbl instances and changelog-1.5v from channels and roles
        parsed.channels = (parsed.channels || []).filter(
          (c) => c.id !== 'c-skribbl' && c.type !== 'game' && c.id !== 'c-changelog-1-5v' && c.name !== 'changelog-1.5v'
        );
        parsed.roles = (parsed.roles || []).filter((r) => r.id !== 'r-champion');

        if (!parsed.channels.some((c) => c.id === 'c-reports')) {
          parsed.channels.push({
            id: 'c-reports',
            name: 'reports',
            description: 'Audit and moderation reports',
            topic: 'All moderation actions, audit trails, and security logs',
            createdAt: Date.now(),
            createdById: 'system',
            isPrivate: true,
          });
        }

        if (!parsed.channels.some((c) => c.id === 'c-browser')) {
          parsed.channels.push({
            id: 'c-browser',
            name: 'browser',
            description: 'Individual secure web browser routed via Oceania proxy (AU/NZ)',
            topic: 'Browse the web securely with individual user state and Oceania proxy routing 🌐🇦🇺',
            createdAt: Date.now(),
            createdById: 'system',
          });
        }

        if (!parsed.categories || parsed.categories.length === 0) {
          parsed.categories = [
            { id: 'cat-text', name: 'Text Channels', position: 0, serverId: 's-default' },
            { id: 'cat-voice', name: 'Voice & Utilities', position: 1, serverId: 's-default' },
          ];
        }

        if (!parsed.servers || parsed.servers.length === 0) {
          parsed.servers = [
            {
              id: 's-default',
              name: 'Default Workspace',
              icon: '💬',
              ownerId: 'system',
              createdAt: Date.now(),
              description: 'The default communication server'
            }
          ];
        }

        parsed.channels.forEach(ch => {
          if (!ch.serverId) {
            ch.serverId = 's-default';
          }
        });

        if (parsed.categories) {
          parsed.categories.forEach(cat => {
            if (!cat.serverId) {
              cat.serverId = 's-default';
            }
          });
        }

        return parsed;
      }
    } catch (err) {
      console.error('Error loading database file, initializing defaults:', err);
    }

    const initial: DatabaseSchema = {
      users: [],
      sessions: [],
      channels: defaultChannels.map(c => ({ ...c, serverId: 's-default' })),
      categories: [
        { id: 'cat-text', name: 'Text Channels', position: 0, serverId: 's-default' },
        { id: 'cat-voice', name: 'Voice & Utilities', position: 1, serverId: 's-default' },
      ],
      servers: [
        {
          id: 's-default',
          name: 'Default Workspace',
          icon: '💬',
          ownerId: 'system',
          createdAt: Date.now(),
          description: 'The default communication server'
        }
      ],
      dms: [],
      messages: [],
      roles: defaultRoles,
      automod: { filteredWords: [], slowmodeMs: 0, spamThreshold: 5, action: 'warn' },
      bannedIps: [],
    };

    this.saveImmediate(initial);
    return initial;
  }

  public saveImmediate(data: DatabaseSchema = this.data) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmp = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('Error synchronously saving database to file:', err);
    }
  }

  public save(data: DatabaseSchema = this.data) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      if (this.isSaving) {
        this.hasPendingSave = true;
        return;
      }
      this.isSaving = true;
      try {
        if (!fs.existsSync(DATA_DIR)) {
          await fs.promises.mkdir(DATA_DIR, { recursive: true });
        }
        const tmp = `${DB_FILE}.tmp`;
        const serialized = JSON.stringify(this.data);
        await fs.promises.writeFile(tmp, serialized, 'utf-8');
        await fs.promises.rename(tmp, DB_FILE);
      } catch (err) {
        console.error('Error asynchronously saving database to file:', err);
      } finally {
        this.isSaving = false;
        if (this.hasPendingSave) {
          this.hasPendingSave = false;
          this.save();
        }
      }
    }, 200);
  }

  public sanitizeUser(user: StoredUser): User {
    const { password, ...rest } = user;
    return rest;
  }

  public resetUserPassword(username: string): string {
    const user = this.findUserByUsername(username);
    if (!user) throw new Error('User not found.');
    const newPassword = crypto.randomBytes(8).toString('hex');
    user.password = encryptPassword(newPassword);
    this.save();
    return newPassword;
  }

  public changePassword(userId: string, currentPassword: string | undefined, newPassword: string): boolean {
    const user = this.findUserById(userId);
    if (!user) throw new Error('User not found.');
    if (currentPassword && decryptPassword(user.password) !== currentPassword) {
      return false;
    }
    user.password = encryptPassword(newPassword);
    this.save();
    return true;
  }

  public findUserById(id: string): StoredUser | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public findUserByUsername(username: string): StoredUser | undefined {
    return this.data.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
  }

  public createUser(params: {
    username: string;
    displayName: string;
    password: string;
  }): { user: User; token: string } {
    const cleanUsername = params.username.trim();
    const lowerName = cleanUsername.toLowerCase();
    if (this.findUserByUsername(cleanUsername)) {
      throw new Error('A user with that username already exists.');
    }

    let role: 'member' | 'co-owner' | 'owner' = 'member';
    if (lowerName === 'kep') {
      role = 'owner';
    } else if (lowerName === 'oliverg') {
      role = 'co-owner';
    }

    const newUser: StoredUser = {
      id: `u-${crypto.randomBytes(6).toString('hex')}`,
      username: cleanUsername,
      displayName: params.displayName.trim() || cleanUsername,
      avatarColor: getRandomAvatarColor(),
      status: 'online',
      statusText: 'Available',
      role,
      createdAt: Date.now(),
      password: encryptPassword(params.password),
    };

    this.data.users.push(newUser);

    const token = this.createSession(newUser.id);
    this.save();

    return {
      user: this.sanitizeUser(newUser),
      token,
    };
  }

  public authenticate(username: string, password: string): { user: User; token: string } | null {
    const user = this.findUserByUsername(username);
    if (!user) return null;

    if (decryptPassword(user.password) !== password) {
      return null;
    }

    // Set online
    user.status = 'online';
    const token = this.createSession(user.id);
    this.save();

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  public createSession(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    // 1 year expiration - remembers user always
    const oneYear = 365 * 24 * 60 * 60 * 1000;

    const session: StoredSession = {
      token,
      userId,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + oneYear,
    };

    this.data.sessions.push(session);
    return token;
  }

  public validateSession(token: string): User | null {
    if (!token) return null;
    const sessionIndex = this.data.sessions.findIndex((s) => s.token === token);
    if (sessionIndex === -1) return null;

    const session = this.data.sessions[sessionIndex];
    if (Date.now() > session.expiresAt) {
      this.data.sessions.splice(sessionIndex, 1);
      this.save();
      return null;
    }

    // Refresh lastActiveAt and extend 1 year
    session.lastActiveAt = Date.now();
    session.expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;

    const user = this.findUserById(session.userId);
    if (!user) return null;

    return this.sanitizeUser(user);
  }

  public removeSession(token: string): void {
    const idx = this.data.sessions.findIndex((s) => s.token === token);
    if (idx !== -1) {
      this.data.sessions.splice(idx, 1);
      this.save();
    }
  }

  public updateUserProfile(
    userId: string,
    updates: {
      displayName?: string;
      avatarColor?: string;
      avatarUrl?: string;
      bannerUrl?: string;
      fontFamily?: string;
      bio?: string;
      statusText?: string;
      status?: 'online' | 'away' | 'busy' | 'offline';
    }
  ): User | null {
    const user = this.findUserById(userId);
    if (!user) return null;

    if (updates.displayName && updates.displayName.trim()) {
      user.displayName = updates.displayName.trim();
    }
    if (updates.avatarColor) {
      user.avatarColor = updates.avatarColor;
    }
    if (updates.avatarUrl !== undefined) {
      user.avatarUrl = updates.avatarUrl.trim();
    }
    if (updates.bannerUrl !== undefined) {
      const newBanner = updates.bannerUrl.trim();
      if (user.bannerUrl !== newBanner) {
        user.bannerUrl = newBanner;
        sendDiscordWebhook(`**${user.username}** changed their banner to: ${newBanner}`);
      }
    }
    if (updates.fontFamily !== undefined) {
      user.fontFamily = updates.fontFamily;
    }
    if (updates.bio !== undefined) {
      user.bio = updates.bio.trim();
    }
    if (updates.statusText !== undefined) {
      user.statusText = updates.statusText.trim();
    }
    if (updates.status) {
      user.status = updates.status;
    }

    // Update sender metadata across all existing messages so past messages immediately show the new avatar / name
    for (const msg of this.data.messages) {
      if (msg.senderId === userId) {
        if (updates.avatarUrl !== undefined) {
          msg.senderAvatarUrl = user.avatarUrl;
        }
        if (updates.avatarColor) {
          msg.senderAvatarColor = user.avatarColor;
        }
        if (updates.displayName) {
          msg.senderName = user.displayName;
        }
      }
    }

    this.save();
    return this.sanitizeUser(user);
  }

  public exportBackup(): {
    version: string;
    exportedAt: number;
    channels: Channel[];
    messages: Message[];
    roles: Role[];
    automod: AutoModConfig;
    users: User[];
    accounts: StoredUser[];
    sessions: StoredSession[];
    dms: DirectMessageConversation[];
  } {
    const allMessages = this.data.messages || [];
    const reportMessages = allMessages.filter((m) => m.targetId === 'c-reports');
    const normalMessages = allMessages.filter((m) => m.targetId !== 'c-reports');
    const recentReportMessages = reportMessages.slice(-15);
    const exportMessages = [...normalMessages, ...recentReportMessages];

    return {
      version: '4.0',
      exportedAt: Date.now(),
      channels: this.data.channels,
      messages: exportMessages,
      roles: this.data.roles,
      automod: this.data.automod,
      users: this.data.users.map((u) => this.sanitizeUser(u)),
      accounts: this.data.users, // Full account records including passwordHash, credentials, profiles
      sessions: this.data.sessions || [],
      dms: this.data.dms || [],
    };
  }

  public importBackup(payload: any, fallbackChannelId?: string): {
    channelsCount: number;
    messagesCount: number;
    rolesCount: number;
    usersCount: number;
    usersAdded: number;
    usersUpdated: number;
  } {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid backup data format');
    }

    // Unwrap nested objects if wrapped in data, backup, result, export, or payload
    let root = payload;
    if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) root = root.data;
    else if (root.backup && typeof root.backup === 'object' && !Array.isArray(root.backup)) root = root.backup;
    else if (root.payload && typeof root.payload === 'object' && !Array.isArray(root.payload)) root = root.payload;
    else if (root.export && typeof root.export === 'object' && !Array.isArray(root.export)) root = root.export;

    let importedChannels: any[] = [];
    let importedMessages: any[] = [];
    let importedRoles: any[] = [];
    let importedUsers: any[] = [];

    if (Array.isArray(root)) {
      if (root.length > 0) {
        if ('text' in root[0] || 'senderName' in root[0] || 'senderId' in root[0] || 'content' in root[0]) {
          importedMessages = root;
        } else if ('name' in root[0] && ('type' in root[0] || 'topic' in root[0] || 'id' in root[0])) {
          importedChannels = root;
        } else if ('username' in root[0]) {
          importedUsers = root;
        }
      }
    } else {
      if (Array.isArray(root.channels)) importedChannels = root.channels;
      else if (root.channels && typeof root.channels === 'object') importedChannels = Object.values(root.channels);

      if (Array.isArray(root.messages)) importedMessages = root.messages;
      else if (Array.isArray(root.chat)) importedMessages = root.chat;
      else if (Array.isArray(root.chats)) importedMessages = root.chats;
      else if (Array.isArray(root.history)) importedMessages = root.history;
      else if (root.messages && typeof root.messages === 'object') importedMessages = Object.values(root.messages);

      if (Array.isArray(root.roles)) importedRoles = root.roles;
      else if (root.roles && typeof root.roles === 'object') importedRoles = Object.values(root.roles);

      if (Array.isArray(root.accounts)) importedUsers = root.accounts;
      else if (Array.isArray(root.users)) importedUsers = root.users;
      else if (root.accounts && typeof root.accounts === 'object') importedUsers = Object.values(root.accounts);
      else if (root.users && typeof root.users === 'object') importedUsers = Object.values(root.users);
    }

    // Merge accounts and users
    let usersAdded = 0;
    let usersUpdated = 0;
    for (let i = 0; i < importedUsers.length; i++) {
      const u = importedUsers[i];
      if (!u || typeof u !== 'object') continue;
      const username = String(u.username || '').trim();
      if (!username) continue;

      const existingUser = this.findUserByUsername(username);
      if (existingUser) {
        if (u.displayName) existingUser.displayName = String(u.displayName).trim();
        if (u.avatarColor) existingUser.avatarColor = u.avatarColor;
        if (u.avatarUrl !== undefined) existingUser.avatarUrl = u.avatarUrl;
        if (u.bannerUrl !== undefined) existingUser.bannerUrl = u.bannerUrl;
        if (u.bio !== undefined) existingUser.bio = u.bio;
        if (u.fontFamily !== undefined) existingUser.fontFamily = u.fontFamily;
        if (u.statusText !== undefined) existingUser.statusText = u.statusText;
        if (Array.isArray(u.roleIds)) existingUser.roleIds = u.roleIds;
        if (Array.isArray(u.assignedRoleIds)) existingUser.assignedRoleIds = u.assignedRoleIds;
        if (Array.isArray(u.friendIds)) existingUser.friendIds = u.friendIds;
        if (Array.isArray(u.blockedUserIds)) existingUser.blockedUserIds = u.blockedUserIds;
        if (u.role === 'owner' || u.role === 'co-owner' || u.role === 'member') existingUser.role = u.role;
        if (u.passwordHash && typeof u.passwordHash === 'string' && u.passwordHash.includes(':')) {
          existingUser.passwordHash = u.passwordHash;
        }
        usersUpdated++;
      } else {
        const id = String(u.id || `u-${crypto.randomBytes(6).toString('hex')}`);
        let role: 'member' | 'co-owner' | 'owner' = u.role || 'member';
        const lowerName = username.toLowerCase();
        if (lowerName === 'kep') role = 'owner';
        else if (lowerName === 'oliverg') role = 'co-owner';

        const password =
          u.password && typeof u.password === 'string'
            ? u.password
            : encryptPassword('123456');

        const newUser: StoredUser = {
          id,
          username,
          displayName: u.displayName || username,
          avatarColor: u.avatarColor || getRandomAvatarColor(),
          avatarUrl: u.avatarUrl,
          bannerUrl: u.bannerUrl,
          fontFamily: u.fontFamily,
          bio: u.bio,
          status: 'offline',
          statusText: u.statusText || 'Available',
          role,
          roleIds: Array.isArray(u.roleIds) ? u.roleIds : [],
          assignedRoleIds: Array.isArray(u.assignedRoleIds) ? u.assignedRoleIds : [],
          friendIds: Array.isArray(u.friendIds) ? u.friendIds : [],
          blockedUserIds: Array.isArray(u.blockedUserIds) ? u.blockedUserIds : [],
          createdAt: typeof u.createdAt === 'number' ? u.createdAt : Date.now(),
          password,
        };
        this.data.users.push(newUser);
        usersAdded++;
      }
    }

    // Merge channels (preserve existing, add new or update)
    let channelsAdded = 0;
    for (let i = 0; i < importedChannels.length; i++) {
      const ch = importedChannels[i];
      if (!ch || typeof ch !== 'object') continue;
      const rawName = String(ch.name || `channel-${i + 1}`).trim();
      const name = rawName.replace(/^#/, '') || `channel-${i + 1}`;
      const id = String(ch.id || `c-${name.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now() + '-' + i}`);
      const type = ch.type || 'text';
      if (id === 'c-skribbl' || type === 'game') continue;

      const channelObj: Channel = {
        id,
        name,
        type: (type === 'voice' ? 'voice' : 'text'),
        topic: ch.topic || '',
        description: ch.description || '',
        slowmodeMs: 0,
        permissions: ch.permissions,
        createdAt: typeof ch.createdAt === 'number' ? ch.createdAt : Date.now(),
        createdById: ch.createdById || 'user-owner',
      };

      const existingIdx = this.data.channels.findIndex((c) => c.id === id);
      if (existingIdx !== -1) {
        this.data.channels[existingIdx] = { ...this.data.channels[existingIdx], ...channelObj };
      } else {
        this.data.channels.push(channelObj);
        channelsAdded++;
      }
    }

    // Merge roles
    let rolesAdded = 0;
    for (let i = 0; i < importedRoles.length; i++) {
      const r = importedRoles[i];
      if (!r || typeof r !== 'object') continue;
      const name = String(r.name || `Role ${i + 1}`).trim();
      const id = String(r.id || `r-${Date.now()}-${i}`);
      if (id === 'r-champion') continue;

      const roleObj: Role = {
        id,
        name,
        color: r.color || '#3b82f6',
        permissions: r.permissions || {
          canSee: true,
          canType: true,
          canReact: true,
          canEmbed: true,
          canPing: true,
          canModerate: false,
          canEditChannels: false,
        },
      };

      const existingIdx = this.data.roles.findIndex((role) => role.id === id);
      if (existingIdx !== -1) {
        this.data.roles[existingIdx] = { ...this.data.roles[existingIdx], ...roleObj };
      } else {
        this.data.roles.push(roleObj);
        rolesAdded++;
      }
    }

    // Merge messages (avoid duplicate message IDs)
    const defaultChannelId = fallbackChannelId || (this.data.channels[0]?.id || 'c-general');
    let messagesAdded = 0;
    const existingMsgIds = new Set(this.data.messages.map((m) => m.id));
    for (let i = 0; i < importedMessages.length; i++) {
      const msg = importedMessages[i];
      if (!msg || typeof msg !== 'object') continue;
      const text = typeof msg.text === 'string' ? msg.text : (typeof msg.content === 'string' ? msg.content : '');
      const id = String(msg.id || `m-imported-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`);
      const targetId = String(msg.targetId || msg.channelId || defaultChannelId);
      const targetType = (msg.targetType === 'dm' ? 'dm' : 'channel');

      if (!existingMsgIds.has(id)) {
        const fullMsg: Message = {
          id,
          targetType,
          targetId,
          senderId: String(msg.senderId || 'user-imported'),
          senderName: String(msg.senderName || msg.author || msg.username || 'Imported User'),
          senderUsername: msg.senderUsername || msg.username || 'imported_user',
          senderAvatarColor: msg.senderAvatarColor || '#3b82f6',
          senderAvatarUrl: msg.senderAvatarUrl,
          text,
          attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
          reactions: msg.reactions && typeof msg.reactions === 'object' ? msg.reactions : {},
          isPinned: !!msg.isPinned,
          replyTo: msg.replyTo,
          createdAt: typeof msg.createdAt === 'number' ? msg.createdAt : (msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()),
        };
        this.data.messages.push(fullMsg);
        existingMsgIds.add(id);
        messagesAdded++;
      }
    }

    // Sort messages by createdAt
    this.data.messages.sort((a, b) => a.createdAt - b.createdAt);

    if (root.automod && Array.isArray(root.automod.filteredWords)) {
      this.data.automod = { ...root.automod, slowmodeMs: 0 };
    }

    // Merge sessions if present
    if (Array.isArray(root.sessions)) {
      if (!this.data.sessions) this.data.sessions = [];
      for (const s of root.sessions) {
        if (!s || !s.token || !s.userId) continue;
        if (!this.data.sessions.some((ex) => ex.token === s.token)) {
          this.data.sessions.push(s);
        }
      }
    }

    // Merge dms if present
    if (Array.isArray(root.dms)) {
      if (!this.data.dms) this.data.dms = [];
      for (const dm of root.dms) {
        if (!dm || !dm.id) continue;
        if (!this.data.dms.some((ex) => ex.id === dm.id)) {
          this.data.dms.push(dm);
        }
      }
    }

    this.saveImmediate();
    this.save();
    console.log(`Import backup completed and saved to ${DB_FILE}`);
    return {
      channelsCount: this.data.channels.length,
      messagesCount: this.data.messages.length,
      rolesCount: this.data.roles.length,
      usersCount: this.data.users.length,
      usersAdded,
      usersUpdated,
    };
  }

  public toggleFriend(requesterId: string, targetUserId: string): { friend: boolean; user: User } {
    const user = this.findUserById(requesterId);
    if (!user) throw new Error('User not found.');
    if (!user.friendIds) user.friendIds = [];

    const idx = user.friendIds.indexOf(targetUserId);
    let friend = false;
    if (idx > -1) {
      user.friendIds.splice(idx, 1);
      friend = false;
    } else {
      user.friendIds.push(targetUserId);
      friend = true;
    }
    this.save();
    return { friend, user: this.sanitizeUser(user) };
  }

  public getAllUsers(): User[] {
    const msgs = this.data.messages || [];

    let updated = false;
    for (const m of msgs) {
      if (!m.senderId) continue;
      const existing = this.data.users.find(
        (u) => u.id === m.senderId || (m.senderUsername && u.username.toLowerCase() === m.senderUsername.toLowerCase())
      );
      if (!existing) {
        const newUser: StoredUser = {
          id: m.senderId,
          username: m.senderUsername || m.senderName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          displayName: m.senderName,
          avatarColor: m.senderAvatarColor || '#3b82f6',
          avatarUrl: m.senderAvatarUrl,
          bannerUrl: m.bannerUrl,
          bio: m.bio,
          password: encryptPassword('123456'),
          status: 'offline',
          createdAt: m.createdAt || Date.now(),
        };
        this.data.users.push(newUser);
        updated = true;
      } else {
        if (m.senderAvatarUrl && !existing.avatarUrl) {
          existing.avatarUrl = m.senderAvatarUrl;
          updated = true;
        }
        if (m.bannerUrl && !existing.bannerUrl) {
          existing.bannerUrl = m.bannerUrl;
          updated = true;
        }
        if (m.bio && !existing.bio) {
          existing.bio = m.bio;
          updated = true;
        }
        if (m.senderName && (!existing.displayName || existing.displayName === existing.username)) {
          existing.displayName = m.senderName;
          updated = true;
        }
      }
    }
    if (updated) {
      this.save();
    }

    return this.data.users.map((u) => this.sanitizeUser(u));
  }

  public getChannels(): Channel[] {
    return this.data.channels;
  }

  public createChannel(params: {
    name: string;
    description?: string;
    topic?: string;
    createdById: string;
    type?: 'text' | 'voice';
    categoryId?: string;
    serverId?: string;
  }): Channel {
    const cleanName = params.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-');
    if (!cleanName) {
      throw new Error('Channel name is required and must contain alphanumeric characters.');
    }

    const serverId = params.serverId || 's-default';
    const existing = this.data.channels.find((c) => c.name === cleanName && (c.serverId || 's-default') === serverId);
    if (existing) {
      throw new Error(`A channel named #${cleanName} already exists in this server.`);
    }

    const newChannel: Channel = {
      id: `c-${crypto.randomBytes(5).toString('hex')}`,
      name: cleanName,
      description: params.description?.trim() || '',
      topic: params.topic?.trim() || '',
      createdAt: Date.now(),
      createdById: params.createdById,
      type: params.type || 'text',
      categoryId: params.categoryId,
      serverId: serverId,
    };

    this.data.channels.push(newChannel);
    this.save();
    return newChannel;
  }

  public getChannelById(id: string): Channel | undefined {
    return this.data.channels.find((c) => c.id === id);
  }

  public getUsers(): User[] {
    return this.data.users.map((u) => this.sanitizeUser(u));
  }

  public getChannelMessages(channelId: string): Message[] {
    return this.getMessages('channel', channelId);
  }

  public getMessages(targetType: 'channel' | 'dm', targetId: string): Message[] {
    return this.data.messages
      .filter((m) => m.targetType === targetType && m.targetId === targetId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public isSiteShutdown(): boolean {
    return Boolean(this.data.siteShutdown);
  }

  public setSiteShutdown(val: boolean): void {
    this.data.siteShutdown = val;
    this.save();
  }

  public createMessage(params: {
    targetType: 'channel' | 'dm';
    targetId: string;
    senderId: string;
    senderName: string;
    senderUsername?: string;
    senderAvatarColor: string;
    senderAvatarUrl?: string;
    text: string;
    replyTo?: { id: string; senderName: string; text: string };
    attachments?: MessageAttachment[];
  }): Message {
    const user = this.findUserById(params.senderId);
    const senderAvatarUrl = user?.avatarUrl || params.senderAvatarUrl;
    const senderAvatarColor = user?.avatarColor || params.senderAvatarColor || '#3b82f6';
    const senderName = user?.displayName || user?.username || params.senderName;
    const senderUsername = user?.username || params.senderUsername;
    const bannerUrl = user?.bannerUrl;
    const bio = user?.bio;

    const newMessage: Message = {
      id: `m-${crypto.randomBytes(6).toString('hex')}`,
      targetType: params.targetType,
      targetId: params.targetId,
      senderId: params.senderId,
      senderName,
      senderUsername,
      senderAvatarColor,
      senderAvatarUrl,
      bannerUrl,
      bio,
      text: params.text.trim(),
      attachments: params.attachments,
      replyTo: params.replyTo,
      reactions: {},
      createdAt: Date.now(),
    };

    this.data.messages.push(newMessage);

    // Send Discord webhook
    const isDev = process.env.NODE_ENV !== 'production';
    const devSuffix = isDev ? ' (dev)' : '';
    let content = `**${newMessage.senderName}${devSuffix}** (${newMessage.senderUsername}): ${newMessage.text}`;
    if (newMessage.attachments && newMessage.attachments.length > 0) {
      content += `\nAttachments: ${newMessage.attachments.map(a => a.url).join(', ')}`;
    }
    sendDiscordWebhook(content);

    // Forward to bridged Discord channel if configured
    if (params.targetType === 'channel' && !newMessage.senderId.startsWith('discord-') && !newMessage.senderId.startsWith('system-')) {
      const channel = this.getChannelById(params.targetId);
      if (channel && channel.discordChannelId) {
        import('./discordBot.ts').then(({ discordBot }) => {
          discordBot.sendDirectChannelMessage(channel.discordChannelId!, newMessage);
        }).catch(err => {
          console.error('[Storage] Failed to forward message to Discord channel:', err);
        });
      }
    }

    // If it's a DM, update lastMessageAt on the DM conversation
    if (params.targetType === 'dm') {
      const dm = this.data.dms.find((d) => d.id === params.targetId);
      if (dm) {
        dm.lastMessageAt = Date.now();
      }
    }

    this.save();
    return newMessage;
  }

  public getMessageById(messageId: string): Message | undefined {
    return this.data.messages.find((m) => m.id === messageId);
  }

  public toggleReaction(messageId: string, userId: string, emoji: string): Message | null {
    const msg = this.data.messages.find((m) => m.id === messageId);
    if (!msg) return null;

    if (!msg.reactions) {
      msg.reactions = {};
    }

    const currentList = msg.reactions[emoji] || [];
    const index = currentList.indexOf(userId);

    if (index > -1) {
      // Remove reaction
      currentList.splice(index, 1);
      if (currentList.length === 0) {
        delete msg.reactions[emoji];
      } else {
        msg.reactions[emoji] = currentList;
      }
    } else {
      // Add reaction
      currentList.push(userId);
      msg.reactions[emoji] = currentList;
    }

    this.save();
    return msg;
  }

  public togglePinMessage(messageId: string, requesterUserId: string): Message | null {
    const msg = this.data.messages.find((m) => m.id === messageId);
    if (!msg) return null;

    const requester = this.findUserById(requesterUserId);
    const isOwner = requester?.role === 'owner' || requester?.role === 'co-owner';
    if (!isOwner) {
      throw new Error('Only owners and co-owners can pin messages.');
    }

    msg.isPinned = !msg.isPinned;
    this.save();
    return msg;
  }
  public findMessageById(messageId: string): Message | undefined {
    return this.data.messages.find(m => m.id === messageId);
  }

  public editMessage(messageId: string, newText: string, requesterUserId: string): Message | null {
    const msg = this.data.messages.find((m) => m.id === messageId);
    if (!msg) return null;

    if (msg.senderId !== requesterUserId) {
      throw new Error('You can only edit your own messages.');
    }

    const trimmed = (newText || '').trim();
    if (!trimmed) {
      throw new Error('Message text cannot be empty.');
    }

    if (this.data.automod) {
      const lower = trimmed.toLowerCase();
      const hasFiltered = (this.data.automod.filteredWords || []).some(
        (w) => w && lower.includes(w.toLowerCase())
      );
      if (hasFiltered) {
        throw new Error('Message contains prohibited language.');
      }
    }

    msg.text = trimmed;
    msg.isEdited = true;
    msg.editedAt = Date.now();
    this.save();
    return msg;
  }


  public deleteMessage(messageId: string, requesterUserId: string): boolean {
    const idx = this.data.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;

    const msg = this.data.messages[idx];
    const requester = this.findUserById(requesterUserId);
    
    if (requesterUserId !== 'system') {
      const isOwner = requester?.role === 'owner' || requester?.role === 'co-owner';
      if (!isOwner && msg.senderId !== requesterUserId) {
        throw new Error('Not authorized to delete this message.');
      }
    }

    this.data.messages.splice(idx, 1);
    this.save();
    return true;
  }

  public clearChannelHistory(channelId: string): Message[] {
    const msgs = this.data.messages.filter((m) => m.targetId === channelId);
    for (const msg of msgs) {
      this.deleteMessage(msg.id, 'system');
    }
    return msgs;
  }

  public purgeMessages(channelId: string, count: number): Message[] {
    const msgs = this.getMessages('channel', channelId);
    const msgsToDelete = msgs.slice(-count);
    for (const msg of msgsToDelete) {
      this.deleteMessage(msg.id, 'system');
    }
    return msgsToDelete;
  }

  public getOrCreateDm(userAId: string, userBId: string): DirectMessageConversation {
    const existing = this.data.dms.find(
      (d) =>
        (d.user1Id === userAId && d.user2Id === userBId) ||
        (d.user1Id === userBId && d.user2Id === userAId)
    );

    const userA = this.findUserById(userAId);
    const userB = this.findUserById(userBId);
    if (!userA || !userB) {
      throw new Error('Both users must exist to create a direct message conversation.');
    }

    if (existing) {
      existing.user1 = this.sanitizeUser(userA);
      existing.user2 = this.sanitizeUser(userB);
      return existing;
    }

    const newDm: DirectMessageConversation = {
      id: `dm-${crypto.randomBytes(6).toString('hex')}`,
      user1Id: userAId,
      user2Id: userBId,
      user1: this.sanitizeUser(userA),
      user2: this.sanitizeUser(userB),
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    };

    this.data.dms.push(newDm);
    this.save();
    return newDm;
  }

  public getUserDms(userId: string): DirectMessageConversation[] {
    const dms = this.data.dms.filter((d) => d.user1Id === userId || d.user2Id === userId);
    return dms
      .map((d) => {
        const u1 = this.findUserById(d.user1Id);
        const u2 = this.findUserById(d.user2Id);
        return {
          ...d,
          user1: u1 ? this.sanitizeUser(u1) : d.user1,
          user2: u2 ? this.sanitizeUser(u2) : d.user2,
        };
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  // --- Roles & Moderation ---
  public getRoles(): Role[] {
    return this.data.roles;
  }

  public findRoleByNameOrId(query: string): Role | undefined {
    const clean = query.trim().replace(/^@/, '').toLowerCase();
    return this.data.roles.find(
      (r) => r.id.toLowerCase() === clean || r.name.toLowerCase() === clean
    );
  }

  public findUserByIdOrUsername(query: string): StoredUser | undefined {
    const clean = query.trim().replace(/^@/, '').toLowerCase();
    let user = this.data.users.find(
      (u) =>
        u.id.toLowerCase() === clean ||
        u.username.toLowerCase() === clean ||
        (u.displayName && u.displayName.toLowerCase() === clean)
    );
    if (!user) {
      // Search in saved message history across channels and DMs
      for (const chId of Object.keys(this.data.channels || {})) {
        const msgs = this.data.channels[chId] || [];
        const foundMsg = msgs.find(
          (m) =>
            m.senderId.toLowerCase() === clean ||
            (m.senderUsername && m.senderUsername.toLowerCase() === clean) ||
            m.senderName.toLowerCase() === clean
        );
        if (foundMsg) {
          user = {
            id: foundMsg.senderId,
            username: foundMsg.senderUsername || foundMsg.senderName.toLowerCase().replace(/\s+/g, '_'),
            displayName: foundMsg.senderName,
            avatarColor: foundMsg.senderAvatarColor || '#3b82f6',
            avatarUrl: foundMsg.senderAvatarUrl,
            bannerUrl: foundMsg.bannerUrl,
            bio: foundMsg.bio,
            password: encryptPassword('123456'),
            status: 'offline',
            createdAt: foundMsg.createdAt || Date.now(),
          };
          this.data.users.push(user);
          this.save();
          break;
        }
      }
    }
    return user;
  }

  public createRole(name: string, color: string, permissions?: RolePermissions): Role {
    const cleanName = name.trim().replace(/^@/, '');
    const newRole: Role = {
      id: `r-${crypto.randomBytes(4).toString('hex')}`,
      name: cleanName,
      color: color || '#3b82f6',
      permissions: permissions || {
        canSee: true,
        canType: true,
        canReact: true,
        canEmbed: true,
        canPing: false,
        canModerate: false,
        canEditChannels: false,
      },
    };
    this.data.roles.push(newRole);
    this.save();
    return newRole;
  }

  public renameRole(query: string, newName: string): Role | null {
    const role = this.findRoleByNameOrId(query);
    if (!role) return null;
    role.name = newName.trim().replace(/^@/, '');
    this.save();
    return role;
  }

  public deleteRole(query: string): boolean {
    const role = this.findRoleByNameOrId(query);
    if (!role) return false;
    this.data.roles = this.data.roles.filter((r) => r.id !== role.id);
    // Remove role from all users
    this.data.users.forEach((u) => {
      if (u.roleIds) {
        u.roleIds = u.roleIds.filter((id) => id !== role.id);
      }
    });
    this.save();
    return true;
  }

  public updateRole(id: string, updates: Partial<Role>): Role | null {
    const role = this.data.roles.find((r) => r.id === id);
    if (!role) return null;
    if (updates.name) role.name = updates.name.trim().replace(/^@/, '');
    if (updates.color) role.color = updates.color;
    if (updates.permissions) {
      role.permissions = { ...role.permissions, ...updates.permissions };
    }
    this.save();
    return role;
  }

  public assignRole(userIdOrName: string, roleNameOrId: string): { user: User; role: Role } | null {
    const user = this.findUserByIdOrUsername(userIdOrName);
    const role = this.findRoleByNameOrId(roleNameOrId);
    if (!user || !role) return null;
    if (!user.roleIds) user.roleIds = [];
    if (!user.roleIds.includes(role.id)) {
      user.roleIds.push(role.id);
      this.save();
    }
    return { user: this.sanitizeUser(user), role };
  }

  public removeRole(userIdOrName: string, roleNameOrId: string): { user: User; role: Role } | null {
    const user = this.findUserByIdOrUsername(userIdOrName);
    const role = this.findRoleByNameOrId(roleNameOrId);
    if (!user || !role || !user.roleIds) return null;
    user.roleIds = user.roleIds.filter((id) => id !== role.id);
    this.save();
    return { user: this.sanitizeUser(user), role };
  }

  public setUserIp(userId: string, ip: string): void {
    const user = this.findUserById(userId);
    if (user && ip) {
      user.lastIp = ip;
      this.save();
    }
  }

  public getUserIp(userId: string): string {
    const user = this.findUserById(userId);
    return user?.lastIp || '127.0.0.1';
  }

  public isIpBanned(ip: string): boolean {
    if (!ip) return false;
    return (this.data.bannedIps || []).includes(ip);
  }

  public muteUser(targetId: string, durationMinutes = 10): { success: boolean; mutedUntil: number } {
    const user = this.findUserById(targetId);
    if (!user) return { success: false, mutedUntil: 0 };
    const mutedUntil = Date.now() + durationMinutes * 60 * 1000;
    user.mutedUntil = mutedUntil;
    this.save();
    return { success: true, mutedUntil };
  }

  public unmuteUser(targetId: string): boolean {
    const user = this.findUserById(targetId);
    if (!user) return false;
    delete user.mutedUntil;
    this.save();
    return true;
  }

  public vcMuteUser(targetId: string, durationMinutes = 15): { success: boolean; vcMutedUntil: number } {
    const user = this.findUserById(targetId);
    if (!user) return { success: false, vcMutedUntil: 0 };
    const vcMutedUntil = Date.now() + durationMinutes * 60 * 1000;
    user.vcMutedUntil = vcMutedUntil;
    this.save();
    return { success: true, vcMutedUntil };
  }

  public vcUnmuteUser(targetId: string): boolean {
    const user = this.findUserById(targetId);
    if (!user) return false;
    delete user.vcMutedUntil;
    this.save();
    return true;
  }

  public kickUser(targetId: string): boolean {
    const user = this.findUserById(targetId);
    if (!user) return false;
    // Expire all active sessions for this user
    this.data.sessions = this.data.sessions.filter((s) => s.userId !== targetId);
    user.status = 'offline';
    this.save();
    return true;
  }

  public banUser(targetId: string, durationMinutes?: number): { success: boolean; bannedUntil?: number } {
    const user = this.findUserById(targetId);
    if (!user) return { success: false };
    const bannedUntil = durationMinutes ? Date.now() + durationMinutes * 60 * 1000 : Date.now() + 365 * 24 * 60 * 60 * 1000;
    user.bannedUntil = bannedUntil;
    this.kickUser(targetId);
    this.save();
    return { success: true, bannedUntil };
  }

  public ipBanUser(targetId: string, durationMinutes?: number): { success: boolean; ip: string; bannedUntil?: number } {
    const user = this.findUserById(targetId);
    if (!user) return { success: false, ip: 'unknown' };
    const ip = user.lastIp || '127.0.0.1';
    if (!this.data.bannedIps) this.data.bannedIps = [];
    if (!this.data.bannedIps.includes(ip)) {
      this.data.bannedIps.push(ip);
    }
    const banRes = this.banUser(targetId, durationMinutes);
    this.save();
    return { success: true, ip, bannedUntil: banRes.bannedUntil };
  }

  public logToReports(text: string, senderName = 'Moderator Bot'): Message {
    return this.createMessage({
      targetType: 'channel',
      targetId: 'c-reports',
      senderId: 'system-bot',
      senderName,
      senderAvatarColor: '#dc2626',
      text,
    });
  }

  public getAutoMod(): AutoModConfig {
    return this.data.automod;
  }

  public updateAutoMod(config: Partial<AutoModConfig>): AutoModConfig {
    this.data.automod = { ...this.data.automod, ...config };
    this.save();
    return this.data.automod;
  }

  public updateChannel(channelId: string, updates: Partial<Channel>): Channel | null {
    const channel = this.getChannelById(channelId);
    if (!channel) return null;
    if (updates.name) {
      channel.name = updates.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
    }
    if (updates.description !== undefined) channel.description = updates.description.trim();
    if (updates.topic !== undefined) channel.topic = updates.topic.trim();
    if (updates.slowmodeMs !== undefined) channel.slowmodeMs = updates.slowmodeMs;
    if (updates.permissions !== undefined) channel.permissions = updates.permissions;
    if (updates.categoryId !== undefined) channel.categoryId = updates.categoryId;
    this.save();
    return channel;
  }

  public deleteChannel(channelId: string): boolean {
    const idx = this.data.channels.findIndex(c => c.id === channelId);
    if (idx === -1) return false;
    this.data.channels.splice(idx, 1);
    this.save();
    return true;
  }

  public reorderChannels(orderedChannelIds: string[]): Channel[] {
    const channelMap = new Map(this.data.channels.map(c => [c.id, c]));
    const newChannels: Channel[] = [];
    for (const id of orderedChannelIds) {
      const ch = channelMap.get(id);
      if (ch) {
        newChannels.push(ch);
        channelMap.delete(id);
      }
    }
    for (const ch of channelMap.values()) {
      newChannels.push(ch);
    }
    this.data.channels = newChannels;
    this.save();
    return this.data.channels;
  }

  public reorderRoles(orderedRoleIds: string[]): Role[] {
    const roleMap = new Map(this.data.roles.map(r => [r.id, r]));
    const newRoles: Role[] = [];
    for (const id of orderedRoleIds) {
      const r = roleMap.get(id);
      if (r) {
        newRoles.push(r);
        roleMap.delete(id);
      }
    }
    for (const r of roleMap.values()) {
      newRoles.push(r);
    }
    this.data.roles = newRoles;
    this.save();
    return this.data.roles;
  }

  public getCategories(): ChannelCategory[] {
    if (!this.data.categories) {
      this.data.categories = [
        { id: 'cat-text', name: 'Text Channels', position: 0 },
        { id: 'cat-voice', name: 'Voice & Utilities', position: 1 },
      ];
      this.save();
    }
    return this.data.categories;
  }

  public createCategory(name: string, serverId?: string): ChannelCategory {
    const clean = name.trim();
    if (!clean) throw new Error('Category name cannot be empty');
    if (!this.data.categories) {
      this.data.categories = [];
    }
    const finalServerId = serverId || 's-default';
    const newCat: ChannelCategory = {
      id: `cat-${crypto.randomBytes(4).toString('hex')}`,
      name: clean,
      position: this.data.categories.length,
      serverId: finalServerId,
    };
    this.data.categories.push(newCat);
    this.save();
    return newCat;
  }

  public deleteCategory(id: string): boolean {
    if (!this.data.categories) return false;
    const idx = this.data.categories.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.data.categories.splice(idx, 1);
    // Unassign category from channels
    this.data.channels.forEach(ch => {
      if (ch.categoryId === id) {
        delete ch.categoryId;
      }
    });
    this.save();
    return true;
  }

  public updateCategory(
    id: string,
    name: string,
    updates?: { permissions?: any; isPrivate?: boolean; syncChannels?: boolean }
  ): ChannelCategory | null {
    if (!this.data.categories) return null;
    const cat = this.data.categories.find(c => c.id === id);
    if (!cat) return null;
    cat.name = name.trim();
    if (updates) {
      if (updates.permissions !== undefined) {
        cat.permissions = updates.permissions;
      }
      if (updates.isPrivate !== undefined) {
        cat.isPrivate = updates.isPrivate;
      }
      if (updates.syncChannels) {
        this.data.channels.forEach((ch) => {
          if (ch.categoryId === id) {
            if (!ch.permissions) ch.permissions = {};
            if (updates.permissions?.canView) {
              ch.permissions.canView = [...updates.permissions.canView];
              ch.permissions.allowedRolesSee = [...updates.permissions.canView];
            }
            if (updates.permissions?.canType) {
              ch.permissions.canType = [...updates.permissions.canType];
              ch.permissions.allowedRolesType = [...updates.permissions.canType];
            }
            if (updates.isPrivate !== undefined) {
              ch.isPrivate = updates.isPrivate;
            }
          }
        });
      }
    }
    this.save();
    return cat;
  }

  public createGroupDm(creatorId: string, memberIds: string[], name?: string): DirectMessageConversation {
    const uniqueIds = Array.from(new Set([creatorId, ...memberIds]));
    const users = uniqueIds
      .map((id) => this.findUserById(id))
      .filter((u): u is StoredUser => Boolean(u))
      .map((u) => this.sanitizeUser(u));

    if (users.length < 2) {
      throw new Error('A group chat requires at least 2 members.');
    }

    const groupName = name?.trim() || users.map((u) => u.displayName || u.username).slice(0, 3).join(', ') + (users.length > 3 ? '...' : '');

    const newGroupDm: DirectMessageConversation = {
      id: `gdm-${crypto.randomBytes(6).toString('hex')}`,
      user1Id: creatorId,
      user2Id: uniqueIds[1] || creatorId,
      user1: users[0],
      user2: users[1] || users[0],
      isGroup: true,
      name: groupName,
      memberIds: uniqueIds,
      members: users,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    };

    this.data.dms.push(newGroupDm);
    this.save();
    return newGroupDm;
  }

  public toggleBlockUser(requesterId: string, targetUserId: string): { blocked: boolean; user: User } {
    const user = this.findUserById(requesterId);
    if (!user) throw new Error('User not found.');
    if (!user.blockedUserIds) user.blockedUserIds = [];

    const idx = user.blockedUserIds.indexOf(targetUserId);
    let blocked = false;
    if (idx > -1) {
      user.blockedUserIds.splice(idx, 1);
      blocked = false;
    } else {
      user.blockedUserIds.push(targetUserId);
      blocked = true;
    }
    this.save();
    return { blocked, user: this.sanitizeUser(user) };
  }

  public getUserBrowserState(userId: string) {
    if (!this.data.browserStates) {
      this.data.browserStates = {};
    }
    if (!this.data.browserStates[userId]) {
      this.data.browserStates[userId] = {
        currentUrl: 'https://www.google.com',
        history: ['https://www.google.com'],
        bookmarks: ['https://www.google.com', 'https://example.com', 'https://github.com', 'https://en.wikipedia.org'],
        tabs: [{ id: 't-1', url: 'https://www.google.com', title: 'Google (Oceania Proxy 🇦🇺)' }],
        activeTabId: 't-1',
      };
    }
    return this.data.browserStates[userId];
  }

  public updateUserBrowserState(userId: string, state: any) {
    if (!this.data.browserStates) {
      this.data.browserStates = {};
    }
    this.data.browserStates[userId] = {
      ...(this.data.browserStates[userId] || {}),
      ...state,
    };
    this.save();
    return this.data.browserStates[userId];
  }

  public clearUserBrowserState(userId: string) {
    if (!this.data.browserStates) {
      this.data.browserStates = {};
    }
    const freshTabId = `t-${Date.now()}`;
    const fresh = {
      currentUrl: 'https://en.wikipedia.org/wiki/Main_Page',
      history: ['https://en.wikipedia.org/wiki/Main_Page'],
      bookmarks: ['https://en.wikipedia.org', 'https://html.duckduckgo.com', 'https://github.com', 'https://example.com'],
      tabs: [{ id: freshTabId, url: 'https://en.wikipedia.org/wiki/Main_Page', title: 'Wikipedia' }],
      activeTabId: freshTabId,
    };
    this.data.browserStates[userId] = fresh;
    this.save();
    return fresh;
  }

  public getServers(): Server[] {
    if (!this.data.servers) {
      this.data.servers = [
        {
          id: 's-default',
          name: 'Default Workspace',
          icon: '💬',
          ownerId: 'system',
          createdAt: Date.now(),
          description: 'The default communication server',
          inviteCode: 'srv-default',
        }
      ];
      this.save();
    }

    // Ensure all servers have memberIds and inviteCode populated
    for (const s of this.data.servers) {
      if (s.id !== 's-default' && !s.memberIds) {
        s.memberIds = [s.ownerId];
      }
      if (!s.inviteCode) {
        s.inviteCode = `srv-${s.id.replace(/^s-/, '')}`;
      }
    }

    return this.data.servers;
  }

  public createServer(name: string, icon: string, description: string, ownerId: string): Server {
    if (!this.data.servers) {
      this.data.servers = [];
    }
    const serverId = `s-${crypto.randomBytes(4).toString('hex')}`;
    const inviteCode = `srv-${crypto.randomBytes(3).toString('hex')}`;
    const newServer: Server = {
      id: serverId,
      name: name.trim() || 'New Server',
      icon: icon.trim() || '🌐',
      description: description.trim(),
      ownerId,
      createdAt: Date.now(),
      memberIds: [ownerId],
      inviteCode,
    };
    this.data.servers.push(newServer);

    // Create default categories & channels for the new server
    if (!this.data.categories) this.data.categories = [];
    const textCatId = `cat-${crypto.randomBytes(4).toString('hex')}`;
    const voiceCatId = `cat-${crypto.randomBytes(4).toString('hex')}`;

    this.data.categories.push(
      { id: textCatId, name: 'Text Channels', position: 0, serverId },
      { id: voiceCatId, name: 'Voice Channels', position: 1, serverId }
    );

    this.data.channels.push(
      {
        id: `c-${crypto.randomBytes(5).toString('hex')}`,
        name: 'general',
        description: 'Welcome to your new server!',
        createdAt: Date.now(),
        createdById: ownerId,
        type: 'text',
        categoryId: textCatId,
        serverId
      },
      {
        id: `c-${crypto.randomBytes(5).toString('hex')}`,
        name: 'dev-talk',
        description: 'Code discussions',
        createdAt: Date.now(),
        createdById: ownerId,
        type: 'text',
        categoryId: textCatId,
        serverId
      },
      {
        id: `c-${crypto.randomBytes(5).toString('hex')}`,
        name: 'voice-lobby',
        description: 'Join this voice room to talk',
        createdAt: Date.now(),
        createdById: ownerId,
        type: 'voice',
        categoryId: voiceCatId,
        serverId
      }
    );

    this.save();
    return newServer;
  }

  public joinServerByInvite(codeOrId: string, userId: string): Server | null {
    if (!this.data.servers) return null;
    const cleanCode = codeOrId.trim().toLowerCase();
    const server = this.data.servers.find(s => s.id.toLowerCase() === cleanCode || (s.inviteCode && s.inviteCode.toLowerCase() === cleanCode));
    if (!server) return null;

    if (!server.memberIds) server.memberIds = [server.ownerId];
    if (!server.memberIds.includes(userId)) {
      server.memberIds.push(userId);
      this.save();
    }
    return server;
  }

  public inviteUserToServer(serverId: string, targetUserId: string, requesterId: string): Server | null {
    if (!this.data.servers) return null;
    const server = this.data.servers.find(s => s.id === serverId);
    if (!server) return null;

    if (!server.memberIds) server.memberIds = [server.ownerId];
    if (!server.memberIds.includes(targetUserId)) {
      server.memberIds.push(targetUserId);
      this.save();
    }
    return server;
  }

  public leaveServer(serverId: string, userId: string): boolean {
    if (serverId === 's-default') return false;
    if (!this.data.servers) return false;
    const server = this.data.servers.find(s => s.id === serverId);
    if (!server) return false;
    if (server.ownerId === userId) return false; // Owner cannot leave without deleting server

    if (server.memberIds) {
      server.memberIds = server.memberIds.filter(id => id !== userId);
      this.save();
    }
    return true;
  }

  public removeServerMember(serverId: string, targetUserId: string, requesterId: string): boolean {
    if (serverId === 's-default') return false;
    if (!this.data.servers) return false;
    const server = this.data.servers.find(s => s.id === serverId);
    if (!server) return false;

    if (server.memberIds) {
      server.memberIds = server.memberIds.filter(id => id !== targetUserId);
      this.save();
    }
    return true;
  }

  public updateServer(id: string, updates: { name?: string; icon?: string; description?: string; webhookUrl?: string }): Server | null {
    if (!this.data.servers) return null;
    const srv = this.data.servers.find(s => s.id === id);
    if (!srv) return null;
    if (updates.name !== undefined) srv.name = updates.name.trim();
    if (updates.icon !== undefined) srv.icon = updates.icon.trim();
    if (updates.description !== undefined) srv.description = updates.description.trim();
    if (updates.webhookUrl !== undefined) srv.webhookUrl = updates.webhookUrl.trim();
    this.save();
    return srv;
  }

  public deleteServer(id: string): boolean {
    if (id === 's-default') return false; // Prevent deleting default
    if (!this.data.servers) return false;
    const idx = this.data.servers.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this.data.servers.splice(idx, 1);

    // Delete associated channels, categories, and messages
    this.data.channels = this.data.channels.filter(c => c.serverId !== id);
    if (this.data.categories) {
      this.data.categories = this.data.categories.filter(cat => cat.serverId !== id);
    }
    this.data.messages = this.data.messages.filter(m => {
      if (m.targetType === 'channel') {
        const ch = this.getChannelById(m.targetId);
        return ch && ch.serverId !== id;
      }
      return true;
    });

    this.save();
    return true;
  }
}

export const chatStore = new ChatStorage();
