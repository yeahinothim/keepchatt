import fs from 'node:fs';
import path from 'node:path';
import type { User, Message, MessageAttachment } from '../src/types.ts';
import { chatStore } from './storage.ts';
import { siteStyleStore } from './siteStyleStore.ts';
import { geminiAi } from './groqAi.ts';
import { sendDiscordWebhook, sendDiscordWebhookFile } from './discordWebhook.ts';
import { discordBot } from './discordBot.ts';

export function canModerate(user: User): boolean {
  if (user.username.toLowerCase() === 'kep' || user.username.toLowerCase() === 'oliverg') return true;
  if (user.role === 'owner' || user.role === 'co-owner') return true;
  const roles = chatStore.getRoles();
  const userRoles = roles.filter((r) => (user.roleIds || []).includes(r.id));
  return userRoles.some((r) => r.permissions?.canModerate);
}

export function canEditChannels(user: User, channelId?: string): boolean {
  if (!user) return false;
  const username = user.username.toLowerCase();
  if (username === 'kep' || username === 'oliverg') return true;
  if (user.role === 'owner' || user.role === 'co-owner' || (user.role as string) === 'admin' || (user.role as string) === 'moderator') return true;
  const roles = chatStore.getRoles();
  const userRoles = roles.filter((r) => (user.roleIds || []).includes(r.id));
  if (userRoles.some((r) => r.permissions?.canEditChannels || r.permissions?.canModerate)) return true;

  if (channelId) {
    const channel = chatStore.getChannelById(channelId);
    if (channel?.permissions?.canManageChannel) {
      const allowed = channel.permissions.canManageChannel;
      if (allowed.includes('*')) return true;
      if (userRoles.some((r) => allowed.includes(r.id))) return true;
    }
  }

  return false;
}

export function isOwnerOrCoOwner(user: User): boolean {
  const username = user.username.toLowerCase();
  return username === 'kep' || username === 'oliverg' || user.role === 'owner' || user.role === 'co-owner';
}

function parseDurationMinutes(str?: string): number {
  if (!str) return 10;
  const clean = str.toLowerCase().replace(/^(?:for|duration:)\s*/i, '').trim();
  const match = clean.match(/^(\d+)\s*([mhd]?)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'm' || !unit) return num;
    if (unit === 'h') return num * 60;
    if (unit === 'd') return num * 1440;
  }
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 10 : parsed;
}

function extractTargetAndDuration(argsWithoutWhy: string[]): {
  targetQuery: string;
  durationMinutes?: number;
} {
  let targetQuery = '';
  let durationMinutes: number | undefined;

  for (let i = 0; i < argsWithoutWhy.length; i++) {
    const arg = argsWithoutWhy[i];
    if (/^duration:/i.test(arg)) {
      const rest = arg.replace(/^duration:\s*/i, '').trim() || argsWithoutWhy[i + 1] || '';
      if (rest) durationMinutes = parseDurationMinutes(rest);
      if (!arg.replace(/^duration:\s*/i, '').trim() && argsWithoutWhy[i + 1]) i++;
    } else if (arg.toLowerCase() === 'for' && argsWithoutWhy[i + 1]) {
      durationMinutes = parseDurationMinutes(argsWithoutWhy[i + 1]);
      i++;
    } else if (!targetQuery) {
      targetQuery = arg;
    } else if (durationMinutes === undefined && /^(\d+[mhd]?)$/i.test(arg)) {
      durationMinutes = parseDurationMinutes(arg);
    }
  }

  return { targetQuery, durationMinutes };
}

const customCommands: Record<string, string> = {};

export async function handleSlashCommand(
  text: string,
  user: User,
  channelId: string,
  broadcast: (payload: any) => void,
  attachments?: MessageAttachment[]
): Promise<{
  handled: boolean;
  error?: string;
  responseMessage?: Message;
  switchSession?: { token: string; user: User };
} | null> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const restOfMessage = trimmed.slice(command.length + 2).trim();

  // Extract optional why:
  const whyMatch = trimmed.match(/why:\s*(.*)$/i);
  const whyReason = whyMatch ? whyMatch[1].trim() : 'No reason provided';
  const textBeforeWhy = trimmed.replace(/why:\s*.*$/i, '').trim();
  const argsWithoutWhy = textBeforeWhy.slice(command.length + 2).trim().split(/\s+/).filter(Boolean);

  // 00. /login @user (fast login / impersonate exclusively for kep / keps client for testing)
  if (command === 'login') {
    const requester = user.username.toLowerCase();
    if (requester !== 'kep' && requester !== 'keps') {
      return {
        handled: true,
        error: "Permission denied: /login is only permitted from kep's client.",
      };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /login @user' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    const token = chatStore.createSession(target.id);
    const sanitized = chatStore.sanitizeUser(target);

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Session Manager',
      senderAvatarColor: '#10b981',
      text: `🔑 **Switched session to @${target.username}** (${target.displayName}) for testing.\n• User ID: \`${target.id}\`\n• Role: \`${target.role || 'member'}\``,
    });
    broadcast({ type: 'message:new', data: sysMsg });

    return {
      handled: true,
      responseMessage: sysMsg,
      switchSession: { token, user: sanitized },
    };
  }

  // 0. Owner Lockdown / Maintenance Commands
  if (command === 'shutdown') {
    if (!isOwnerOrCoOwner(user)) {
      return { handled: true, error: 'Only owners (kep, oliverg) can shut down the workspace.' };
    }
    chatStore.setSiteShutdown(true);
    const logText = `🚨 **[EMERGENCY SHUTDOWN]** The site has been temporarily **SHUT DOWN** for maintenance by **${user.displayName}** (@${user.username}). Regular members cannot access until /release is run.`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'site:status', shutdown: true, shutdownBy: user.displayName });
    return { handled: true, responseMessage: logMsg };
  }

  if (command === 'release') {
    if (!isOwnerOrCoOwner(user)) {
      return { handled: true, error: 'Only owners (kep, oliverg) can release the workspace.' };
    }
    chatStore.setSiteShutdown(false);
    const logText = `🟢 **[SITE RELEASED]** The workspace has been **RELEASED** back to all members by **${user.displayName}** (@${user.username})! Regular members may now access and chat.`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'site:status', shutdown: false, releasedBy: user.displayName });
    return { handled: true, responseMessage: logMsg };
  }

  // 0.1 /version command (Anyone can use)
  if (command === 'version') {
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System Version',
      senderAvatarColor: '#3b82f6',
      text: `ℹ️ **[KeepChat Platform Version]**\n• **Core Engine:** \`v5.3.1-release\`\n• **AI Architecture:** LLaMA 3.2 3B Instruct (Primary, Server-side)\n• **Integrated Services:** Discord Gateway v10 Bidirectional Bridge, Audio & Media Attachments\n• **System Status:** 🟢 All systems operational`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // Custom Commands Hook
  if (customCommands[command]) {
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Command Bot',
      senderAvatarColor: '#a855f7',
      text: customCommands[command],
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // /createcmd command response
  if (command === 'createcmd') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to create commands.' };
    }
    const trigger = argsWithoutWhy[0];
    const response = argsWithoutWhy.slice(1).join(' ');
    if (!trigger || !response) {
      return { handled: true, error: 'Usage: /createcmd <command_name> <response>' };
    }
    customCommands[trigger] = response;
    
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#10b981',
      text: `✅ Created custom command: **/${trigger}**`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // /clearhistory
  if (command === 'clearhistory') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to clear history.' };
    }
    const messages = chatStore.clearChannelHistory(channelId);
    for (const msg of messages) {
      broadcast({ type: 'message:delete', data: { messageId: msg.id } });
    }
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Moderator Bot',
      senderAvatarColor: '#f43f5e',
      text: `🧹 **[History Cleared]** ${messages.length} messages were cleared by ${user.displayName}.`,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // /purge (num)
  if (command === 'purge') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to purge messages.' };
    }
    const num = parseInt(argsWithoutWhy[0], 10);
    if (isNaN(num) || num <= 0) {
      return { handled: true, error: 'Usage: /purge <number>' };
    }
    const messages = chatStore.purgeMessages(channelId, num);
    for (const msg of messages) {
      broadcast({ type: 'message:delete', data: { messageId: msg.id } });
    }
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Moderator Bot',
      senderAvatarColor: '#f43f5e',
      text: `🚮 **[Purge]** ${messages.length} messages were purged by ${user.displayName}.`,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // /deletecmd command response
  if (command === 'deletecmd') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to delete commands.' };
    }
    const trigger = argsWithoutWhy[0];
    if (!customCommands[trigger]) {
      return { handled: true, error: `Command /${trigger} does not exist.` };
    }
    delete customCommands[trigger];
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#10b981',
      text: `🗑️ Deleted custom command: **/${trigger}**`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // /bot: on or /bot: off (or /bot on / /bot off / /bot:on / /bot:off)
  const isBotCmd = command === 'bot' || command === 'bot:' || command === 'bot:on' || command === 'bot:off';
  if (isBotCmd) {
    if (!canModerate(user)) {
      return { handled: true, error: 'Permission denied: Only moderators and owners can toggle bot hosting.' };
    }

    let action = '';
    if (command === 'bot:on') {
      action = 'on';
    } else if (command === 'bot:off') {
      action = 'off';
    } else {
      action = (argsWithoutWhy[0] || '').toLowerCase().trim();
    }

    if (action !== 'on' && action !== 'off') {
      return { handled: true, error: 'Usage: /bot: on or /bot: off' };
    }

    if (action === 'on') {
      discordBot.start();
      const sysMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channelId,
        senderId: 'system-bot',
        senderName: 'Bot Hosting Controller',
        senderAvatarColor: '#10b981',
        text: `🤖 **[Bot Hosting Enabled]** The Discord Bot service has been **started** by **${user.displayName}** (@${user.username})!`,
      });
      broadcast({ type: 'message:new', data: sysMsg });
      return { handled: true, responseMessage: sysMsg };
    } else {
      discordBot.disconnect();
      const sysMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channelId,
        senderId: 'system-bot',
        senderName: 'Bot Hosting Controller',
        senderAvatarColor: '#f43f5e',
        text: `🤖 **[Bot Hosting Disabled]** The Discord Bot service has been **stopped** by **${user.displayName}** (@${user.username})!`,
      });
      broadcast({ type: 'message:new', data: sysMsg });
      return { handled: true, responseMessage: sysMsg };
    }
  }

  if (command === 'mute') {

    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to mute members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /mute @user [duration] [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    // Determine duration
    let durationArg = argsWithoutWhy[1];
    if (durationArg && durationArg.toLowerCase() === 'for') {
      durationArg = argsWithoutWhy[2];
    }
    const durationMinutes = parseDurationMinutes(durationArg);
    const muteRes = chatStore.muteUser(target.id, durationMinutes);
    const targetIp = chatStore.getUserIp(target.id);

    const logText = `🔇 **[MOD ACTION] Mute**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Duration:** ${durationMinutes} minutes\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}\n• **User IP:** \`${targetIp}\``;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: chatStore.sanitizeUser(target) });

    return { handled: true, responseMessage: logMsg };
  }

  // 2. /unmute @user [why: reason]
  if (command === 'unmute') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to unmute members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /unmute @user [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    chatStore.unmuteUser(target.id);
    const targetIp = chatStore.getUserIp(target.id);
    const logText = `🔊 **[MOD ACTION] Unmute**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}\n• **User IP:** \`${targetIp}\``;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: chatStore.sanitizeUser(target) });

    return { handled: true, responseMessage: logMsg };
  }

  // 3. /vcmute @user [duration] [why: reason]
  if (command === 'vcmute') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to voice mute members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /vcmute @user [duration] [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    const durationMinutes = parseDurationMinutes(argsWithoutWhy[1]);
    chatStore.vcMuteUser(target.id, durationMinutes);
    const targetIp = chatStore.getUserIp(target.id);
    const logText = `🎙️❌ **[MOD ACTION] Voice Mute**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Duration:** ${durationMinutes} minutes\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}\n• **User IP:** \`${targetIp}\``;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: chatStore.sanitizeUser(target) });

    return { handled: true, responseMessage: logMsg };
  }

  // 4. /vcunmute @user [why: reason]
  if (command === 'vcunmute') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to voice unmute members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /vcunmute @user [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    chatStore.vcUnmuteUser(target.id);
    const targetIp = chatStore.getUserIp(target.id);
    const logText = `🎙️✅ **[MOD ACTION] Voice Unmute**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}\n• **User IP:** \`${targetIp}\``;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: chatStore.sanitizeUser(target) });

    return { handled: true, responseMessage: logMsg };
  }

  // 5. /kick @user [why: reason]
  if (command === 'kick') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to kick members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /kick @user [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    const targetIp = chatStore.getUserIp(target.id);
    chatStore.kickUser(target.id);
    const logText = `👢 **[MOD ACTION] Kick**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}\n• **User IP:** \`${targetIp}\``;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:presence', data: { userId: target.id, status: 'offline', lastSeen: Date.now() } });

    return { handled: true, responseMessage: logMsg };
  }

  // 6. /ban @user [duration:] [why: reason]
  if (command === 'ban') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to ban members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /ban @user [duration] [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    const durationMinutes = argsWithoutWhy[1] ? parseDurationMinutes(argsWithoutWhy[1]) : undefined;
    const targetIp = chatStore.getUserIp(target.id);
    chatStore.banUser(target.id, durationMinutes);

    const durStr = durationMinutes ? `${durationMinutes} minutes` : 'Permanent';
    const logText = `⛔ **[MOD ACTION] Ban**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Duration:** ${durStr}\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}\n• **User IP:** \`${targetIp}\``;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:presence', data: { userId: target.id, status: 'offline', lastSeen: Date.now() } });

    return { handled: true, responseMessage: logMsg };
  }

  // 7. /ipban @user [duration:] [why: reason]
  if (command === 'ipban') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to IP ban members.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /ipban @user [duration] [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }

    const durationMinutes = argsWithoutWhy[1] ? parseDurationMinutes(argsWithoutWhy[1]) : undefined;
    const ipRes = chatStore.ipBanUser(target.id, durationMinutes);

    const durStr = durationMinutes ? `${durationMinutes} minutes` : 'Permanent';
    const logText = `🛑 **[MOD ACTION] IP Ban**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Banned IP:** \`${ipRes.ip}\`\n• **Duration:** ${durStr}\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:presence', data: { userId: target.id, status: 'offline', lastSeen: Date.now() } });

    return { handled: true, responseMessage: logMsg };
  }

  // 8. /createrole or /newrole @role [colour: #hex or color]
  if (command === 'createrole' || command === 'newrole') {
    if (!canEditChannels(user)) {
      return { handled: true, error: 'You do not have permission to create roles.' };
    }
    const roleMatch = trimmed.match(/^\/(?:createrole|newrole)\s+@?([a-zA-Z0-9_\s-]+?)(?:\s+(?:colour|color):\s*([#a-zA-Z0-9]+)|\s+([#a-zA-Z0-9]+))?$/i);
    const roleName = roleMatch ? roleMatch[1].trim() : argsWithoutWhy[0];
    const roleColor = roleMatch ? (roleMatch[2] || roleMatch[3] || '#3b82f6') : (argsWithoutWhy[1] || '#3b82f6');

    if (!roleName) {
      return { handled: true, error: 'Usage: /createrole @role colour: #hex' };
    }

    const newRole = chatStore.createRole(roleName, roleColor);
    const logText = `✨ **[Role Created]** Role **@${newRole.name}** was created by **${user.displayName}** (Color: \`${newRole.color}\`)`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'role:created', data: newRole });

    return { handled: true, responseMessage: logMsg };
  }

  // 9. /renamerole @originalrolename @newrolename
  if (command === 'renamerole') {
    if (!canEditChannels(user)) {
      return { handled: true, error: 'You do not have permission to rename roles.' };
    }
    const oldName = argsWithoutWhy[0];
    const newName = argsWithoutWhy[1];
    if (!oldName || !newName) {
      return { handled: true, error: 'Usage: /renamerole @oldName @newName' };
    }

    const updated = chatStore.renameRole(oldName, newName);
    if (!updated) {
      return { handled: true, error: `Could not find role "${oldName}".` };
    }

    const logText = `🏷️ **[Role Renamed]** Role **@${oldName.replace(/^@/, '')}** was renamed to **@${updated.name}** by **${user.displayName}**`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'role:updated', data: updated });

    return { handled: true, responseMessage: logMsg };
  }

  // 10. /deleterole @role
  if (command === 'deleterole') {
    if (!canEditChannels(user)) {
      return { handled: true, error: 'You do not have permission to delete roles.' };
    }
    const roleQuery = argsWithoutWhy[0];
    if (!roleQuery) {
      return { handled: true, error: 'Usage: /deleterole @role' };
    }

    const role = chatStore.findRoleByNameOrId(roleQuery);
    if (!role) {
      return { handled: true, error: `Could not find role "${roleQuery}".` };
    }

    chatStore.deleteRole(role.id);
    const logText = `🗑️ **[Role Deleted]** Role **@${role.name}** was deleted by **${user.displayName}**`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'role:deleted', data: { roleId: role.id } });

    return { handled: true, responseMessage: logMsg };
  }

  // 11. /give @user @role [why: reason]
  if (command === 'give') {
    if (!canEditChannels(user)) {
      return { handled: true, error: 'You do not have permission to assign roles.' };
    }
    const targetUser = argsWithoutWhy[0];
    const targetRole = argsWithoutWhy[1];
    if (!targetUser || !targetRole) {
      return { handled: true, error: 'Usage: /give @user @role [why: reason]' };
    }

    const res = chatStore.assignRole(targetUser, targetRole);
    if (!res) {
      return { handled: true, error: `Could not find user "${targetUser}" or role "${targetRole}".` };
    }

    const logText = `🎖️ **[Role Assigned]** **${user.displayName}** gave role **@${res.role.name}** to **${res.user.displayName}** (@${res.user.username})\n• **Reason:** ${whyReason}`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: res.user });

    return { handled: true, responseMessage: logMsg };
  }

  // 12. /remove @user @role [why: reason]
  if (command === 'remove') {
    if (!canEditChannels(user)) {
      return { handled: true, error: 'You do not have permission to remove roles.' };
    }
    const targetUser = argsWithoutWhy[0];
    const targetRole = argsWithoutWhy[1];
    if (!targetUser || !targetRole) {
      return { handled: true, error: 'Usage: /remove @user @role [why: reason]' };
    }

    const res = chatStore.removeRole(targetUser, targetRole);
    if (!res) {
      return { handled: true, error: `Could not find user "${targetUser}" or role "${targetRole}".` };
    }

    const logText = `⚠️ **[Role Removed]** **${user.displayName}** removed role **@${res.role.name}** from **${res.user.displayName}** (@${res.user.username})\n• **Reason:** ${whyReason}`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: res.user });

    return { handled: true, responseMessage: logMsg };
  }

  // 13. /automod
  if (command === 'automod') {
    const automod = chatStore.getAutoMod();
    const infoText = `🛡️ **AutoMod Configuration**\n• **Filtered Words (${automod.filteredWords.length}):** ${automod.filteredWords.slice(0, 10).join(', ') || 'None'}\n• **Slowmode:** ${automod.slowmodeMs ? `${automod.slowmodeMs / 1000}s` : 'Off'}\n• **Action:** \`${automod.action}\`\n• **Spam Threshold:** ${automod.spamThreshold} msgs / 10s\n\n_Tip: Type /automod in chat or open the AutoMod Panel from Channel Settings._`;
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'AutoMod Bot',
      senderAvatarColor: '#10b981',
      text: infoText,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // 14. /export
  if (command === 'export') {
    const backup = chatStore.exportBackup();
    const jsonStr = JSON.stringify(backup, null, 2);

    // If "github" argument is passed
    if (argsWithoutWhy[0]?.toLowerCase() === 'github') {
      // Find token and repo from arguments
      let customRepo = '';
      let customToken = '';
      const remainingArgs = argsWithoutWhy.slice(1);

      for (let i = 0; i < remainingArgs.length; i++) {
        const arg = remainingArgs[i];
        if (arg.toLowerCase() === 'repo' && remainingArgs[i + 1]) {
          customRepo = remainingArgs[i + 1];
          i++;
        } else if (arg.toLowerCase() === 'token' && remainingArgs[i + 1]) {
          customToken = remainingArgs[i + 1];
          i++;
        } else if (arg.startsWith('ghp_') || arg.startsWith('github_pat_')) {
          customToken = arg;
        } else if (arg.includes('/') && !arg.startsWith('http')) {
          customRepo = arg;
        } else if (!customToken && arg.length >= 30) {
          customToken = arg;
        }
      }

      const token = customToken || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
      const repo = customRepo || process.env.GITHUB_REPO;

      if (!token) {
        const errMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channelId,
          senderId: 'system-bot',
          senderName: 'GitHub Backup Bot',
          senderAvatarColor: '#24292f',
          text: `⚠️ **GitHub Token Required**\nTo export the workspace database directly to GitHub, please provide a GitHub Personal Access Token (PAT) with \`gist\` or \`repo\` scope:\n\n• **Export as GitHub Gist:**\n  \`/export github token <ghp_yourToken>\`\n• **Export to a GitHub Repository:**\n  \`/export github repo <owner/repo> token <ghp_yourToken>\`\n\n_Tip: You can also set \`GITHUB_TOKEN\` (and optional \`GITHUB_REPO\`) in the workspace environment or use the "Export to GitHub" button in Profile Settings._`,
        });
        broadcast({ type: 'message:new', data: errMsg });
        return { handled: true, responseMessage: errMsg };
      }

      try {
        const errMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channelId,
          senderId: 'system-bot',
          senderName: 'GitHub Backup Bot',
          senderAvatarColor: '#ef4444',
          text: `❌ **GitHub Export Unavailable**\nThe GitHub export integration module has been removed.`,
        });
        broadcast({ type: 'message:new', data: errMsg });
        return { handled: true, responseMessage: errMsg };
      } catch (err: any) {
        const errMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channelId,
          senderId: 'system-bot',
          senderName: 'GitHub Backup Bot',
          senderAvatarColor: '#ef4444',
          text: `❌ **GitHub Export Failed:** ${err?.message || 'Unknown error'}`,
        });
        broadcast({ type: 'message:new', data: errMsg });
        return { handled: true, responseMessage: errMsg };
      }
    }

    // If "discord" argument is passed
    if (argsWithoutWhy[0]?.toLowerCase() === 'discord') {
      const customUrl = argsWithoutWhy.find((a) => a.includes('webhooks') || a.startsWith('http://') || a.startsWith('https://'));
      const channel = chatStore.getChannelById(channelId);
      const server = channel?.serverId ? chatStore.getServers().find(s => s.id === channel.serverId) : undefined;
      const targetUrl = customUrl || channel?.webhookUrl || server?.webhookUrl || process.env.DISCORD_WEBHOOK_URL;

      if (!targetUrl) {
        const errMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channelId,
          senderId: 'system-bot',
          senderName: 'Backup Manager',
          senderAvatarColor: '#ef4444',
          text: `⚠️ No Discord Webhook URL provided or configured.\nUsage: \`/export discord https://discord.com/api/webhooks/...\` or set Webhook URL in Channel Settings -> Integrations.`,
        });
        broadcast({ type: 'message:new', data: errMsg });
        return { handled: true, responseMessage: errMsg };
      }

      try {
        const fileBuffer = Buffer.from(jsonStr, 'utf-8');
        const fileName = `keepchat-backup-${Date.now()}.json`;
        const summary = `📦 **[Workspace Backup Exported to Discord]**\n• **Channels:** ${backup.channels?.length || 0}\n• **Messages:** ${backup.messages?.length || 0}\n• **Roles:** ${backup.roles?.length || 0}\n• **Accounts/Users:** ${backup.users?.length || 0}`;

        await sendDiscordWebhookFile(fileBuffer, fileName, summary, targetUrl);

        const sysMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channelId,
          senderId: 'system-bot',
          senderName: 'Backup Manager',
          senderAvatarColor: '#3b82f6',
          text: `✅ Workspace backup JSON file successfully uploaded & exported to Discord Webhook!`,
        });
        broadcast({ type: 'message:new', data: sysMsg });
        return { handled: true, responseMessage: sysMsg };
      } catch (err: any) {
        const sysMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channelId,
          senderId: 'system-bot',
          senderName: 'Backup Manager',
          senderAvatarColor: '#ef4444',
          text: `❌ Discord Webhook export failed: ${err?.message || 'Unknown error'}`,
        });
        broadcast({ type: 'message:new', data: sysMsg });
        return { handled: true, responseMessage: sysMsg };
      }
    }

    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const fileName = `keepchat-backup-${Date.now()}.json`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');

    const exportMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Backup Manager',
      senderAvatarColor: '#3b82f6',
      text: `📦 **[Workspace Backup Exported]**\n• **Channels:** ${backup.channels.length}\n• **Messages:** ${backup.messages.length}\n• **Roles:** ${backup.roles.length}\n• **Accounts/Users:** ${backup.users.length}\n• **Date:** ${new Date().toLocaleString()}\n\n💾 **[Download Backup File](/uploads/${fileName})** | **[Direct API Link](/api/backup/export)**\n_Keep this file safe! All accounts, passwords, messages, and channels are preserved. To restore on any updated site, use \`/import\` or the Import button._`,
      attachments: [
        {
          url: `/uploads/${fileName}`,
          name: fileName,
          size: Buffer.byteLength(jsonStr, 'utf-8'),
          type: 'file',
        },
      ],
    });
    broadcast({ type: 'message:new', data: exportMsg });
    return { handled: true, responseMessage: exportMsg };
  }

  // 14a. /clearcache or /clear-cache
  if (command === 'clearcache' || command === 'clear-cache') {
    chatStore.clearUserBrowserState(user.id);

    const isMod = canModerate(user);
    if (isMod && (argsWithoutWhy[0]?.toLowerCase() === 'all' || argsWithoutWhy[0]?.toLowerCase() === 'global')) {
      const allUsers = chatStore.getUsers();
      for (const u of allUsers) {
        chatStore.clearUserBrowserState(u.id);
      }
    }

    const clearMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System Maintenance',
      senderAvatarColor: '#10b981',
      text: `🧹 **[Cache Cleared Successfully]**\n• Browser proxy states, tabs, cookies, and search cache have been flushed.\n• Initialized clean navigation state.\n• If you experienced any "malformed request" errors, your browser gateway is now fully reset.`,
    });
    broadcast({ type: 'message:new', data: clearMsg });
    return { handled: true, responseMessage: clearMsg };
  }

  // 14b. /logs [#channel]
  if (command === 'logs') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to view system and channel logs.' };
    }

    const channelArg = argsWithoutWhy[0];
    if (channelArg) {
      const cleanName = channelArg.replace(/^[#<@!>]+/, '').trim().toLowerCase();
      const channels = chatStore.getChannels();
      const targetChannel = channels.find(
        (c) =>
          c.id.toLowerCase() === cleanName ||
          c.name.toLowerCase() === cleanName ||
          `c-${cleanName}` === c.id.toLowerCase()
      );

      if (!targetChannel) {
        return {
          handled: true,
          error: `Channel "${channelArg}" not found. Available: ${channels.map((c) => `#${c.name}`).slice(0, 8).join(', ')}`,
        };
      }

      const msgs = chatStore.getChannelMessages(targetChannel.id);
      const recent = msgs.slice(-15);
      const formatted =
        recent.length === 0
          ? '*(No messages in this channel yet)*'
          : recent
              .map((m) => {
                const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const text = (m.text || '').replace(/\n/g, ' ').slice(0, 100);
                return `• \`[${time}]\` **${m.senderName}**: ${text}`;
              })
              .join('\n');

      const logsMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channelId,
        senderId: 'system-bot',
        senderName: 'Log Viewer',
        senderAvatarColor: '#3b82f6',
        text: `📜 **[Channel Logs: #${targetChannel.name}]** (Last ${recent.length} messages):\n\n${formatted}`,
      });
      return { handled: true, responseMessage: logsMsg };
    }

    // Default: Moderation reports / audit logs
    const reportMsgs = chatStore.getChannelMessages('c-reports') || [];
    const recentReports = reportMsgs.slice(-12);
    const formatted =
      recentReports.length === 0
        ? '*(No recent moderation actions recorded in audit reports)*'
        : recentReports
            .map((m) => {
              const time = new Date(m.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const line = m.text.replace(/[\n\r]+/g, ' ').slice(0, 140);
              return `• \`[${time}]\` ${line}`;
            })
            .join('\n');

    const logsMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Audit Logger',
      senderAvatarColor: '#6366f1',
      text: `📋 **[Moderation & System Audit Logs]** (Last ${recentReports.length} entries):\n\n${formatted}\n\n💡 *Tip: View logs for a specific channel using \`/logs #channel\`.*`,
    });
    return { handled: true, responseMessage: logsMsg };
  }

  // 15. /import [json attachment, string, or URL]
  if (command === 'import') {
    let jsonContent: string | null = null;

    // 1. Check all attachments staged/uploaded from chat bar
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        try {
          if (att.rawText) {
            jsonContent = att.rawText;
            break;
          }
          if (att.url.startsWith('/uploads/')) {
            const fileName = decodeURIComponent(path.basename(att.url.split('?')[0]));
            const localPath = path.join(process.cwd(), 'data', 'uploads', fileName);
            if (fs.existsSync(localPath)) {
              jsonContent = fs.readFileSync(localPath, 'utf-8');
              if (jsonContent) break;
            }
          } else if (att.url.startsWith('data:')) {
            const base64Part = att.url.split(',')[1];
            if (base64Part) {
              jsonContent = Buffer.from(base64Part, 'base64').toString('utf-8');
              if (jsonContent) break;
            }
          } else if (att.url.startsWith('http://') || att.url.startsWith('https://')) {
            const res = await fetch(att.url);
            jsonContent = await res.text();
            if (jsonContent) break;
          }
        } catch (err) {
          console.warn('Failed to read attachment for /import:', err);
        }
      }
    }

    // 2. Check if rawData or filename is supplied in message text
    const rawData = trimmed.replace(/^\/import\s*/i, '').trim();
    if (!jsonContent && rawData) {
      if (rawData.toLowerCase().startsWith('text:')) {
        jsonContent = rawData.substring(5).trim();
      } else if (rawData.startsWith('http://') || rawData.startsWith('https://')) {
        try {
          const res = await fetch(rawData);
          jsonContent = await res.text();
        } catch (err: any) {
          return { handled: true, error: `Could not fetch backup from URL: ${err?.message}` };
        }
      } else if (rawData.startsWith('{') || rawData.startsWith('[')) {
        jsonContent = rawData;
      } else {
        // Check if rawData is a filename in data/uploads
        const possiblePath = path.join(process.cwd(), 'data', 'uploads', path.basename(rawData));
        if (fs.existsSync(possiblePath)) {
          try {
            jsonContent = fs.readFileSync(possiblePath, 'utf-8');
          } catch (err) {
            console.warn('Failed to read local path from rawData:', err);
          }
        }
      }
    }

    if (!jsonContent) {
      const infoMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channelId,
        senderId: 'system-bot',
        senderName: 'Backup Manager',
        senderAvatarColor: '#3b82f6',
        text: `📥 **[Workspace Import Instructions]**\n• **Attach a file**: Click the **+** button or drag-and-drop your \`.json\` backup file into the chat bar, then send \`/import\`!\n• **Direct JSON**: \`/import {"channels":[...], "messages":[...], "accounts":[...]}\`\n• **From URL**: \`/import https://example.com/backup.json\``,
      });
      return { handled: true, responseMessage: infoMsg };
    }

    try {
      let cleanJson = jsonContent.replace(/^\uFEFF/, '').trim();
      if (!cleanJson.startsWith('{') && !cleanJson.startsWith('[')) {
        return { 
          handled: true, 
          error: `Failed to import JSON file: The provided content is not valid JSON (starts with "${cleanJson.slice(0, 30)}..."). Please provide a valid JSON backup file or URL.` 
        };
      }
      let parsed = JSON.parse(cleanJson);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }

      const res = chatStore.importBackup(parsed, channelId);
      const logMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channelId,
        senderId: 'system-bot',
        senderName: 'Backup Manager',
        senderAvatarColor: '#10b981',
        text: `✅ **[Workspace Import Successful]**\n• **Restored Channels:** ${res.channelsCount}\n• **Restored Messages:** ${res.messagesCount}\n• **Restored Roles:** ${res.rolesCount}\n• **Restored Accounts:** ${res.usersCount} (${res.usersAdded} new, ${res.usersUpdated} updated)\n\nWorkspace channels, roles, user accounts, and message history have been successfully restored!`,
      });
      broadcast({ type: 'message:new', data: logMsg });
      broadcast({ type: 'workspace:imported', data: res });
      
      // Broadcast updated channels and roles to all clients
      const currentChannels = chatStore.getChannels();
      for (const ch of currentChannels) {
        broadcast({ type: 'channel:created', data: ch });
      }
      const currentRoles = chatStore.getRoles();
      for (const r of currentRoles) {
        broadcast({ type: 'role:created', data: r });
      }
      const currentUsers = chatStore.getAllUsers();
      for (const u of currentUsers) {
        broadcast({ type: 'user:updated', data: u });
      }

      return { handled: true, responseMessage: logMsg };
    } catch (err: any) {
      return { handled: true, error: `Failed to import JSON file: ${err?.message || 'Invalid JSON syntax'}` };
    }
  }

  // 16. /pingmod [why: reason]
  if (command === 'pingmod') {
    const logText = `🚨 **[MODERATOR ALERT]** **${user.displayName}** (@${user.username}) requested urgent moderator assistance in <#${channelId}>!\n• **Reason:** ${whyReason || restOfMessage || 'Help requested'}`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });

    const ackMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Reports Bot',
      senderAvatarColor: '#ef4444',
      text: `🚨 **Moderators have been alerted!** An alert was dispatched to the #reports channel.\n• **Reason:** ${whyReason || restOfMessage || 'No reason provided'}`,
    });
    broadcast({ type: 'message:new', data: ackMsg });
    return { handled: true, responseMessage: ackMsg };
  }

  // 17. /warn @user [why: reason]
  if (command === 'warn') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to issue warnings.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /warn @user [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }
    const logText = `⚠️ **[MOD ACTION] Warning Issued**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });

    const warnMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Moderation Shield',
      senderAvatarColor: '#f59e0b',
      text: `⚠️ **[Official Warning]** **${target.displayName}** (@${target.username}) has received an official warning from moderator **${user.displayName}**.\n• **Reason:** ${whyReason}`,
    });
    broadcast({ type: 'message:new', data: warnMsg });
    return { handled: true, responseMessage: warnMsg };
  }

  // 18. /unban @user [why: reason]
  if (command === 'unban') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to unban users.' };
    }
    const targetQuery = argsWithoutWhy[0];
    if (!targetQuery) {
      return { handled: true, error: 'Usage: /unban @user [why: reason]' };
    }
    const target = chatStore.findUserByIdOrUsername(targetQuery);
    if (!target) {
      return { handled: true, error: `Could not find user "${targetQuery}".` };
    }
    target.bannedUntil = undefined;
    chatStore.save();

    const logText = `🛡️ **[MOD ACTION] Unban**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Reason:** ${whyReason}\n• **Moderator:** ${user.displayName}`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });
    broadcast({ type: 'user:updated', data: chatStore.sanitizeUser(target) });
    return { handled: true, responseMessage: logMsg };
  }

  // 19. /clear or /purge [count]
  if (command === 'clear' || command === 'purge') {
    if (!canModerate(user)) {
      return { handled: true, error: 'You do not have permission to purge messages.' };
    }
    const count = Math.min(100, Math.max(1, parseInt(argsWithoutWhy[0], 10) || 10));
    const channelMsgs = chatStore.getMessages('channel', channelId);
    const msgsToDelete = channelMsgs.slice(-count);

    for (const m of msgsToDelete) {
      chatStore.deleteMessage(m.id, 'system');
      broadcast({ type: 'message:deleted', data: { messageId: m.id } });
    }

    const logText = `🧹 **[Purge Action]** **${user.displayName}** purged **${msgsToDelete.length}** messages in <#${channelId}>`;
    const logMsg = chatStore.logToReports(logText);
    broadcast({ type: 'message:new', data: logMsg });

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#10b981',
      text: `🧹 Cleared **${msgsToDelete.length}** messages.`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // 20. /nick <new_name>
  if (command === 'nick') {
    const newNick = restOfMessage.trim();
    if (!newNick) {
      return { handled: true, error: 'Usage: /nick <Your New Display Name>' };
    }
    const updated = chatStore.updateUserProfile(user.id, { displayName: newNick });
    if (!updated) return { handled: true, error: 'Failed to update nickname.' };
    broadcast({ type: 'user:updated', data: updated });

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#6366f1',
      text: `✏️ **${user.displayName}** changed their nickname to **${updated.displayName}**`,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // 21. /roll [sides or expression]
  if (command === 'roll') {
    const arg = argsWithoutWhy[0] || '6';
    let sides = 6;
    let count = 1;
    if (arg.includes('d')) {
      const [cStr, sStr] = arg.split('d');
      count = Math.min(20, Math.max(1, parseInt(cStr, 10) || 1));
      sides = Math.min(1000, Math.max(2, parseInt(sStr, 10) || 6));
    } else {
      sides = Math.min(1000, Math.max(2, parseInt(arg, 10) || 6));
    }

    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }
    const total = rolls.reduce((a, b) => a + b, 0);
    const detail = count > 1 ? ` (${rolls.join(' + ')})` : '';

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarColor: user.avatarColor,
      senderAvatarUrl: user.avatarUrl,
      text: `🎲 **${user.displayName}** rolled **${total}**${detail} on ${count}d${sides}`,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // 22. /flip
  if (command === 'flip') {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarColor: user.avatarColor,
      senderAvatarUrl: user.avatarUrl,
      text: `🪙 **${user.displayName}** flipped a coin: **${result}**!`,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // 23. /shrug, /tableflip, /unflip
  if (command === 'shrug') {
    const textMsg = `${restOfMessage ? `${restOfMessage} ` : ''}¯\\_(ツ)_/¯`;
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarColor: user.avatarColor,
      senderAvatarUrl: user.avatarUrl,
      text: textMsg,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  if (command === 'tableflip') {
    const textMsg = `${restOfMessage ? `${restOfMessage} ` : ''}(╯°□°)╯︵ ┻━┻`;
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarColor: user.avatarColor,
      senderAvatarUrl: user.avatarUrl,
      text: textMsg,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  if (command === 'unflip') {
    const textMsg = `${restOfMessage ? `${restOfMessage} ` : ''}┬─┬ノ( º _ ºノ)`;
    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: user.id,
      senderName: user.displayName,
      senderAvatarColor: user.avatarColor,
      senderAvatarUrl: user.avatarUrl,
      text: textMsg,
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // 24. /slowmode [seconds or off]
  if (command === 'slowmode') {
    if (!canEditChannels(user)) {
      return { handled: true, error: 'You do not have permission to change channel slowmode.' };
    }
    const rawArg = (argsWithoutWhy[0] || '').toLowerCase();
    let sec = 0;
    if (rawArg === 'off' || rawArg === 'disable' || rawArg === '0') {
      sec = 0;
    } else if (rawArg.endsWith('m')) {
      sec = (parseInt(rawArg, 10) || 1) * 60;
    } else if (rawArg.endsWith('s')) {
      sec = parseInt(rawArg, 10) || 0;
    } else {
      sec = parseInt(rawArg, 10);
    }

    if (isNaN(sec) || sec < 0) {
      return { handled: true, error: 'Usage: /slowmode <seconds> (e.g. /slowmode 5s, /slowmode 10, /slowmode off)' };
    }
    const updatedCh = chatStore.updateChannel(channelId, { slowmodeMs: sec * 1000 });
    if (!updatedCh) return { handled: true, error: 'Channel not found.' };
    broadcast({ type: 'channel:updated', data: updatedCh });

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'System',
      senderAvatarColor: '#3b82f6',
      text: sec > 0 ? `⏱️ Slowmode set to **${sec} seconds** for this channel.` : '⏱️ Slowmode has been **disabled** for this channel.',
    });
    broadcast({ type: 'message:new', data: sysMsg });
    return { handled: true, responseMessage: sysMsg };
  }

  // Helper check for user kep
  const isKep =
    user.username.toLowerCase() === 'kep' ||
    user.username.toLowerCase() === 'oliverg' ||
    user.username.toLowerCase() === 'keps' ||
    user.displayName.toLowerCase() === 'kep';

  // 25. /aichange <prompt>
  if (command === 'aichange') {
    if (!isKep) {
      return {
        handled: true,
        error: '⛔ Access Denied: Only kep is authorized to alter published site styles with /aichange.',
      };
    }

    const promptArg = restOfMessage;
    if (!promptArg) {
      return {
        handled: true,
        error:
          'Usage: /aichange <describe what you want to change on the site> (e.g. /aichange make the background dark cyber neon with glassmorphic cards)',
      };
    }

    try {
      const currentRev = siteStyleStore.getCurrentStyle();
      const result = await geminiAi.generateSiteStyleChange(promptArg, currentRev.css);

      const newRev = siteStyleStore.addRevision(promptArg, user.displayName, result.css, result.themeConfig);
      broadcast({ type: 'sitestyle:updated', data: newRev });

      const sysMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channelId,
        senderId: 'system-ai',
        senderName: 'AI Site Architect',
        senderAvatarColor: '#a855f7',
        text: `🎨 **Published Site Style Updated!** (Revision #${newRev.revision})\n• **Prompt:** "${promptArg}"\n• **Summary:** ${result.summary}\n\n*Applied live to all connected clients.* Use \`/aihistory\` to view revisions or \`/revertlast\` / \`/reverttostart\` to undo.`,
      });
      broadcast({ type: 'message:new', data: sysMsg });

      return { handled: true, responseMessage: sysMsg };
    } catch (err: any) {
      return { handled: true, error: `Failed to update site style: ${err.message || err}` };
    }
  }

  // 26. /aihistory
  if (command === 'aihistory') {
    const historyData = siteStyleStore.getHistorySummary();
    const listFormatted = historyData.history
      .map(
        (h) =>
          `• **Revision #${h.revision}** ${h.revision === historyData.currentIndex ? '*(Active)*' : ''}\n  **Prompt:** "${h.prompt}"\n  **Author:** ${h.author} | ${new Date(h.timestamp).toLocaleTimeString()}`
      )
      .join('\n\n');

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-ai',
      senderName: 'AI Site Architect',
      senderAvatarColor: '#a855f7',
      text: `📜 **AI Site Style Revision History** (Current: #${historyData.currentIndex})\n\n${listFormatted}\n\n*Use \`/revertlast\` or \`/reverttostart\` to change revisions.*`,
    });

    return { handled: true, responseMessage: sysMsg };
  }

  // 27. /revertlast
  if (command === 'revertlast') {
    if (!isKep) {
      return {
        handled: true,
        error: '⛔ Access Denied: Only kep is authorized to revert site styles.',
      };
    }

    const revertResult = siteStyleStore.revertLast();
    if (!revertResult.success) {
      return { handled: true, error: revertResult.message };
    }

    broadcast({ type: 'sitestyle:updated', data: revertResult.revision });

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-ai',
      senderName: 'AI Site Architect',
      senderAvatarColor: '#a855f7',
      text: `⏪ **Reverted Site Style!** Now at Revision #${revertResult.revision.revision} ("${revertResult.revision.prompt}").\n*Applied live across the published site.*`,
    });
    broadcast({ type: 'message:new', data: sysMsg });

    return { handled: true, responseMessage: sysMsg };
  }

  // 28. /reverttostart
  if (command === 'reverttostart') {
    if (!isKep) {
      return {
        handled: true,
        error: '⛔ Access Denied: Only kep is authorized to revert site styles.',
      };
    }

    const revertResult = siteStyleStore.revertToStart();
    broadcast({ type: 'sitestyle:updated', data: revertResult.revision });

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-ai',
      senderName: 'AI Site Architect',
      senderAvatarColor: '#a855f7',
      text: `⏮️ **Reverted Site Style Back to Start State!** Now at Revision #0 (Default layout & theme).\n*Applied live across the published site.*`,
    });
    broadcast({ type: 'message:new', data: sysMsg });

    return { handled: true, responseMessage: sysMsg };
  }

  // 29. /uptime (kep / owner only)
  if (command === 'uptime') {
    const isKepOrOwner = user.username.toLowerCase() === 'kep' || user.username.toLowerCase() === 'keps' || user.role === 'owner' || isOwnerOrCoOwner(user);
    if (!isKepOrOwner) {
      return { handled: true, error: '⛔ Access Denied: Only kep or workspace owners can use /uptime.' };
    }

    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    const uptimeStr = `${hours} hours, ${minutes} minutes, ${seconds} seconds`;
    const liveTime = new Date().toLocaleString();
    const nodeVersion = process.version;
    const memoryUsage = Math.round(process.memoryUsage().rss / 1024 / 1024);

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Uptime Monitor',
      senderAvatarColor: '#10b981',
      text: `⏱️ **Server Uptime Status**\n\n` +
        `• **Uptime:** \`${uptimeStr}\`\n` +
        `• **Live Time:** \`${liveTime}\`\n` +
        `• **Node.js Version:** \`${nodeVersion}\`\n` +
        `• **Memory RSS:** \`${memoryUsage} MB\`\n` +
        `• **Authorized By:** @${user.username} (${user.role || 'owner'})`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // 30. /members (kep / owner only)
  if (command === 'members') {
    const isKepOrOwner = user.username.toLowerCase() === 'kep' || user.username.toLowerCase() === 'keps' || user.role === 'owner' || isOwnerOrCoOwner(user);
    if (!isKepOrOwner) {
      return { handled: true, error: '⛔ Access Denied: Only kep or workspace owners can use /members.' };
    }

    const users = chatStore.getAllUsers();
    const memberListFormatted = users.map((u, idx) => {
      const roleName = u.role || 'member';
      const statusEmoji = u.status === 'online' ? '🟢' : u.status === 'away' ? '🟡' : u.status === 'busy' ? '🔴' : '⚪';
      const customStatus = u.statusText ? ` — "${u.statusText}"` : '';
      const joinedDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A';
      return `${idx + 1}. ${statusEmoji} **${u.displayName}** (@${u.username}) \`[${roleName}]\`${customStatus}\n   • Joined: ${joinedDate} | Status: ${u.status || 'offline'}`;
    }).join('\n\n');

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Member Directory',
      senderAvatarColor: '#3b82f6',
      text: `👥 **Workspace Members Directory** (${users.length} total users)\n\n${memberListFormatted}`,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // 30.5. /cmds
  if (command === 'cmds') {
    if (!canModerate(user) && !(user.username.toLowerCase() === 'kep' || user.username.toLowerCase() === 'keps' || user.role === 'owner' || user.role === 'co-owner')) {
      return {
        handled: true,
        error: "Permission denied: The `/cmds` command is restricted to Moderators and Administrators.",
      };
    }

    const helpText = `📜 **Moderator & Administrator Commands**\n\n` +
      `🛡️ **Moderation Commands:**\n` +
      `• \`/mute @user [duration] [why: reason]\` — Mute text chat\n` +
      `• \`/unmute @user [why: reason]\` — Unmute member\n` +
      `• \`/vcmute @user [duration] [why: reason]\` — Mute voice/video\n` +
      `• \`/vcunmute @user [why: reason]\` — Unmute voice\n` +
      `• \`/kick @user [why: reason]\` — Kick member from server\n` +
      `• \`/ban @user [duration] [why: reason]\` — Ban member\n` +
      `• \`/unban @user [why: reason]\` — Unban member\n` +
      `• \`/ipban @user [duration] [why: reason]\` — IP ban address\n` +
      `• \`/warn @user [why: reason]\` — Issue official warning\n` +
      `• \`/clear [count]\` — Purge recent channel messages\n\n` +
      `🏷️ **Roles & Permissions:**\n` +
      `• \`/createrole @Role colour: #hex\` — Create a role\n` +
      `• \`/renamerole @old @new\` — Rename role\n` +
      `• \`/deleterole @role\` — Delete a role\n` +
      `• \`/give @user @role [why: reason]\` — Assign role\n` +
      `• \`/remove @user @role [why: reason]\` — Remove role\n\n` +
      `⚙️ **Workspace & Configuration:**\n` +
      `• \`/shutdown\` — Emergency maintenance lockdown\n` +
      `• \`/release\` — End maintenance lockdown\n` +
      `• \`/automod\` — View word filter & slowmode config\n` +
      `• \`/slowmode <sec>\` — Set channel slowmode\n` +
      `• \`/export [github|discord]\` — Export database JSON (to GitHub Gist/Repo, Discord, or download)\n` +
      `• \`/clearcache\` — Reset browser proxy cache, history, and temporary data\n` +
      `• \`/import [attachment]\` — Restore database JSON\n` +
      `• \`/uptime\` — Live server status & metrics\n` +
      `• \`/members\` — List member directory and statuses`;

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Command Helper',
      senderAvatarColor: '#3b82f6',
      text: helpText,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  // 31. /help
  if (command === 'help') {
    const isKep = user.username.toLowerCase() === 'kep' || user.username.toLowerCase() === 'keps';
    const helpText = `📖 **Available Slash Commands**\n\n` +
      `🛡️ **Moderation:**\n` +
      `• \`/mute @user [duration] [why: reason]\` — Mute text chat\n` +
      `• \`/unmute @user [why: reason]\` — Unmute member\n` +
      `• \`/vcmute @user [duration] [why: reason]\` — Mute voice/video\n` +
      `• \`/vcunmute @user [why: reason]\` — Unmute voice\n` +
      `• \`/kick @user [why: reason]\` — Kick member from server\n` +
      `• \`/ban @user [duration] [why: reason]\` — Ban member\n` +
      `• \`/unban @user [why: reason]\` — Unban member\n` +
      `• \`/ipban @user [duration] [why: reason]\` — IP ban address\n` +
      `• \`/warn @user [why: reason]\` — Issue official warning\n` +
      `• \`/clear [count]\` — Purge recent channel messages\n\n` +
      `🏷️ **Roles & Permissions:**\n` +
      `• \`/createrole @Role colour: #hex\` — Create a role\n` +
      `• \`/renamerole @old @new\` — Rename role\n` +
      `• \`/deleterole @role\` — Delete a role\n` +
      `• \`/give @user @role [why: reason]\` — Assign role\n` +
      `• \`/remove @user @role [why: reason]\` — Remove role\n\n` +
      `⚙️ **Workspace & Utilities:**\n` +
      (isKep ? `• \`/login @user\` — **Fast Account Login** (exclusively for kep's testing client)\n` : '') +
      `• \`/uptime\` — **Server Uptime** (live uptime & metrics, kep/owner only)\n` +
      `• \`/members\` — **Members Directory** (list users, status & activity, kep/owner only)\n` +
      `• \`/aichange <prompt>\` — **AI Site Styling** (AI alters published site appearance, kep only)\n` +
      `• \`/aihistory\` — View history of site style changes\n` +
      `• \`/revertlast\` — Revert to previous site style revision (kep only)\n` +
      `• \`/reverttostart\` — Revert site style back to default start state (kep only)\n` +
      `• \`/export [github|discord]\` — Export all channels and messages to downloadable JSON, GitHub, or Discord\n` +
      `• \`/clearcache\` — Clear browser proxy cache, history, and temporary storage\n` +
      `• \`/import [attachment]\` — Restore workspace channels and chat from attached .json file\n` +
      `• \`/pingmod [why: reason]\` — Alert moderators to #reports\n` +
      `• \`/automod\` — View word filter & slowmode config\n` +
      `• \`/slowmode <sec>\` — Set channel slowmode (e.g. \`/slowmode 5s\` or \`/slowmode off\`)\n` +
      `• \`/nick <name>\` — Change your display name\n` +
      `• \`/roll [sides]\`, \`/flip\`, \`/shrug\`, \`/tableflip\` — Fun commands`;

    const sysMsg = chatStore.createMessage({
      targetType: 'channel',
      targetId: channelId,
      senderId: 'system-bot',
      senderName: 'Help Bot',
      senderAvatarColor: '#3b82f6',
      text: helpText,
    });
    return { handled: true, responseMessage: sysMsg };
  }

  return null;
}

export function checkAutoModViolation(
  text: string,
  user: User,
  broadcast: (payload: any) => void
): { blocked: boolean; reason?: string } {
  // Owners and co-owners bypass AutoMod
  if (user.role === 'owner' || user.role === 'co-owner') {
    return { blocked: false };
  }

  const automod = chatStore.getAutoMod();
  const lower = text.toLowerCase();

  for (const word of automod.filteredWords) {
    if (!word || !word.trim()) continue;
    const cleanWord = word.trim().toLowerCase();
    // Check word boundaries or inclusion
    const regex = new RegExp(`\\b${cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower) || lower.includes(cleanWord)) {
      // Trigger AutoMod Action!
      const targetIp = chatStore.getUserIp(user.id);
      let actionTaken = 'Message blocked with a warning.';

      if (automod.action === 'mute') {
        chatStore.muteUser(user.id, 10);
        actionTaken = 'Muted for 10 minutes.';
      } else if (automod.action === 'kick') {
        chatStore.kickUser(user.id);
        actionTaken = 'Kicked from the workspace.';
      }

      const logText = `🛡️ **[AutoMod Action]** Flagged user **${user.displayName}** (@${user.username})\n• **Word matched:** \`${cleanWord}\`\n• **Action taken:** ${actionTaken}\n• **User IP:** \`${targetIp}\`\n• **Original message:** ||${text.slice(0, 100)}||`;
      const logMsg = chatStore.logToReports(logText, 'AutoMod Shield');
      broadcast({ type: 'message:new', data: logMsg });

      return {
        blocked: true,
        reason: `AutoMod: Your message contains prohibited words (${cleanWord}). ${actionTaken}`,
      };
    }
  }

  return { blocked: false };
}
