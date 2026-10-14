import type {
  User,
  Channel,
  ChannelCategory,
  DirectMessageConversation,
  Message,
  Role,
  AuthResponse,
  LinkPreviewData,
  MusicTrack,
  SiteStyleRevision,
  Server,
} from '../types.ts';

const TOKEN_KEY = 'chat_session_token';
const SAVED_ACCOUNTS_KEY = 'chat_saved_accounts';

export interface SavedAccount {
  user: User;
  token: string;
  savedAt: number;
  lastUsedAt: number;
}

export function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('chat_token');
    if (!raw) return null;
    // Keep only valid Base64 / Hex / JWT token characters to prevent DOMException:
    // "The string did not match the expected pattern."
    const clean = raw.trim().replace(/[^\w\.\-\=\/\+\~]/g, '');
    return clean || null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem('chat_token', token);
  } catch {
    // Ignore localStorage errors in restricted modes
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('chat_token');
  } catch {
    // Ignore
  }
}

export function getSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAccount(user: User, token: string) {
  try {
    if (!user || !token) return;
    const existing = getSavedAccounts().filter(
      (a) => a.user.id !== user.id && a.user.username.toLowerCase() !== user.username.toLowerCase()
    );
    const updated: SavedAccount[] = [
      {
        user,
        token,
        savedAt: Date.now(),
        lastUsedAt: Date.now(),
      },
      ...existing,
    ];
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('saved-accounts-updated'));
  } catch (err) {
    console.warn('Error saving account to local storage:', err);
  }
}

export function updateSavedAccountUser(user: User) {
  try {
    if (!user) return;
    const accounts = getSavedAccounts();
    const idx = accounts.findIndex(
      (a) => a.user.id === user.id || a.user.username.toLowerCase() === user.username.toLowerCase()
    );
    if (idx !== -1) {
      accounts[idx].user = { ...accounts[idx].user, ...user };
      accounts[idx].lastUsedAt = Date.now();
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
      window.dispatchEvent(new CustomEvent('saved-accounts-updated'));
    }
  } catch (err) {
    console.warn('Error updating saved account:', err);
  }
}

export function removeSavedAccount(userId: string) {
  try {
    const accounts = getSavedAccounts().filter((a) => a.user.id !== userId && a.user.username !== userId);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new CustomEvent('saved-accounts-updated'));
  } catch (err) {
    console.warn('Error removing saved account:', err);
  }
}

export function switchSavedAccount(userId: string): { user: User; token: string } | null {
  try {
    const accounts = getSavedAccounts();
    const target = accounts.find((a) => a.user.id === userId || a.user.username.toLowerCase() === userId.toLowerCase());
    if (!target) return null;
    setStoredToken(target.token);
    saveAccount(target.user, target.token);
    return { user: target.user, token: target.token };
  } catch {
    return null;
  }
}

async function fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = getStoredToken();
  if (token) {
    try {
      // Use X-Session-Token rather than Authorization: Bearer to avoid Google Cloud Run
      // proxy intercepting the Authorization header and rejecting it with 401 Malformed
      headers.set('X-Session-Token', token);
      headers.set('X-Chat-Token', token);
    } catch (e) {
      console.error('Failed to set session token header:', e);
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Sends HTTP-only cookie automatically
  });

  if (!res.ok) {
    let errorMsg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // Use fallback
    }
    if (res.status === 401) {
      clearStoredToken();
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  async getServers(): Promise<{ servers: Server[] }> {
    return fetchWithAuth<{ servers: Server[] }>('/api/servers', { method: 'GET' });
  },

  async createServer(data: { name: string; icon: string; description?: string }): Promise<{ server: Server }> {
    return fetchWithAuth<{ server: Server }>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateServer(id: string, data: { name?: string; icon?: string; description?: string }): Promise<{ server: Server }> {
    return fetchWithAuth<{ server: Server }>(`/api/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteServer(id: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/servers/${id}`, {
      method: 'DELETE',
    });
  },

  async getMe(): Promise<{ user: User | null; customToken?: string }> {
    const res = await fetchWithAuth<{ user: User | null; customToken?: string }>('/api/me', { method: 'GET' });
    if (res.user) {
      const token = getStoredToken();
      if (token) {
        saveAccount(res.user, token);
      }
    }
    return res;
  },

  async signup(data: { username: string; displayName?: string; password: string }): Promise<AuthResponse> {
    const res = await fetchWithAuth<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) {
      setStoredToken(res.token);
      if (res.user) {
        saveAccount(res.user, res.token);
      }
    }
    return res;
  },

  async login(data: { username: string; password: string }): Promise<AuthResponse> {
    const res = await fetchWithAuth<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) {
      setStoredToken(res.token);
      if (res.user) {
        saveAccount(res.user, res.token);
      }
    }
    return res;
  },

  async logout(): Promise<{ success: boolean }> {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
    } finally {
      clearStoredToken();
    }
    return { success: true };
  },

  async updateProfile(data: {
    displayName?: string;
    avatarColor?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    fontFamily?: string;
    bio?: string;
    statusText?: string;
    status?: 'online' | 'away' | 'busy' | 'offline';
  }): Promise<{ user: User }> {
    const res = await fetchWithAuth<{ user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (res.user) {
      updateSavedAccountUser(res.user);
    }
    return res;
  },

  async changePassword(data: { currentPassword?: string; newPassword: string }): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },


  async impersonate(target: string): Promise<AuthResponse> {
    const res = await fetchWithAuth<AuthResponse>('/api/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ target }),
    });
    if (res.token) {
      setStoredToken(res.token);
      if (res.user) {
        saveAccount(res.user, res.token);
      }
    }
    return res;
  },

  async getUsers(): Promise<{ users: User[] }> {
    return fetchWithAuth<{ users: User[] }>('/api/users', { method: 'GET' });
  },

  async getChannels(): Promise<{ channels: Channel[] }> {
    return fetchWithAuth<{ channels: Channel[] }>('/api/channels', { method: 'GET' });
  },

  async createChannel(data: { name: string; description?: string; topic?: string; type?: 'text' | 'voice'; categoryId?: string }): Promise<{ channel: Channel }> {
    return fetchWithAuth<{ channel: Channel }>('/api/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async reorderChannels(channelIds: string[]): Promise<{ channels: Channel[] }> {
    return fetchWithAuth<{ channels: Channel[] }>('/api/channels/reorder', {
      method: 'PUT',
      body: JSON.stringify({ channelIds }),
    });
  },

  async request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    return fetchWithAuth<T>(url, options);
  },

  async getCategories(): Promise<{ categories: import('../types.ts').ChannelCategory[] }> {
    return fetchWithAuth('/api/categories', { method: 'GET' });
  },

  async createCategory(name: string): Promise<{ category: import('../types.ts').ChannelCategory }> {
    return fetchWithAuth('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async editCategory(
    id: string,
    name: string,
    updates?: { permissions?: any; isPrivate?: boolean; syncChannels?: boolean }
  ): Promise<{ category: import('../types.ts').ChannelCategory }> {
    return fetchWithAuth(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, ...updates }),
    });
  },

  async deleteCategory(id: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`/api/categories/${id}`, { method: 'DELETE' });
  },

  async reorderRoles(roleIds: string[]): Promise<{ roles: Role[] }> {
    return fetchWithAuth<{ roles: Role[] }>('/api/roles/reorder', {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    });
  },

  async getChannelMessages(channelId: string): Promise<{ messages: Message[] }> {
    return fetchWithAuth<{ messages: Message[] }>(`/api/channels/${channelId}/messages`, { method: 'GET' });
  },

  async sendChannelMessage(
    channelId: string,
    text: string,
    replyTo?: { id: string; senderName: string; text: string },
    attachments?: Message['attachments']
  ): Promise<{ message: Message }> {
    return fetchWithAuth<{ message: Message }>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, replyTo, attachments }),
    });
  },

  async getDms(): Promise<{ dms: DirectMessageConversation[] }> {
    return fetchWithAuth<{ dms: DirectMessageConversation[] }>('/api/dms', { method: 'GET' });
  },

  async createDm(recipientUserId: string): Promise<{ dm: DirectMessageConversation }> {
    return fetchWithAuth<{ dm: DirectMessageConversation }>('/api/dms', {
      method: 'POST',
      body: JSON.stringify({ recipientUserId }),
    });
  },

  async createGroupDm(memberIds: string[], name?: string): Promise<{ dm: DirectMessageConversation }> {
    return fetchWithAuth<{ dm: DirectMessageConversation }>('/api/dms/group', {
      method: 'POST',
      body: JSON.stringify({ memberIds, name }),
    });
  },

  async toggleBlockUser(userId: string): Promise<{ blocked: boolean; user: User }> {
    return fetchWithAuth<{ blocked: boolean; user: User }>(`/api/users/${userId}/block`, {
      method: 'POST',
    });
  },

  async toggleFriend(userId: string): Promise<{ friend: boolean; user: User }> {
    return fetchWithAuth<{ friend: boolean; user: User }>(`/api/users/${userId}/friend`, {
      method: 'POST',
    });
  },

  async getDmMessages(dmId: string): Promise<{ messages: Message[] }> {
    return fetchWithAuth<{ messages: Message[] }>(`/api/dms/${dmId}/messages`, { method: 'GET' });
  },

  async sendDmMessage(
    dmId: string,
    text: string,
    replyTo?: { id: string; senderName: string; text: string },
    attachments?: Message['attachments']
  ): Promise<{ message: Message }> {
    return fetchWithAuth<{ message: Message }>(`/api/dms/${dmId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, replyTo, attachments }),
    });
  },

  async toggleReaction(messageId: string, emoji: string): Promise<{ message: Message }> {
    return fetchWithAuth<{ message: Message }>(`/api/messages/${messageId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  },

  async editMessage(messageId: string, text: string): Promise<{ message: Message }> {
    return fetchWithAuth<{ message: Message }>(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    });
  },

  async deleteMessage(messageId: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/messages/${messageId}`, {
      method: 'DELETE',
    });
  },

  async togglePin(messageId: string): Promise<{ message: Message }> {
    return fetchWithAuth<{ message: Message }>(`/api/messages/${messageId}/pin`, {
      method: 'POST',
    });
  },

  async reportMessage(messageId: string, reason?: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/messages/${messageId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async updateChannel(channelId: string, data: Partial<Channel>): Promise<{ channel: Channel }> {
    return fetchWithAuth<{ channel: Channel }>(`/api/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteChannel(channelId: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/channels/${channelId}`, {
      method: 'DELETE',
    });
  },

  async getRoles(): Promise<{ roles: any[] }> {
    return fetchWithAuth<{ roles: any[] }>('/api/roles', { method: 'GET' });
  },

  async createRole(data: { name: string; color?: string; iconUrl?: string; hoist?: boolean; permissions?: any }): Promise<{ role: any }> {
    return fetchWithAuth<{ role: any }>('/api/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateRole(roleId: string, data: any): Promise<{ role: any }> {
    return fetchWithAuth<{ role: any }>(`/api/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteRole(roleId: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/roles/${roleId}`, {
      method: 'DELETE',
    });
  },

  async assignRole(userId: string, roleId: string): Promise<{ success: boolean; user: User; role: any }> {
    return fetchWithAuth<{ success: boolean; user: User; role: any }>('/api/roles/assign', {
      method: 'POST',
      body: JSON.stringify({ userId, roleId }),
    });
  },

  async removeRole(userId: string, roleId: string): Promise<{ success: boolean; user: User; role: any }> {
    return fetchWithAuth<{ success: boolean; user: User; role: any }>('/api/roles/remove', {
      method: 'POST',
      body: JSON.stringify({ userId, roleId }),
    });
  },

  async getAutoMod(): Promise<{ automod: any }> {
    return fetchWithAuth<{ automod: any }>('/api/automod', { method: 'GET' });
  },

  async updateAutoMod(data: any): Promise<{ automod: any }> {
    return fetchWithAuth<{ automod: any }>('/api/automod', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async pingMod(reason?: string, channelName?: string): Promise<{ success: boolean; message: Message }> {
    return fetchWithAuth<{ success: boolean; message: Message }>('/api/ping-mod', {
      method: 'POST',
      body: JSON.stringify({ reason, channelName }),
    });
  },

  async getLinkPreview(url: string): Promise<LinkPreviewData> {
    return fetchWithAuth<LinkPreviewData>(`/api/link-preview?url=${encodeURIComponent(url)}`, { method: 'GET' });
  },

  async uploadFile(file: File): Promise<{ url: string; name: string; size: number; type: 'image' | 'video' | 'audio' | 'file' | 'gif' }> {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-Session-Token'] = token;
      headers['X-Chat-Token'] = token;
    }
    const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers,
      body: file,
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(`Upload failed (${res.status})`);
    }
    return res.json();
  },

  async downloadMedia(url: string): Promise<{ url: string; title: string }> {
    return fetchWithAuth<{ url: string; title: string }>(`/api/download-media?url=${encodeURIComponent(url)}`, { method: 'GET' });
  },

  async exportBackup(): Promise<any> {
    return fetchWithAuth<any>('/api/backup/export', { method: 'GET' });
  },

  async importBackup(data: any): Promise<{
    success: boolean;
    channelsCount: number;
    messagesCount: number;
    rolesCount: number;
    usersCount?: number;
    usersAdded?: number;
    usersUpdated?: number;
  }> {
    return fetchWithAuth('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async searchMusic(query: string): Promise<{ tracks: MusicTrack[] }> {
    return fetchWithAuth<{ tracks: MusicTrack[] }>(`/api/music/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
  },

  async getTrendingMusic(): Promise<{ tracks: MusicTrack[] }> {
    return fetchWithAuth<{ tracks: MusicTrack[] }>('/api/music/trending', { method: 'GET' });
  },

  async getSiteStyle(): Promise<{ style: SiteStyleRevision }> {
    return fetchWithAuth<{ style: SiteStyleRevision }>('/api/site-style', { method: 'GET' });
  },

  async joinServer(inviteCode: string): Promise<{ success: boolean; server: Server }> {
    return fetchWithAuth<{ success: boolean; server: Server }>('/api/servers/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  async inviteUserToServer(serverId: string, targetUserId: string): Promise<{ success: boolean; server: Server }> {
    return fetchWithAuth<{ success: boolean; server: Server }>(`/api/servers/${serverId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
  },

  async leaveServer(serverId: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/servers/${serverId}/leave`, {
      method: 'POST',
    });
  },

  async removeServerMember(serverId: string, userId: string): Promise<{ success: boolean }> {
    return fetchWithAuth<{ success: boolean }>(`/api/servers/${serverId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  async exportToDiscordWebhook(data: { webhookUrl?: string; channelId?: string; serverId?: string }): Promise<{ success: boolean; message: string }> {
    return fetchWithAuth<{ success: boolean; message: string }>('/api/export/discord', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getVersion(): Promise<{ version: string; buildTime: number }> {
    return fetchWithAuth<{ version: string; buildTime: number }>('/api/version', { method: 'GET' });
  },

  async getDiscordBotStatus(): Promise<any> {
    return fetchWithAuth<any>('/api/discord-bot/status', { method: 'GET' });
  },

  async configureDiscordBot(data: { botToken?: string; applicationId?: string; publicKey?: string }): Promise<any> {
    return fetchWithAuth<any>('/api/discord-bot/config', {
      method: 'POST',
      body: JSON.stringify({ token: data.botToken }),
    });
  },

  async executeDiscordBotCommand(commandOrObj: any, args?: any): Promise<any> {
    let command: string;
    let target: string;
    let reason: string | undefined;
    let duration: number | undefined;
    let channel: string | undefined;

    if (typeof commandOrObj === 'object' && commandOrObj !== null) {
      command = commandOrObj.command;
      target = commandOrObj.target || commandOrObj.user || commandOrObj.channel;
      reason = commandOrObj.reason || commandOrObj.message;
      duration = commandOrObj.duration || commandOrObj.duration_minutes;
      channel = commandOrObj.channel;
    } else {
      command = commandOrObj;
      target = args?.user || args?.channel || args?.target;
      reason = args?.reason || args?.message;
      duration = args?.duration || args?.duration_minutes;
      channel = args?.channel;
    }

    return fetchWithAuth<any>('/api/discord-bot/test-command', {
      method: 'POST',
      body: JSON.stringify({
        command,
        target,
        reason,
        duration,
        channel,
      }),
    });
  },

  async uploadAttachment(file: File): Promise<{ url: string; name: string; size: number; type: any }> {
    return this.uploadFile(file);
  },
};
