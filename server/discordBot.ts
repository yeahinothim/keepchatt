import { WebSocket } from 'ws';
import { chatStore, decryptPassword } from './storage.ts';
import { sendDiscordWebhookFile } from './discordWebhook.ts';
import { groqAi } from './groqAi.ts';
import type { WsServerPayload } from '../src/types.ts';

export interface DiscordBotStatus {
  connected: boolean;
  botTag: string | null;
  botId: string | null;
  guildsCount: number;
  uptime: number;
  lastError: string | null;
  hasToken: boolean;
}

export class DiscordBotService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeatAck = true;
  private sequence: number | null = null;
  private connected = false;
  private botUser: { id: string; username: string; discriminator: string } | null = null;
  private startTime = 0;
  private lastError: string | null = null;
  private reconnectAttempts = 0;
  private broadcastFn: ((payload: WsServerPayload) => void) | null = null;

  constructor() {
    this.token = process.env.DISCORD_BOT_TOKEN || null;
  }

  public setBroadcast(fn: (payload: WsServerPayload) => void) {
    this.broadcastFn = fn;
  }

  public setToken(token: string) {
    const clean = token.trim();
    this.token = clean || null;
    process.env.DISCORD_BOT_TOKEN = clean;
    this.disconnect();
    if (this.token) {
      this.connect();
    }
  }

  public getStatus(): DiscordBotStatus {
    return {
      connected: this.connected,
      botTag: this.botUser ? `${this.botUser.username}#${this.botUser.discriminator}` : null,
      botId: this.botUser?.id || null,
      guildsCount: 0,
      uptime: this.connected && this.startTime ? Date.now() - this.startTime : 0,
      lastError: this.lastError,
      hasToken: Boolean(this.token),
    };
  }

  public start() {
    if (this.token) {
      this.connect();
    } else {
      console.log('[Discord Bot] No DISCORD_BOT_TOKEN set. Bot is idle until configured.');
    }
  }

  public disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.connected = false;
    this.botUser = null;
  }

  private connect() {
    if (!this.token) return;
    this.disconnect();

    try {
      console.log('[Discord Bot] Connecting to Discord Gateway v10...');
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

      this.ws.on('open', () => {
        console.log('[Discord Bot] WebSocket connection opened to Discord Gateway.');
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const payload = JSON.parse(data.toString());
          this.handleGatewayPayload(payload);
        } catch (err) {
          console.error('[Discord Bot] Error parsing gateway message:', err);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`[Discord Bot] Gateway closed (${code}: ${reason.toString()}).`);
        this.connected = false;
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        // Don't reconnect on invalid token (code 4004) or disallowed intents (code 4014)
        if (code === 4004) {
          this.lastError = 'Invalid Discord Bot Token (Code 4004). Please verify token.';
          return;
        }
        if (code === 4014) {
          this.lastError = 'Disallowed Gateway Intents (Code 4014). Enable Message Content Intent in Discord Developer Portal.';
          return;
        }

        // Reconnect with backoff
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectAttempts * 3000, 30000);
        console.log(`[Discord Bot] Scheduling reconnect in ${delay / 1000}s...`);
        setTimeout(() => this.connect(), delay);
      });

      this.ws.on('error', (err) => {
        console.error('[Discord Bot] Gateway error:', err.message);
        this.lastError = err.message;
      });
    } catch (err: any) {
      console.error('[Discord Bot] Failed to establish gateway connection:', err);
      this.lastError = err.message;
    }
  }

  private handleGatewayPayload(payload: any) {
    const { op, d, s, t } = payload;
    if (s !== null && s !== undefined) {
      this.sequence = s;
    }

    switch (op) {
      case 10: { // Hello
        const heartbeatIntervalMs = d.heartbeat_interval;
        this.startHeartbeat(heartbeatIntervalMs);
        this.identify();
        break;
      }
      case 11: { // Heartbeat ACK
        this.lastHeartbeatAck = true;
        break;
      }
      case 0: { // Dispatch event
        this.handleDispatch(t, d);
        break;
      }
      case 7: { // Reconnect
        console.log('[Discord Bot] Gateway requested reconnect.');
        this.connect();
        break;
      }
      case 9: { // Invalid Session
        console.log('[Discord Bot] Gateway invalid session. Re-identifying...');
        setTimeout(() => this.identify(), 2000);
        break;
      }
    }
  }

  private startHeartbeat(intervalMs: number) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.lastHeartbeatAck = true;
    this.heartbeatInterval = setInterval(() => {
      if (!this.lastHeartbeatAck) {
        console.warn('[Discord Bot] Missed heartbeat ACK. Reconnecting...');
        this.connect();
        return;
      }
      this.lastHeartbeatAck = false;
      this.sendPayload({ op: 1, d: this.sequence });
    }, intervalMs);
  }

  private identify() {
    if (!this.token) return;
    // Intents: Guilds (1) + GuildMessages (512) + MessageContent (32768) + DirectMessages (4096) = 37377
    const identifyPayload = {
      op: 2,
      d: {
        token: this.token,
        intents: 37377,
        properties: {
          os: 'linux',
          browser: 'keepchat_discord_bot',
          device: 'keepchat_discord_bot',
        },
        presence: {
          activities: [
            {
              name: 'KeepChat | /help & /logs',
              type: 3, // Watching
            },
          ],
          status: 'online',
          afk: false,
        },
      },
    };
    this.sendPayload(identifyPayload);
  }

  private sendPayload(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private async handleDispatch(eventName: string, data: any) {
    if (eventName === 'READY') {
      this.connected = true;
      this.startTime = Date.now();
      this.reconnectAttempts = 0;
      this.botUser = data.user;
      this.lastError = null;
      console.log(`[Discord Bot] Logged in as ${data.user.username}#${data.user.discriminator} (ID: ${data.user.id})`);

      // Register global application slash commands
      await this.registerSlashCommands(data.user.id);
    } else if (eventName === 'INTERACTION_CREATE') {
      await this.handleInteraction(data);
    } else if (eventName === 'MESSAGE_CREATE') {
      await this.handleMessageCreate(data);
    }
  }

  /**
   * Register Discord Slash Commands
   */
  private async registerSlashCommands(applicationId: string) {
    if (!this.token) return;
    try {
      const commands = [
        {
          name: 'uptime',
          description: 'View the uptime of the KeepChat website',
        },
        {
          name: 'password',
          description: 'Reset a user\'s password (owner only)',
          options: [
            {
              type: 3, // STRING
              name: 'username',
              description: 'Username of the user',
              required: true,
            },
          ],
        },
        {
          name: 'reveal',
          description: 'Reset a user\'s password (owner only)',
          options: [
            {
              type: 3, // STRING
              name: 'username',
              description: 'Username of the user',
              required: true,
            },
          ],
        },
        {
          name: 'export',
          description: 'Export and download complete KeepChat website backup (channels, messages, users)',
        },
        {
          name: 'logs',
          description: 'View website moderation logs or recent messages from a channel',
          options: [
            {
              type: 3, // STRING
              name: 'channel',
              description: 'Site channel to read logs from (e.g. general, announcements)',
              required: false,
            },
          ],
        },
        {
          name: 'kick',
          description: 'Kick a user from the website (affects site only, not discord)',
          options: [
            {
              type: 3, // STRING
              name: 'user',
              description: 'Username or Display Name of the user on the site',
              required: true,
            },
            {
              type: 3, // STRING
              name: 'reason',
              description: 'Reason for kicking the user',
              required: false,
            },
          ],
        },
        {
          name: 'ban',
          description: 'Ban a user from the website (affects site only, not discord)',
          options: [
            {
              type: 3, // STRING
              name: 'user',
              description: 'Username or Display Name of the user on the site',
              required: true,
            },
            {
              type: 4, // INTEGER
              name: 'duration',
              description: 'Ban duration in minutes (0 or leave blank for permanent)',
              required: false,
            },
            {
              type: 3, // STRING
              name: 'reason',
              description: 'Reason for the ban',
              required: false,
            },
          ],
        },
        {
          name: 'mute',
          description: 'Mute a user on the website (affects site only, not discord)',
          options: [
            {
              type: 3, // STRING
              name: 'user',
              description: 'Username or Display Name of the user on the site',
              required: true,
            },
            {
              type: 4, // INTEGER
              name: 'duration',
              description: 'Mute duration in minutes (default 10 minutes)',
              required: false,
            },
            {
              type: 3, // STRING
              name: 'reason',
              description: 'Reason for the mute',
              required: false,
            },
          ],
        },
        {
          name: 'site-status',
          description: 'Check KeepChat website online status, channels, and statistics',
        },
        {
          name: 'help',
          description: 'Show KeepChat Discord bot command guide and instructions',
        },
        {
          name: 'messages',
          description: 'Bridge and sync a Discord channel to a website channel',
          options: [
            {
              type: 3, // STRING
              name: 'channel',
              description: 'The Discord channel mention (e.g. #general), ID, or name',
              required: true,
            },
            {
              type: 3, // STRING
              name: 'site_channel',
              description: 'The website channel name to sync to (optional, defaults to Discord channel name)',
              required: false,
            },
          ],
        },
        {
          name: 'sync-channels',
          description: 'Sync all website channels to a "chat" category in Discord with real-time bridging',
        },
        {
          name: 'ai',
          description: 'Ask KeepChat LLaMA AI a question, or toggle auto-replies',
          options: [
            {
              type: 3, // STRING
              name: 'prompt',
              description: 'Ask the AI a question directly',
              required: false,
            },
            {
              type: 3, // STRING
              name: 'toggle',
              description: 'Turn AI auto-replies on or off for this channel',
              required: false,
              choices: [
                { name: 'On', value: 'on' },
                { name: 'Off', value: 'off' },
              ],
            },
          ],
        },
        {
          name: 'version',
          description: 'View the current platform and system version information',
        },
      ];

      const res = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
      });

      if (res.ok) {
        console.log('[Discord Bot] Successfully registered global Discord slash commands.');
      } else {
        const errText = await res.text();
        console.warn(`[Discord Bot] Slash commands registration returned ${res.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[Discord Bot] Failed to register slash commands:', err);
    }
  }

  /**
   * Handle Slash Command Interactions
   */
  private async handleInteraction(interaction: any) {
    if (interaction.type !== 2) return; // 2 = APPLICATION_COMMAND
    const { name, options } = interaction.data;
    const channelId = interaction.channel_id;

    // Build args object
    const args: Record<string, any> = {};
    if (Array.isArray(options)) {
      for (const opt of options) {
        args[opt.name] = opt.value;
      }
    }

    try {
      if (name === 'help') {
        await this.respondInteraction(interaction, {
          embeds: [
            {
              title: '🤖 KeepChat Discord Bot Commands',
              color: 0x5865f2,
              description:
                'This bot bridges Discord with your **KeepChat** website! Moderation commands affect users on the website only.',
              fields: [
                {
                  name: '📦 `/export`',
                  value: 'Export website database backup (channels, messages, roles, users).',
                },
                {
                  name: '📜 `/logs [channel]`',
                  value:
                    'View moderation audit logs, or pass a channel name (e.g. `/logs general`) to view its recent chat history.',
                },
                {
                  name: '👢 `/kick <user> [reason]`',
                  value: 'Kick a user from the website *(affects site only)*.',
                },
                {
                  name: '⛔ `/ban <user> [duration] [reason]`',
                  value: 'Ban a user from the website *(affects site only)*.',
                },
                {
                  name: '🔇 `/mute <user> [duration] [reason]`',
                  value: 'Mute a user on the website *(affects site only)*.',
                },
                {
                  name: '📊 `/site-status`',
                  value: 'View current website online stats and user count.',
                },
                {
                  name: '🔑 `/password <username>`',
                  value: 'Reset a user\'s password (owner only).',
                },
                {
                  name: '🔗 `/messages <discord_channel> [site_channel]`',
                  value: 'Bridge a Discord channel and import its history to KeepChat.',
                },
                {
                  name: '📂 `/sync-channels`',
                  value: 'Sync all KeepChat channels to a Discord "chat" category with active bridging.',
                },
              ],
              footer: { text: 'KeepChat Discord Integration' },
            },
          ],
        });
      } else if (name === 'uptime') {
        const uptimeMs = chatStore.getUptime();
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const formatted = `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
        await this.respondInteraction(interaction, { content: `⏱️ **[KeepChat Uptime]** Website has been online for: ${formatted}` });
      } else if (name === 'password') {
        const username = args['username'];
        try {
          const newPassword = chatStore.resetUserPassword(username);
          await this.respondInteraction(interaction, {
            content: `🔑 **[Password Reset]** Password for **${username}** has been reset to: \`${newPassword}\`\n*Store this password securely!*`,
          });
        } catch (err: any) {
          await this.respondInteraction(interaction, { content: `❌ Error: ${err.message}` });
        }
      } else if (name === 'reveal') {
        const roles = interaction.member?.roles || [];
        if (!roles.includes('1538449774146232330')) {
          await this.respondInteraction(interaction, { content: '❌ You do not have permission to use this command.' });
          return;
        }

        const username = args['username'];
        try {
          const user = chatStore.findUserByUsername(username);
          if (!user) throw new Error('User not found.');
          
          const password = decryptPassword(user.password);
          await this.respondInteraction(interaction, {
            content: `🔑 **[Password Reveal]** The password for **${username}** is: \`${password}\``,
          });
        } catch (err: any) {
          await this.respondInteraction(interaction, { content: `❌ Error: ${err.message}` });
        }
      } else if (name === 'export') {
        const backup = chatStore.exportBackup();
        const jsonStr = JSON.stringify(backup, null, 2);
        const fileBuffer = Buffer.from(jsonStr, 'utf-8');
        const fileName = `keepchat-export-${Date.now()}.json`;

        await this.respondInteraction(interaction, {
          content: `📦 **[KeepChat Export]** Complete workspace backup exported!\n• **Channels:** ${backup.channels?.length || 0}\n• **Messages:** ${backup.messages?.length || 0}\n• **Accounts:** ${backup.users?.length || 0}\n• **Roles:** ${backup.roles?.length || 0}`,
        });

        // Also upload file to discord channel if under 8MB
        if (channelId && this.token) {
          await this.sendDiscordFile(channelId, fileBuffer, fileName, '📦 Here is the exported JSON database backup:');
        }
      } else if (name === 'logs') {
        const channelArg = args['channel'];
        const replyEmbed = this.generateLogsEmbed(channelArg);
        await this.respondInteraction(interaction, { embeds: [replyEmbed] });
      } else if (name === 'kick') {
        const userArg = args['user'];
        const reason = args['reason'] || 'Kicked via Discord Bot command';
        const result = this.executeKick(userArg, reason, interaction.member?.user?.username || 'Discord Moderator');
        await this.respondInteraction(interaction, { content: result.message });
      } else if (name === 'ban') {
        const userArg = args['user'];
        const duration = args['duration'] ? parseInt(args['duration'], 10) : undefined;
        const reason = args['reason'] || 'Banned via Discord Bot command';
        const result = this.executeBan(userArg, duration, reason, interaction.member?.user?.username || 'Discord Moderator');
        await this.respondInteraction(interaction, { content: result.message });
      } else if (name === 'mute') {
        const userArg = args['user'];
        const duration = args['duration'] ? parseInt(args['duration'], 10) : 10;
        const reason = args['reason'] || 'Muted via Discord Bot command';
        const result = this.executeMute(userArg, duration, reason, interaction.member?.user?.username || 'Discord Moderator');
        await this.respondInteraction(interaction, { content: result.message });
      } else if (name === 'site-status') {
        const backup = chatStore.exportBackup();
        const channels = chatStore.getChannels();
        const users = chatStore.getUsers();
        await this.respondInteraction(interaction, {
          embeds: [
            {
              title: '🟢 KeepChat Website Status',
              color: 0x10b981,
              fields: [
                { name: 'Channels', value: `${channels.length}`, inline: true },
                { name: 'Registered Users', value: `${users.length}`, inline: true },
                { name: 'Total Messages', value: `${backup.messages?.length || 0}`, inline: true },
                { name: 'Site Status', value: chatStore.isSiteShutdown() ? '🔴 Maintenance' : '🟢 Online', inline: true },
              ],
              footer: { text: 'KeepChat Live Synchronization' },
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } else if (name === 'messages') {
        const guildId = interaction.guild_id;
        if (!guildId) {
          await this.respondInteraction(interaction, { content: '❌ This command can only be used in a Discord Server.' });
          return;
        }

        const channelArg = args['channel'];
        const siteChannelArg = args['site_channel'];

        const discordChannelId = channelArg.match(/<#(\d+)>/)?.[1] || channelArg;

        await this.respondInteraction(interaction, {
          content: `⏳ **[KeepChat Bridge]** Linking Discord channel and importing messages to website...`
        });

        try {
          const chRes = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}`, {
            headers: { Authorization: `Bot ${this.token}` },
          });
          
          let discordChannelName = 'synced-channel';
          if (chRes.ok) {
            const chData = await chRes.json();
            discordChannelName = chData.name || discordChannelName;
          }

          const targetName = (siteChannelArg || discordChannelName).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
          let siteChannel = chatStore.getChannels().find(c => c.name === targetName);

          if (!siteChannel) {
            siteChannel = chatStore.createChannel({
              name: targetName,
              description: `Synced with Discord #${discordChannelName}`,
              createdById: 'system-bot',
            });
            if (this.broadcastFn) {
              this.broadcastFn({ type: 'channel:created', data: siteChannel });
            }
          }

          chatStore.updateChannel(siteChannel.id, { discordChannelId });
          const importedCount = await this.importDiscordChannelMessages(discordChannelId, siteChannel.id);

          await this.editInteractionResponse(interaction, {
            embeds: [
              {
                title: '⚡ KeepChat Discord Bridge Active!',
                color: 0x5865f2,
                description: `Successfully established a real-time bridge between Discord and KeepChat!`,
                fields: [
                  { name: 'Discord Channel', value: `<#${discordChannelId}>`, inline: true },
                  { name: 'Website Channel', value: `#${siteChannel.name}`, inline: true },
                  { name: 'Messages Imported', value: `📦 ${importedCount} messages`, inline: true },
                  { name: 'Status', value: '🟢 Real-time bidirectional syncing is now live!' },
                ],
                footer: { text: 'KeepChat Bridge Utility' },
                timestamp: new Date().toISOString(),
              }
            ]
          });
        } catch (err: any) {
          await this.editInteractionResponse(interaction, { content: `❌ Error bridging channels: ${err.message}` });
        }
      } else if (name === 'sync-channels') {
        const guildId = interaction.guild_id;
        if (!guildId) {
          await this.respondInteraction(interaction, { content: '❌ This command can only be used in a Discord Server.' });
          return;
        }

        await this.respondInteraction(interaction, {
          content: `⏳ **[KeepChat Sync]** Creating "chat" category and syncing all website channels to Discord...`
        });

        try {
          const categoryId = await this.findOrCreateChatCategory(guildId);
          if (!categoryId) {
            throw new Error('Failed to locate or create "chat" category in Discord.');
          }

          const websiteChannels = chatStore.getChannels().filter(c => c.id !== 'c-reports');
          const syncedChannels: Array<{ siteName: string; discordId: string }> = [];

          for (const channel of websiteChannels) {
            const discordId = await this.findOrCreateTextChannel(guildId, categoryId, channel.name);
            if (discordId) {
              chatStore.updateChannel(channel.id, { discordChannelId: discordId });
              syncedChannels.push({ siteName: channel.name, discordId });
            }
          }

          const listFields = syncedChannels.map(c => ({
            name: `#${c.siteName}`,
            value: `➡️ <#${c.discordId}> (Bridged)`,
            inline: true,
          }));

          await this.editInteractionResponse(interaction, {
            embeds: [
              {
                title: '📂 Channels Synced with "chat" Category!',
                color: 0x10b981,
                description: `All website channels have been successfully created/linked inside the **chat** category in your Discord server!`,
                fields: [
                  ...listFields,
                  { name: 'Real-Time Bridge Status', value: '🟢 All synced channels are now bidirectionally bridged in real-time!' }
                ],
                footer: { text: 'KeepChat Multi-Channel Sync' },
                timestamp: new Date().toISOString(),
              }
            ]
          });
        } catch (err: any) {
          await this.editInteractionResponse(interaction, { content: `❌ Error syncing channels: ${err.message}` });
        }
      } else if (name === 'ai') {
        const prompt = args['prompt'];
        const toggle = args['toggle'];

        if (toggle) {
          const bridgedChannel = chatStore.getChannels().find(c => c.discordChannelId === channelId);
          if (!bridgedChannel) {
            await this.respondInteraction(interaction, {
              content: `❌ This Discord channel is not bridged to any KeepChat channel. Please bridge it first with \`/messages\`.`
            });
            return;
          }
          const enabled = toggle === 'on';
          chatStore.updateChannel(bridgedChannel.id, { discordAiEnabled: enabled });
          await this.respondInteraction(interaction, {
            content: `🤖 **[LLaMA AI Auto-Reply]** Auto-replies in this channel have been turned **${enabled ? 'ON' : 'OFF'}**.`
          });
          return;
        }

        if (prompt) {
          await this.respondInteraction(interaction, {
            content: `⏳ **[LLaMA AI]** Thinking...`
          });
          try {
            const aiReply = await groqAi.generateResponse({
              prompt,
              senderName: interaction.member?.user?.username || 'Discord User',
              channelId: 'discord-ai-temp',
            });
            await this.editInteractionResponse(interaction, {
              content: `🤖 **[LLaMA AI]**:\n${aiReply}`
            });
          } catch (err: any) {
            await this.editInteractionResponse(interaction, {
              content: `❌ AI generation failed: ${err.message}`
            });
          }
        } else {
          await this.respondInteraction(interaction, {
            content: `🤖 **KeepChat LLaMA AI Utility**\n• Use \`/ai prompt: [your question]\` to ask LLaMA a question directly.\n• Use \`/ai toggle: on/off\` to toggle auto-replies for this channel.`
          });
        }
      } else if (name === 'version') {
        await this.respondInteraction(interaction, {
          embeds: [
            {
              title: 'ℹ️ KeepChat System Version',
              color: 0x3b82f6,
              description: 'Real-time synchronization platform and Discord bridge.',
              fields: [
                { name: 'Core Engine', value: '`v5.3.1-release`', inline: true },
                { name: 'AI Architecture', value: 'LLaMA 3.2 3B Instruct', inline: true },
                { name: 'Status', value: '🟢 Operational', inline: true },
                { name: 'Bridge Status', value: '🟢 Bidirectional Gateway Active' }
              ],
              footer: { text: 'Anyone can use this command' },
              timestamp: new Date().toISOString()
            }
          ]
        });
      }
    } catch (err: any) {
      console.error('[Discord Bot] Error handling interaction:', err);
      try {
        await this.respondInteraction(interaction, {
          content: `❌ Error processing command: ${err.message}`,
        });
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Handle text prefix commands in Discord channels (!export, !logs, !kick, etc.)
   */
  private async handleMessageCreate(msg: any) {
    if (msg.author?.bot) return;
    const content = (msg.content || '').trim();
    const isPrefix = content.startsWith('!') || content.startsWith('/');

    if (!isPrefix) {
      const channelId = msg.channel_id;
      const bridgedChannel = chatStore.getChannels().find(c => c.discordChannelId === channelId);
      const isBotPinged = msg.mentions?.some((m: any) => m.id === this.botUser?.id) || 
                          content.includes(`<@${this.botUser?.id || ''}>`) || 
                          content.includes(`<@!${this.botUser?.id || ''}>`);
      const isAiAutoReplyEnabled = bridgedChannel?.discordAiEnabled === true;

      // 1. Forward to website if bridged
      if (bridgedChannel) {
        try {
          const authorName = msg.author.global_name || msg.author.username || 'Discord User';
          const authorAvatar = msg.author.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` : undefined;

          // Map attachments
          const attachments = (msg.attachments || []).map((att: any) => ({
            type: att.content_type?.startsWith('image/') ? 'image' : 'file',
            url: att.url,
            name: att.filename,
            size: att.size,
          }));

          const websiteMessage = chatStore.createMessage({
            targetType: 'channel',
            targetId: bridgedChannel.id,
            senderId: `discord-${msg.author.id}`,
            senderName: authorName,
            senderUsername: msg.author.username,
            senderAvatarColor: '#5865f2',
            senderAvatarUrl: authorAvatar,
            text: content || '',
            attachments: attachments.length > 0 ? attachments : undefined,
          });

          if (this.broadcastFn) {
            this.broadcastFn({
              type: 'message:new',
              data: websiteMessage,
            });
          }
        } catch (err) {
          console.error('[Discord Bot] Error forwarding non-prefix message to website:', err);
        }
      }

      // 2. Auto-reply using LLaMA mode if pinged or AI is enabled for this channel
      if (isBotPinged || isAiAutoReplyEnabled) {
        let cleanPrompt = content;
        if (isBotPinged && this.botUser?.id) {
          cleanPrompt = cleanPrompt
            .replace(new RegExp(`<@!?${this.botUser.id}>`, 'g'), '')
            .trim();
        }

        // Run the LLaMA mode generation asynchronously
        (async () => {
          try {
            const aiReply = await groqAi.generateResponse({
              prompt: cleanPrompt || 'Hello!',
              senderName: msg.author.global_name || msg.author.username || 'Discord User',
              channelId: bridgedChannel?.id || 'discord-ai-temp',
            });

            await this.sendDiscordMessage(channelId, {
              content: `🤖 **[LLaMA AI]**:\n${aiReply}`,
              message_reference: {
                message_id: msg.id,
                channel_id: channelId,
                fail_if_not_exists: false
              }
            });
          } catch (err: any) {
            console.error('[Discord Bot] LLaMA auto-reply generation failed:', err.message);
          }
        })();
      }

      return;
    }

    const parts = content.slice(1).split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const channelId = msg.channel_id;

    try {
      if (command === 'export') {
        const backup = chatStore.exportBackup();
        const jsonStr = JSON.stringify(backup, null, 2);
        const fileBuffer = Buffer.from(jsonStr, 'utf-8');
        const fileName = `keepchat-export-${Date.now()}.json`;

        await this.sendDiscordMessage(channelId, {
          content: `📦 **[KeepChat Export]** Backup generated successfully!\n• **Channels:** ${backup.channels?.length || 0}\n• **Messages:** ${backup.messages?.length || 0}\n• **Users:** ${backup.users?.length || 0}`,
        });

        await this.sendDiscordFile(channelId, fileBuffer, fileName, '📦 Backup file attachment:');
      } else if (command === 'logs') {
        const channelArg = parts[1];
        const embed = this.generateLogsEmbed(channelArg);
        await this.sendDiscordMessage(channelId, { embeds: [embed] });
      } else if (command === 'kick') {
        const targetQuery = parts[1];
        if (!targetQuery) {
          await this.sendDiscordMessage(channelId, { content: '⚠️ Usage: `!kick <username> [reason]` *(affects website only)*' });
          return;
        }
        const reason = parts.slice(2).join(' ') || 'Kicked via Discord command';
        const res = this.executeKick(targetQuery, reason, msg.author.username);
        await this.sendDiscordMessage(channelId, { content: res.message });
      } else if (command === 'ban') {
        const targetQuery = parts[1];
        if (!targetQuery) {
          await this.sendDiscordMessage(channelId, { content: '⚠️ Usage: `!ban <username> [duration] [reason]` *(affects website only)*' });
          return;
        }
        let duration: number | undefined = undefined;
        let reasonStartIndex = 2;
        if (parts[2] && /^\d+$/.test(parts[2])) {
          duration = parseInt(parts[2], 10);
          reasonStartIndex = 3;
        }
        const reason = parts.slice(reasonStartIndex).join(' ') || 'Banned via Discord command';
        const res = this.executeBan(targetQuery, duration, reason, msg.author.username);
        await this.sendDiscordMessage(channelId, { content: res.message });
      } else if (command === 'mute') {
        const targetQuery = parts[1];
        if (!targetQuery) {
          await this.sendDiscordMessage(channelId, { content: '⚠️ Usage: `!mute <username> [duration_minutes] [reason]` *(affects website only)*' });
          return;
        }
        let duration = 10;
        let reasonStartIndex = 2;
        if (parts[2] && /^\d+$/.test(parts[2])) {
          duration = parseInt(parts[2], 10);
          reasonStartIndex = 3;
        }
        const reason = parts.slice(reasonStartIndex).join(' ') || 'Muted via Discord command';
        const res = this.executeMute(targetQuery, duration, reason, msg.author.username);
        await this.sendDiscordMessage(channelId, { content: res.message });
      } else if (command === 'messages') {
        const channelArg = parts[1];
        if (!channelArg) {
          await this.sendDiscordMessage(channelId, { content: '⚠️ Usage: `!messages <#channel_mention_or_id> [site_channel_name]`' });
          return;
        }

        const discordChannelId = channelArg.match(/<#(\d+)>/)?.[1] || channelArg;
        const siteChannelArg = parts[2];

        await this.sendDiscordMessage(channelId, { content: '⏳ **[KeepChat Bridge]** Linking Discord channel and importing messages to website...' });

        try {
          const chRes = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}`, {
            headers: { Authorization: `Bot ${this.token}` },
          });
          
          let discordChannelName = 'synced-channel';
          if (chRes.ok) {
            const chData = await chRes.json();
            discordChannelName = chData.name || discordChannelName;
          }

          const targetName = (siteChannelArg || discordChannelName).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
          let siteChannel = chatStore.getChannels().find(c => c.name === targetName);

          if (!siteChannel) {
            siteChannel = chatStore.createChannel({
              name: targetName,
              description: `Synced with Discord #${discordChannelName}`,
              createdById: 'system-bot',
            });
            if (this.broadcastFn) {
              this.broadcastFn({ type: 'channel:created', data: siteChannel });
            }
          }

          chatStore.updateChannel(siteChannel.id, { discordChannelId });
          const importedCount = await this.importDiscordChannelMessages(discordChannelId, siteChannel.id);

          await this.sendDiscordMessage(channelId, {
            embeds: [
              {
                title: '⚡ KeepChat Discord Bridge Active!',
                color: 0x5865f2,
                description: `Successfully established a real-time bridge between Discord and KeepChat!`,
                fields: [
                  { name: 'Discord Channel', value: `<#${discordChannelId}>`, inline: true },
                  { name: 'Website Channel', value: `#${siteChannel.name}`, inline: true },
                  { name: 'Messages Imported', value: `📦 ${importedCount} messages`, inline: true },
                  { name: 'Status', value: '🟢 Real-time bidirectional syncing is now live!' },
                ],
                footer: { text: 'KeepChat Bridge Utility' },
                timestamp: new Date().toISOString(),
              }
            ]
          });
        } catch (err: any) {
          await this.sendDiscordMessage(channelId, { content: `❌ Error bridging channels: ${err.message}` });
        }
      } else if (command === 'sync-channels') {
        const guildId = msg.guild_id;
        if (!guildId) {
          await this.sendDiscordMessage(channelId, { content: '❌ This command can only be used in a Discord Server.' });
          return;
        }

        await this.sendDiscordMessage(channelId, { content: '⏳ **[KeepChat Sync]** Creating "chat" category and syncing all website channels to Discord...' });

        try {
          const categoryId = await this.findOrCreateChatCategory(guildId);
          if (!categoryId) {
            throw new Error('Failed to locate or create "chat" category in Discord.');
          }

          const websiteChannels = chatStore.getChannels().filter(c => c.id !== 'c-reports');
          const syncedChannels: Array<{ siteName: string; discordId: string }> = [];

          for (const channel of websiteChannels) {
            const discordId = await this.findOrCreateTextChannel(guildId, categoryId, channel.name);
            if (discordId) {
              chatStore.updateChannel(channel.id, { discordChannelId: discordId });
              syncedChannels.push({ siteName: channel.name, discordId });
            }
          }

          const listFields = syncedChannels.map(c => ({
            name: `#${c.siteName}`,
            value: `➡️ <#${c.discordId}> (Bridged)`,
            inline: true,
          }));

          await this.sendDiscordMessage(channelId, {
            embeds: [
              {
                title: '📂 Channels Synced with "chat" Category!',
                color: 0x10b981,
                description: `All website channels have been successfully created/linked inside the **chat** category in your Discord server!`,
                fields: [
                  ...listFields,
                  { name: 'Real-Time Bridge Status', value: '🟢 All synced channels are now bidirectionally bridged in real-time!' }
                ],
                footer: { text: 'KeepChat Multi-Channel Sync' },
                timestamp: new Date().toISOString(),
              }
            ]
          });
        } catch (err: any) {
          await this.sendDiscordMessage(channelId, { content: `❌ Error syncing channels: ${err.message}` });
        }
      } else if (command === 'help') {
        await this.sendDiscordMessage(channelId, {
          embeds: [
            {
              title: '🤖 KeepChat Discord Bot Commands',
              color: 0x5865f2,
              description: 'Commands work with either `!` or `/` slash commands:',
              fields: [
                { name: '`!export`', value: 'Export entire website chat backup as JSON' },
                { name: '`!logs`', value: 'View website moderation audit logs' },
                { name: '`!logs #channel`', value: 'View recent messages from a website channel (e.g. `!logs general`)' },
                { name: '`!kick <user> [reason]`', value: 'Kick a user from the site *(affects site only)*' },
                { name: '`!ban <user> [minutes] [reason]`', value: 'Ban a user from the site *(affects site only)*' },
                { name: '`!mute <user> [minutes] [reason]`', value: 'Mute a user on the site *(affects site only)*' },
                { name: '`!status`', value: 'View live site status and metrics' },
                { name: '`!messages <#channel> [site_channel]`', value: 'Bridge a Discord channel and import its history to KeepChat' },
                { name: '`!sync-channels`', value: 'Sync website channels to Discord "chat" category with active bridging' },
                { name: '`!ai [question]`', value: 'Ask KeepChat LLaMA AI a question directly' },
                { name: '`!ai on` / `!ai off`', value: 'Toggle AI auto-replies in this channel' },
              ],
            },
          ],
        });
      } else if (command === 'ai' || command === 'ai:') {
        const subCommand = parts[1]?.toLowerCase();
        if (subCommand === 'on' || subCommand === 'off') {
          const bridgedChannel = chatStore.getChannels().find(c => c.discordChannelId === channelId);
          if (!bridgedChannel) {
            await this.sendDiscordMessage(channelId, {
              content: `❌ This Discord channel is not bridged to any KeepChat channel. Please bridge it first with \`!messages\`.`
            });
            return;
          }
          const enabled = subCommand === 'on';
          chatStore.updateChannel(bridgedChannel.id, { discordAiEnabled: enabled });
          await this.sendDiscordMessage(channelId, {
            content: `🤖 **[LLaMA AI Auto-Reply]** Auto-replies in this channel have been turned **${enabled ? 'ON' : 'OFF'}**.`
          });
        } else if (parts[1]) {
          const prompt = parts.slice(1).join(' ');
          await this.sendDiscordMessage(channelId, { content: `⏳ **[LLaMA AI]** Thinking...` });
          try {
            const aiReply = await groqAi.generateResponse({
              prompt,
              senderName: msg.author.username,
              channelId: 'discord-ai-temp',
            });
            await this.sendDiscordMessage(channelId, { content: `🤖 **[LLaMA AI]**:\n${aiReply}` });
          } catch (err: any) {
            await this.sendDiscordMessage(channelId, { content: `❌ AI generation failed: ${err.message}` });
          }
        } else {
          await this.sendDiscordMessage(channelId, {
            content: `🤖 **KeepChat LLaMA AI Utility**\n• Use \`!ai [your question]\` to ask LLaMA a question directly.\n• Use \`!ai on\` / \`!ai off\` to toggle auto-replies for this channel.`
          });
        }
      } else if (command === 'version') {
        await this.sendDiscordMessage(channelId, {
          embeds: [
            {
              title: 'ℹ️ KeepChat System Version',
              color: 0x3b82f6,
              description: 'Real-time synchronization platform and Discord bridge.',
              fields: [
                { name: 'Core Engine', value: '`v5.3.1-release`', inline: true },
                { name: 'AI Architecture', value: 'LLaMA 3.2 3B Instruct', inline: true },
                { name: 'Status', value: '🟢 Operational', inline: true },
                { name: 'Bridge Status', value: '🟢 Bidirectional Gateway Active' }
              ],
              footer: { text: 'Anyone can use this command' },
              timestamp: new Date().toISOString()
            }
          ]
        });
      }
    } catch (err: any) {
      console.error('[Discord Bot] Error handling text command:', err);
    }
  }

  /**
   * Generates formatted logs embed for either general audit logs or specific channel history
   */
  public generateLogsEmbed(channelQuery?: string) {
    if (channelQuery) {
      const cleanName = channelQuery.replace(/^[#<@!>]+/, '').trim().toLowerCase();
      const channels = chatStore.getChannels();
      const channel = channels.find(
        (c) =>
          c.id.toLowerCase() === cleanName ||
          c.name.toLowerCase() === cleanName ||
          `c-${cleanName}` === c.id.toLowerCase()
      );

      if (!channel) {
        return {
          title: `❌ Channel Not Found`,
          description: `Could not find website channel matching \`${channelQuery}\`.\nAvailable channels: ${channels.map((c) => `#${c.name}`).slice(0, 10).join(', ')}`,
          color: 0xef4444,
        };
      }

      const msgs = chatStore.getChannelMessages(channel.id);
      const recent = msgs.slice(-18);

      if (recent.length === 0) {
        return {
          title: `📜 Logs: #${channel.name}`,
          description: `*(No messages recorded yet in #${channel.name})*`,
          color: 0x3b82f6,
          footer: { text: `Channel ID: ${channel.id} • Type: ${channel.type}` },
        };
      }

      const formatted = recent
        .map((m) => {
          const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const text = (m.text || '').replace(/\n/g, ' ').slice(0, 120);
          return `\`[${time}]\` **${m.senderName}**: ${text}`;
        })
        .join('\n');

      return {
        title: `📜 Logs for #${channel.name}`,
        description: formatted,
        color: 0x3b82f6,
        footer: { text: `Displaying last ${recent.length} messages from #${channel.name} on KeepChat` },
        timestamp: new Date().toISOString(),
      };
    }

    // Default: Moderation and reports audit logs
    const reportMsgs = chatStore.getChannelMessages('c-reports') || [];
    const recentReports = reportMsgs.slice(-15);

    if (recentReports.length === 0) {
      return {
        title: `📋 KeepChat Moderation & Audit Logs`,
        description: `*(No recent moderation actions recorded in audit reports)*`,
        color: 0x6366f1,
        footer: { text: 'KeepChat Moderation System' },
      };
    }

    const logLines = recentReports
      .map((m) => {
        const time = new Date(m.createdAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        const summary = m.text.replace(/[\n\r]+/g, ' ').slice(0, 160);
        return `• \`[${time}]\` ${summary}`;
      })
      .join('\n');

    return {
      title: `📋 KeepChat Moderation & Audit Logs`,
      description: logLines,
      color: 0x6366f1,
      footer: { text: `Last ${recentReports.length} audit records` },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute Kick on website user
   */
  public executeKick(query: string, reason: string, modName: string): { success: boolean; message: string } {
    const target = chatStore.findUserByIdOrUsername(query);
    if (!target) {
      return { success: false, message: `❌ User \`${query}\` not found on the KeepChat website.` };
    }

    chatStore.kickUser(target.id);
    const logText = `👢 **[MOD ACTION: DISCORD BOT] Kick**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Reason:** ${reason}\n• **Moderator:** ${modName} (via Discord Bot)`;
    const logMsg = chatStore.logToReports(logText);

    if (this.broadcastFn) {
      this.broadcastFn({ type: 'message:new', data: logMsg });
      this.broadcastFn({ type: 'user:presence', data: { userId: target.id, status: 'offline', lastSeen: Date.now() } });
    }

    return {
      success: true,
      message: `👢 **[Site Kick]** Successfully kicked **${target.displayName}** (@${target.username}) from the website! *(Affects website only)*`,
    };
  }

  /**
   * Execute Ban on website user
   */
  public executeBan(
    query: string,
    durationMinutes: number | undefined,
    reason: string,
    modName: string
  ): { success: boolean; message: string } {
    const target = chatStore.findUserByIdOrUsername(query);
    if (!target) {
      return { success: false, message: `❌ User \`${query}\` not found on the KeepChat website.` };
    }

    chatStore.banUser(target.id, durationMinutes);
    const durStr = durationMinutes ? `${durationMinutes} minutes` : 'Permanent';
    const logText = `⛔ **[MOD ACTION: DISCORD BOT] Ban**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Duration:** ${durStr}\n• **Reason:** ${reason}\n• **Moderator:** ${modName} (via Discord Bot)`;
    const logMsg = chatStore.logToReports(logText);

    if (this.broadcastFn) {
      this.broadcastFn({ type: 'message:new', data: logMsg });
      this.broadcastFn({ type: 'user:presence', data: { userId: target.id, status: 'offline', lastSeen: Date.now() } });
    }

    return {
      success: true,
      message: `⛔ **[Site Ban]** Successfully banned **${target.displayName}** (@${target.username}) from the website (${durStr})! *(Affects website only)*`,
    };
  }

  /**
   * Execute Mute on website user
   */
  public executeMute(
    query: string,
    durationMinutes: number = 10,
    reason: string,
    modName: string
  ): { success: boolean; message: string } {
    const target = chatStore.findUserByIdOrUsername(query);
    if (!target) {
      return { success: false, message: `❌ User \`${query}\` not found on the KeepChat website.` };
    }

    chatStore.muteUser(target.id, durationMinutes);
    const logText = `🔇 **[MOD ACTION: DISCORD BOT] Mute**\n• **Target:** **${target.displayName}** (@${target.username})\n• **Duration:** ${durationMinutes} minutes\n• **Reason:** ${reason}\n• **Moderator:** ${modName} (via Discord Bot)`;
    const logMsg = chatStore.logToReports(logText);

    if (this.broadcastFn) {
      this.broadcastFn({ type: 'message:new', data: logMsg });
    }

    return {
      success: true,
      message: `🔇 **[Site Mute]** Successfully muted **${target.displayName}** (@${target.username}) on the website for ${durationMinutes} minutes! *(Affects website only)*`,
    };
  }

  /**
   * Send response to Discord Interaction
   */
  private async respondInteraction(interaction: any, data: any) {
    if (!this.token) return;
    try {
      await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data,
        }),
      });
    } catch (err) {
      console.error('[Discord Bot] Error responding to interaction:', err);
    }
  }

  /**
   * Send plain message to Discord Channel
   */
  private async sendDiscordMessage(channelId: string, payload: any) {
    if (!this.token) return;
    try {
      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('[Discord Bot] Error sending message to channel:', err);
    }
  }

  /**
   * Send file attachment to Discord Channel
   */
  private async sendDiscordFile(channelId: string, fileBuffer: Buffer, fileName: string, content?: string) {
    if (!this.token) return;
    try {
      const boundary = '----DiscordBotBoundary' + Math.random().toString(36).substring(2);
      const parts: Buffer[] = [];

      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(
            { content: content || '' }
          )}\r\n`
        )
      );

      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: application/json\r\n\r\n`
        )
      );
      parts.push(fileBuffer);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      const fullBody = Buffer.concat(parts);

      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: fullBody,
      });
    } catch (err) {
      console.error('[Discord Bot] Error sending file to Discord channel:', err);
    }
  }

  /**
   * Forward a website message directly to a Discord channel
   */
  public async sendDirectChannelMessage(channelId: string, message: any) {
    if (!this.token || !channelId) return;
    try {
      let content = `**${message.senderName}**: ${message.text}`;
      if (message.attachments && message.attachments.length > 0) {
        content += `\nAttachments: ${message.attachments.map((a: any) => a.url).join(', ')}`;
      }

      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('[Discord Bot] Error sending direct channel message:', err);
    }
  }

  /**
   * Edit original response to Discord Interaction
   */
  private async editInteractionResponse(interaction: any, data: any) {
    if (!this.token) return;
    try {
      await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('[Discord Bot] Error editing interaction response:', err);
    }
  }

  /**
   * Find or create a category named "chat"
   */
  private async findOrCreateChatCategory(guildId: string): Promise<string | null> {
    if (!this.token) return null;
    try {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      if (!res.ok) {
        console.error(`[Discord Bot] Failed to fetch guild channels: ${res.status}`);
        return null;
      }
      const channels = (await res.json()) as any[];
      
      const category = channels.find(
        (c) => c.type === 4 && c.name.toLowerCase() === 'chat'
      );
      if (category) {
        return category.id;
      }

      const createRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'chat',
          type: 4, // GUILD_CATEGORY
        }),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error(`[Discord Bot] Failed to create category: ${createRes.status} ${errText}`);
        return null;
      }
      const newCategory = (await createRes.json()) as any;
      return newCategory.id;
    } catch (err) {
      console.error('[Discord Bot] Error in findOrCreateChatCategory:', err);
      return null;
    }
  }

  /**
   * Find or create a text channel inside a category
   */
  private async findOrCreateTextChannel(guildId: string, categoryId: string, name: string): Promise<string | null> {
    if (!this.token) return null;
    try {
      const cleanName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      if (!res.ok) return null;
      const channels = (await res.json()) as any[];

      const existing = channels.find(
        (c) => c.type === 0 && c.parent_id === categoryId && c.name.toLowerCase() === cleanName
      );
      if (existing) {
        return existing.id;
      }

      const createRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: cleanName,
          type: 0, // GUILD_TEXT
          parent_id: categoryId,
        }),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error(`[Discord Bot] Failed to create text channel: ${createRes.status} ${errText}`);
        return null;
      }
      const newChannel = (await createRes.json()) as any;
      return newChannel.id;
    } catch (err) {
      console.error('[Discord Bot] Error in findOrCreateTextChannel:', err);
      return null;
    }
  }

  /**
   * Import up to 100 past messages from a Discord channel to a website channel
   */
  private async importDiscordChannelMessages(discordChannelId: string, siteChannelId: string): Promise<number> {
    if (!this.token) return 0;
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${discordChannelId}/messages?limit=100`, {
        headers: { Authorization: `Bot ${this.token}` },
      });
      if (!res.ok) {
        console.error(`[Discord Bot] Failed to fetch channel messages: ${res.status}`);
        return 0;
      }
      const messages = (await res.json()) as any[];
      if (!Array.isArray(messages)) return 0;

      messages.reverse();

      let count = 0;
      const existingMsgIds = new Set(chatStore.getChannelMessages(siteChannelId).map((m) => m.id));

      for (const msg of messages) {
        if (!msg.content && (!msg.attachments || msg.attachments.length === 0)) continue;

        const msgId = `msg-discord-${msg.id}`;
        if (existingMsgIds.has(msgId)) continue;

        const authorName = msg.author.global_name || msg.author.username || 'Discord User';
        const authorAvatar = msg.author.avatar ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png` : undefined;

        const attachments = (msg.attachments || []).map((att: any) => ({
          type: att.content_type?.startsWith('image/') ? 'image' : 'file',
          url: att.url,
          name: att.filename,
          size: att.size,
        }));

        const newMessage = {
          id: msgId,
          targetType: 'channel' as const,
          targetId: siteChannelId,
          senderId: `discord-${msg.author.id}`,
          senderName: authorName,
          senderUsername: msg.author.username,
          senderAvatarColor: '#5865f2',
          senderAvatarUrl: authorAvatar,
          text: msg.content || '',
          attachments: attachments.length > 0 ? attachments : undefined,
          reactions: {},
          createdAt: new Date(msg.timestamp).getTime(),
        };

        (chatStore as any).data.messages.push(newMessage);
        count++;

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'message:new',
            data: newMessage,
          });
        }
      }

      if (count > 0) {
        (chatStore as any).data.messages.sort((a: any, b: any) => a.createdAt - b.createdAt);
        chatStore.saveImmediate();
      }

      return count;
    } catch (err) {
      console.error('[Discord Bot] Error importing messages:', err);
      return 0;
    }
  }
}

export const discordBot = new DiscordBotService();
