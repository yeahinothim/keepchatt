import express from 'express';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { chatStore } from './server/storage.ts';
import { siteStyleStore } from './server/siteStyleStore.ts';
import { handleSlashCommand, checkAutoModViolation, canModerate, canEditChannels } from './server/moderation.ts';
import { sendDiscordWebhookFile } from './server/discordWebhook.ts';
import { groqAi } from './server/groqAi.ts';
import { discordBot } from './server/discordBot.ts';
import type { User, WsClientPayload, WsServerPayload } from './src/types.ts';

if (getApps().length === 0) {
  initializeApp({
    projectId: 'true-style-dn50x',
  });
}

const PORT = 3000;
const app = express();
const server = http.createServer(app);

// Static uploads directory for streaming uploads and downloaded media
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(express.json({ limit: '250mb' }));
const SERVER_BUILD_TIME = Date.now();
const SERVER_VERSION = process.env.APP_VERSION || `v4.2.${SERVER_BUILD_TIME}`;

app.use(express.urlencoded({ limit: '250mb', extended: true }));
app.use(cookieParser());

// Build Version Endpoint
app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    version: SERVER_VERSION,
    buildTime: SERVER_BUILD_TIME,
    status: 'ok',
  });
});

// IP Ban Enforcement & Tracking Middleware
app.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  if (chatStore.isIpBanned(ip)) {
    return res.status(403).json({ error: 'Access denied. Your IP address has been banned by workspace moderators.' });
  }
  next();
});

// Helper to extract session token from cookie, auth header, custom header, or query
function extractToken(req: express.Request): string | null {
  const customToken = req.headers['x-session-token'] || req.headers['x-chat-token'];
  if (typeof customToken === 'string' && customToken.trim()) {
    return customToken.trim();
  }
  if (req.cookies?.chat_session) {
    return req.cookies.chat_session;
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  if (typeof req.query?.token === 'string' && req.query.token) {
    return req.query.token;
  }
  return null;
}

// Optional auth: populates req.user if valid token present
interface AuthenticatedRequest extends express.Request {
  user?: User;
  sessionToken?: string;
  clientIp?: string;
}

function getReqIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
}

function optionalAuth(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const token = extractToken(req);
  req.clientIp = getReqIp(req);
  if (token) {
    const user = chatStore.validateSession(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
      chatStore.setUserIp(user.id, req.clientIp);
    }
  }
  next();
}

function requireAuth(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const token = extractToken(req);
  req.clientIp = getReqIp(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No session token found.' });
  }
  const user = chatStore.validateSession(token);
  if (!user) {
    return res.status(401).json({ error: 'Session has expired or is invalid.' });
  }
  if (user.bannedUntil && user.bannedUntil > Date.now()) {
    return res.status(403).json({ error: 'You are currently banned from this workspace.' });
  }
  req.user = user;
  req.sessionToken = token;
  chatStore.setUserIp(user.id, req.clientIp);
  next();
}

// ----------------------------------------------------
// WebSocket Server for Real-Time Events
// ----------------------------------------------------
interface ClientMetadata {
  ws: WebSocket;
  userId?: string;
  username?: string;
  activeVoiceChannel?: string;
}

const clients = new Map<WebSocket, ClientMetadata>();

const wss = new WebSocketServer({ server, path: '/ws' });

function getOnlineUserIds(): string[] {
  const set = new Set<string>();
  for (const meta of clients.values()) {
    if (meta.userId) {
      set.add(meta.userId);
    }
  }
  return Array.from(set);
}

function broadcast(payload: WsServerPayload, excludeWs?: WebSocket) {
  const data = JSON.stringify(payload);
  for (const [ws, meta] of clients.entries()) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        console.error('Failed to send ws message:', err);
      }
    }
  }
}

discordBot.setBroadcast(broadcast);
discordBot.start();

const voiceRooms = new Map<string, Set<string>>(); // channelId -> set of userIds

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const meta: ClientMetadata = { ws };
  clients.set(ws, meta);

  // Try extracting cookie from connection headers if available
  try {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/chat_session=([^;]+)/);
      if (match && match[1]) {
        const user = chatStore.validateSession(decodeURIComponent(match[1]));
        if (user) {
          meta.userId = user.id;
          meta.username = user.username;
        }
      }
    }
  } catch {
    // Ignore cookie extraction error on ws handshake
  }

  // Send initial connected state
  ws.send(
    JSON.stringify({
      type: 'init',
      data: {
        onlineUserIds: getOnlineUserIds(),
        siteShutdown: chatStore.isSiteShutdown(),
        version: SERVER_VERSION,
        buildTime: SERVER_BUILD_TIME,
      },
    } satisfies WsServerPayload)
  );

  // Send active site style
  try {
    ws.send(
      JSON.stringify({
        type: 'sitestyle:updated',
        data: siteStyleStore.getCurrentStyle(),
      } satisfies WsServerPayload)
    );
  } catch {
    // Ignore
  }

  if (meta.userId) {
    broadcast({
      type: 'user:presence',
      data: { userId: meta.userId, status: 'online', lastSeen: Date.now() },
    });
  }

  ws.on('message', (raw: string) => {
    try {
      const msg = JSON.parse(raw.toString()) as any;
      if (msg.type === 'auth') {
        const user = chatStore.validateSession(msg.token);
        if (user) {
          meta.userId = user.id;
          meta.username = user.username;
          broadcast({
            type: 'user:presence',
            data: { userId: user.id, status: 'online', lastSeen: Date.now() },
          });
          ws.send(
            JSON.stringify({
              type: 'init',
              data: {
                onlineUserIds: getOnlineUserIds(),
                siteShutdown: chatStore.isSiteShutdown(),
              },
            } satisfies WsServerPayload)
          );
        }
      } else if (msg.type === 'typing') {
        if (meta.userId && meta.username) {
          broadcast(
            {
              type: 'user:typing',
              data: {
                targetType: msg.targetType,
                targetId: msg.targetId,
                userId: meta.userId,
                username: meta.username,
              },
            },
            ws
          );
        }
      } else if (msg.type === 'call:speaking' && meta.userId) {
        broadcast({
          type: 'call:speaking',
          channelId: msg.channelId,
          userId: meta.userId,
          isSpeaking: Boolean(msg.isSpeaking),
        });
      } else if (msg.type === 'call:state' && meta.userId) {
        broadcast({
          type: 'call:state',
          channelId: msg.channelId,
          userId: meta.userId,
          hasVideo: Boolean(msg.hasVideo),
          isMuted: Boolean(msg.isMuted),
        });
      } else if (msg.type === 'vc:join' && meta.userId) {
        const channelId = msg.channelId;
        const callType = msg.video ? 'video' : 'audio';
        if (!voiceRooms.has(channelId)) {
          voiceRooms.set(channelId, new Set());
        }
        const room = voiceRooms.get(channelId)!;
        const isInitiator = room.size === 0;
        room.add(meta.userId);
        
        meta.activeVoiceChannel = channelId;

        // Log VC Join to #reports
        const joiningUser = chatStore.findUserById(meta.userId);
        const userIp = chatStore.getUserIp(meta.userId);
        const logMsg = chatStore.logToReports(
          `🔊 **[Voice/Video Call Join]** **${joiningUser?.displayName || joiningUser?.username || meta.username}** joined \`#${channelId.replace(/^c-/, '')}\` (${callType} call)`,
          'Call Bot'
        );
        broadcast({ type: 'message:new', data: logMsg });

        // Send list of current participants to the joining user
        ws.send(
          JSON.stringify({
            type: 'vc:participants',
            data: {
              channelId,
              participants: Array.from(room).filter(id => id !== meta.userId),
              callType,
              initiatorId: isInitiator ? meta.userId : undefined,
            }
          })
        );

        // Broadcast to everyone in channel / room
        Array.from(clients.values()).forEach(client => {
          if (client.userId !== meta.userId && room.has(client.userId!) && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'vc:user-joined',
              data: { channelId, userId: meta.userId, callType }
            }));
          }
        });

        // Broadcast room status to all clients
        broadcast({
          type: 'vc:room-status',
          data: {
            channelId,
            participants: Array.from(room),
            count: room.size,
            callType,
          },
        });
      } else if (msg.type === 'vc:leave' && meta.userId) {
        const channelId = msg.channelId;
        meta.activeVoiceChannel = undefined;
        if (voiceRooms.has(channelId)) {
          const room = voiceRooms.get(channelId)!;
          room.delete(meta.userId);

          // Log VC Leave to #reports
          const leavingUser = chatStore.findUserById(meta.userId);
          const logMsg = chatStore.logToReports(
            `🔈 **[Voice Channel Leave]** **${leavingUser?.displayName || leavingUser?.username || meta.username}** left \`#${channelId.replace(/^c-/, '')}\``,
            'Voice Audit Bot'
          );
          broadcast({ type: 'message:new', data: logMsg });
          
          if (room.size === 0) {
            voiceRooms.delete(channelId);
          } else {
            Array.from(clients.values()).forEach(client => {
              if (room.has(client.userId!) && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                  type: 'vc:user-left',
                  data: { channelId, userId: meta.userId }
                }));
              }
            });
          }

          broadcast({
            type: 'vc:room-status',
            data: {
              channelId,
              participants: Array.from(room),
              count: room.size,
            },
          });
        }
      } else if (msg.type === 'vc:signal' && meta.userId) {
        // Forward signal to target user
        Array.from(clients.values()).forEach(client => {
          if (client.userId === msg.targetUserId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'vc:signal',
              data: {
                fromUserId: meta.userId,
                signal: msg.signal,
                channelId: msg.channelId
              }
            }));
          }
        });
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      // Ignore invalid JSON messages
    }
  });

  ws.on('close', () => {
    const leavingUserId = meta.userId;
    const leavingVc = meta.activeVoiceChannel;
    clients.delete(ws);
    
    if (leavingUserId && leavingVc && voiceRooms.has(leavingVc)) {
      const room = voiceRooms.get(leavingVc)!;
      room.delete(leavingUserId);
      if (room.size === 0) {
        voiceRooms.delete(leavingVc);
      } else {
        Array.from(clients.values()).forEach(client => {
          if (room.has(client.userId!) && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'vc:user-left',
              data: { channelId: leavingVc, userId: leavingUserId }
            }));
          }
        });
      }
      broadcast({
        type: 'vc:room-status',
        data: {
          channelId: leavingVc,
          participants: Array.from(room),
          count: room.size,
        },
      });
    }
    if (leavingUserId) {
      // Check if user has other active connections
      const stillActive = Array.from(clients.values()).some((m) => m.userId === leavingUserId);
      if (!stillActive) {
        broadcast({
          type: 'user:presence',
          data: { userId: leavingUserId, status: 'offline', lastSeen: Date.now() },
        });
      }
    }
  });
});

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

let isCustomTokenSupported = true;

// 1. Session verification / Current User
app.get('/api/me', optionalAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user) {
    let customToken = '';
    if (isCustomTokenSupported) {
      try {
        customToken = await getAuth().createCustomToken(req.user.id);
        return res.json({ user: req.user, customToken });
      } catch (e: any) {
        console.warn('[Firebase] Custom token generation failed (likely missing IAM signBlob permissions). Future token creation will be bypassed. Error:', e.message || e);
        isCustomTokenSupported = false;
      }
    }
  }
  res.json({ user: req.user || null });
});

// 2. Signup
app.post('/api/auth/signup', async (req, res) => {
  const { username, displayName, password } = req.body || {};
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  try {
    const { user, token } = chatStore.createUser({
      username,
      displayName: displayName || username,
      password,
    });

    let customToken = '';
    if (isCustomTokenSupported) {
      try {
        customToken = await getAuth().createCustomToken(user.id);
      } catch (e: any) {
        console.warn('[Firebase] Custom token generation failed on signup. Future token creation will be bypassed. Error:', e.message || e);
        isCustomTokenSupported = false;
      }
    }

    // Set HTTP-only persistent cookie for 1 year (remembers the user always)
    res.cookie('chat_session', token, {
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    });

    broadcast({
      type: 'user:updated',
      data: user,
    });

    res.status(201).json({ user, token, customToken });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Signup failed.' });
  }
});

// 3. Login / Auto-Signup
app.post('/api/auth/login', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUser = String(username).trim();
  const existingUser = chatStore.findUserByUsername(cleanUser);
  let result = null;

  if (!existingUser) {
    // Auto-create account if it doesn't exist
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }
    result = chatStore.createUser({
      username: cleanUser,
      displayName: displayName?.trim() || cleanUser,
      password: String(password),
    });
  } else {
    result = chatStore.authenticate(cleanUser, String(password));
    if (!result) {
      return res.status(401).json({ error: 'Incorrect password for existing account.' });
    }
  }

  let customToken = '';
  if (isCustomTokenSupported) {
    try {
      customToken = await getAuth().createCustomToken(result.user.id);
    } catch (e: any) {
      console.warn('[Firebase] Custom token generation failed on login. Future token creation will be bypassed. Error:', e.message || e);
      isCustomTokenSupported = false;
    }
  }

  res.cookie('chat_session', result.token, {
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    path: '/',
  });

  broadcast({
    type: 'user:presence',
    data: { userId: result.user.id, status: 'online', lastSeen: Date.now() },
  });

  res.json({ ...result, customToken });
});

// Site status endpoint
app.get('/api/status', (req, res) => {
  res.json({ siteShutdown: chatStore.isSiteShutdown() });
});

// 4. Logout
app.post('/api/auth/logout', optionalAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionToken) {
    chatStore.removeSession(req.sessionToken);
  }
  res.clearCookie('chat_session', { path: '/' });
  res.json({ success: true });
});

// 5. Update Profile
app.put('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { displayName, avatarColor, avatarUrl, bannerUrl, fontFamily, bio, statusText, status } = req.body || {};
  const updated = chatStore.updateUserProfile(req.user!.id, {
    displayName,
    avatarColor,
    avatarUrl,
    bannerUrl,
    fontFamily,
    bio,
    statusText,
    status,
  });

  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }

  broadcast({
    type: 'user:updated',
    data: updated,
  });

  res.json({ user: updated });
});

// 5.1. Change Password
app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  }

  try {
    const success = chatStore.changePassword(req.user!.id, currentPassword, newPassword);
    if (!success) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to change password.' });
  }
});


// Sign into any historical account / profile
app.post('/api/auth/impersonate', requireAuth, (req: AuthenticatedRequest, res) => {
  const { target } = req.body || {};
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Target username or @user is required.' });
  }

  const targetUser = chatStore.findUserByIdOrUsername(target);
  if (!targetUser) {
    return res.status(404).json({ error: `Could not find user or historical account "${target}".` });
  }

  const token = chatStore.createSession(targetUser.id);
  res.cookie('chat_session', token, {
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    path: '/',
  });

  broadcast({
    type: 'user:presence',
    data: { userId: targetUser.id, status: 'online', lastSeen: Date.now() },
  });

  res.json({
    user: chatStore.sanitizeUser(targetUser),
    token,
  });
});

// Middleware to block regular users if site is in shutdown mode
app.use((req: AuthenticatedRequest, res, next) => {
  if (req.path.startsWith('/api/auth') || req.path === '/api/me' || req.path === '/api/status') {
    return next();
  }
  if (chatStore.isSiteShutdown()) {
    const username = req.user?.username?.toLowerCase();
    const isOwner = req.user && (req.user.role === 'owner' || req.user.role === 'co-owner' || username === 'kep' || username === 'oliverg');
    if (!isOwner) {
      return res.status(503).json({ error: 'The workspace is currently in shutdown maintenance mode. Only owners (kep, oliverg) can access.' });
    }
  }
  next();
});

// Streaming file upload endpoint (bypasses memory buffering, supporting 200MB+ files seamlessly)
app.post('/api/upload', optionalAuth, (req, res) => {
  const originalName = (req.query.filename as string) || 'attachment';
  const cleanExt = path.extname(originalName) || '.bin';
  const safeBase = path.basename(originalName, cleanExt).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'file';
  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}${cleanExt}`;
  const targetPath = path.join(UPLOADS_DIR, uniqueName);

  const writeStream = fs.createWriteStream(targetPath);
  let totalBytes = 0;

  req.on('data', (chunk) => {
    totalBytes += chunk.length;
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    const ext = cleanExt.toLowerCase();
    let type: 'image' | 'video' | 'audio' | 'file' | 'gif' = 'file';
    if (ext === '.gif') type = 'gif';
    else if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.bmp'].includes(ext)) type = 'image';
    else if (['.mp4', '.webm', '.mov', '.mkv', '.ogv'].includes(ext)) type = 'video';
    else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) type = 'audio';

    res.json({
      url: `/uploads/${uniqueName}`,
      name: originalName,
      size: totalBytes,
      type,
    });
  });

  writeStream.on('error', (err) => {
    console.error('File upload write error:', err);
    res.status(500).json({ error: 'Failed to write uploaded file.' });
  });
});

// Download media endpoint (TikTok, YouTube, Twitter/X, Instagram, direct video URLs)
const mediaDownloadCache = new Map<string, { url: string; title: string; duration?: number }>();

function streamDownloadDirect(url: string, destPath: string, res: express.Response) {
  try {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const fileStream = fs.createWriteStream(destPath);
    client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          const outFileName = path.basename(destPath);
          const result = { url: `/uploads/${outFileName}`, title: outFileName };
          mediaDownloadCache.set(url, result);
          res.json(result);
        });
      } else {
        res.status(400).json({ error: 'Could not fetch video from target URL' });
      }
    }).on('error', () => {
      res.status(500).json({ error: 'Download stream request failed' });
    });
  } catch {
    res.status(400).json({ error: 'Invalid URL for media download' });
  }
}

app.get('/api/download-media', async (req, res) => {
  const targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!targetUrl) {
    return res.status(400).json({ error: 'url query parameter is required' });
  }

  // Check cache
  if (mediaDownloadCache.has(targetUrl)) {
    const cached = mediaDownloadCache.get(targetUrl)!;
    const localCheck = path.join(process.cwd(), cached.url.replace(/^\//, ''));
    if (fs.existsSync(localCheck)) {
      return res.json(cached);
    }
  }

  const urlHash = crypto.createHash('md5').update(targetUrl).digest('hex').slice(0, 12);
  const outFileName = `dl-${urlHash}.mp4`;
  const outFilePath = path.join(UPLOADS_DIR, outFileName);

  if (fs.existsSync(outFilePath)) {
    const result = { url: `/uploads/${outFileName}`, title: path.basename(targetUrl) };
    mediaDownloadCache.set(targetUrl, result);
    return res.json(result);
  }

  const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
  if (fs.existsSync(ytDlpPath)) {
    try {
      fs.chmodSync(ytDlpPath, 0o755);
    } catch {}

    const args = [
      '--js-runtimes', 'node',
      '-f', '18/best[ext=mp4]/best',
      '--no-playlist',
      '--max-filesize', '150M',
      '-o', outFilePath,
      targetUrl,
    ];

    execFile(ytDlpPath, args, { timeout: 60000 }, (err, _stdout, stderr) => {
      if (err || !fs.existsSync(outFilePath)) {
        console.warn('yt-dlp failed or file not found, falling back to direct stream:', err?.message, stderr);
        // Fallback to direct stream for direct media links (.mp4, .mov, etc.)
        streamDownloadDirect(targetUrl, outFilePath, res);
      } else {
        const result = { url: `/uploads/${outFileName}`, title: 'Downloaded Video' };
        mediaDownloadCache.set(targetUrl, result);
        res.json(result);
      }
    });
  } else {
    streamDownloadDirect(targetUrl, outFilePath, res);
  }
});

// Music Search & Trending APIs (Spotify-like Integrated Player)
const musicSearchCache = new Map<string, { tracks: any[]; expiresAt: number }>();

app.get('/api/music/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    return res.json({ tracks: [] });
  }

  const cacheKey = query.toLowerCase();
  if (musicSearchCache.has(cacheKey)) {
    const cached = musicSearchCache.get(cacheKey)!;
    if (cached.expiresAt > Date.now()) {
      return res.json({ tracks: cached.tracks });
    }
  }

  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=30`;
    const response = await fetch(itunesUrl, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      return res.json({ tracks: [] });
    }
    const data: any = await response.json();
    const tracks = (data.results || [])
      .filter((item: any) => item.previewUrl && item.trackName)
      .map((item: any) => ({
        id: String(item.trackId),
        title: item.trackName,
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || 'Single',
        duration: Math.round((item.trackTimeMillis || 180000) / 1000),
        artworkUrl: (item.artworkUrl100 || item.artworkUrl60 || '').replace('100x100bb', '600x600bb'),
        streamUrl: item.previewUrl,
        source: 'itunes',
      }));

    musicSearchCache.set(cacheKey, { tracks, expiresAt: Date.now() + 1800000 });
    res.json({ tracks });
  } catch (err: any) {
    console.error('Music search error:', err?.message);
    res.json({ tracks: [] });
  }
});

app.get('/api/music/trending', async (_req, res) => {
  const cacheKey = '__trending__';
  if (musicSearchCache.has(cacheKey)) {
    const cached = musicSearchCache.get(cacheKey)!;
    if (cached.expiresAt > Date.now()) {
      return res.json({ tracks: cached.tracks });
    }
  }

  try {
    // Fetch a vibrant mix of trending hits and classic tracks
    const queries = ['top hits', 'lofi beats', 'synthwave'];
    const selectedQuery = queries[Math.floor(Math.random() * queries.length)];
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(selectedQuery)}&entity=song&limit=25`;
    const response = await fetch(itunesUrl, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const data: any = await response.json();
      const tracks = (data.results || [])
        .filter((item: any) => item.previewUrl && item.trackName)
        .map((item: any) => ({
          id: String(item.trackId),
          title: item.trackName,
          artist: item.artistName || 'Unknown Artist',
          album: item.collectionName || 'Single',
          duration: Math.round((item.trackTimeMillis || 180000) / 1000),
          artworkUrl: (item.artworkUrl100 || item.artworkUrl60 || '').replace('100x100bb', '600x600bb'),
          streamUrl: item.previewUrl,
          source: 'itunes',
        }));

      if (tracks.length > 0) {
        musicSearchCache.set(cacheKey, { tracks, expiresAt: Date.now() + 3600000 });
        return res.json({ tracks });
      }
    }
  } catch {
    // fallback
  }

  // Fallback curated starter tracks
  const fallbackTracks = [
    {
      id: 'lofi-1',
      title: 'Midnight Lofi Chill',
      artist: 'KeepChat Audio Lab',
      album: 'Late Night Sessions',
      duration: 180,
      artworkUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      streamUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
      source: 'custom',
    },
    {
      id: 'synth-1',
      title: 'Cyberpunk Neon Drive',
      artist: 'RetroWave Collective',
      album: 'Outrun Highway',
      duration: 210,
      artworkUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
      streamUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3',
      source: 'custom',
    },
  ];

  res.json({ tracks: fallbackTracks });
});

// Backup Export & Import APIs
app.get('/api/backup/export', optionalAuth, (_req, res) => {
  const backup = chatStore.exportBackup();
  res.setHeader('Content-Disposition', `attachment; filename="keepchat-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(backup);
});

app.post('/api/backup/import', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return res.status(400).json({ error: `Failed to import JSON file: Provided text is not valid JSON (${trimmed.slice(0, 30)}).` });
      }
      payload = JSON.parse(trimmed);
    } else if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Failed to import JSON file: Invalid payload format.' });
    }
    const result = chatStore.importBackup(payload);
    broadcast({ type: 'channel:created', data: chatStore.getChannels()[0] });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to import backup' });
  }
});

// 5.5. Servers API
app.get('/api/servers', optionalAuth, (_req, res) => {
  const servers = chatStore.getServers();
  res.json({ servers });
});

app.post('/api/servers', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, icon, description } = req.body || {};
  try {
    const newServer = chatStore.createServer(
      name || 'New Server',
      icon || '🌐',
      description || '',
      req.user!.id
    );

    // Broadcast categories associated with the new server
    const serverCats = chatStore.getCategories().filter(cat => cat.serverId === newServer.id);
    for (const cat of serverCats) {
      broadcast({ type: 'category:created', data: cat });
    }

    // Broadcast channels associated with the new server
    const serverChannels = chatStore.getChannels().filter(c => c.serverId === newServer.id);
    for (const c of serverChannels) {
      broadcast({ type: 'channel:created', data: c });
    }

    broadcast({ type: 'server:created' as any, data: newServer as any });
    res.status(201).json({ server: newServer });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create server.' });
  }
});

app.put('/api/servers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, icon, description } = req.body || {};
  try {
    const srv = chatStore.getServers().find(s => s.id === req.params.id);
    if (!srv) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    const isOwner = req.user!.username.toLowerCase() === 'kep' || req.user!.username.toLowerCase() === 'keps' || req.user!.role === 'owner' || srv.ownerId === req.user!.id;
    if (!isOwner && !canModerate(req.user!)) {
      return res.status(403).json({ error: 'You do not have permission to configure this server.' });
    }

    const updated = chatStore.updateServer(req.params.id, { name, icon, description });
    if (!updated) {
      return res.status(400).json({ error: 'Failed to update server.' });
    }

    broadcast({ type: 'server:updated' as any, data: updated as any });
    res.json({ server: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not update server.' });
  }
});

app.delete('/api/servers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const srv = chatStore.getServers().find(s => s.id === req.params.id);
    if (!srv) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    const isOwner = req.user!.username.toLowerCase() === 'kep' || req.user!.username.toLowerCase() === 'keps' || req.user!.role === 'owner' || srv.ownerId === req.user!.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Only the server owner or system administrator can delete this server.' });
    }

    const success = chatStore.deleteServer(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Cannot delete server.' });
    }

    broadcast({ type: 'server:deleted' as any, data: { serverId: req.params.id } as any });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not delete server.' });
  }
});

// Join server by invite code or server ID
app.post('/api/servers/join', requireAuth, (req: AuthenticatedRequest, res) => {
  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== 'string') {
    return res.status(400).json({ error: 'Invite code or Server ID is required.' });
  }

  const server = chatStore.joinServerByInvite(inviteCode, req.user!.id);
  if (!server) {
    return res.status(404).json({ error: 'Invalid invite code or server not found.' });
  }

  broadcast({ type: 'server:updated' as any, data: server as any });
  res.json({ success: true, server });
});

// Invite a user to a server
app.post('/api/servers/:id/invite', requireAuth, (req: AuthenticatedRequest, res) => {
  const { targetUserId } = req.body || {};
  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: 'Target user ID is required.' });
  }

  const server = chatStore.inviteUserToServer(req.params.id, targetUserId, req.user!.id);
  if (!server) {
    return res.status(404).json({ error: 'Server not found.' });
  }

  broadcast({ type: 'server:updated' as any, data: server as any });
  res.json({ success: true, server });
});

// Leave a server
app.post('/api/servers/:id/leave', requireAuth, (req: AuthenticatedRequest, res) => {
  const success = chatStore.leaveServer(req.params.id, req.user!.id);
  if (!success) {
    return res.status(400).json({ error: 'Cannot leave default workspace or server owner cannot leave directly.' });
  }

  const updatedSrv = chatStore.getServers().find(s => s.id === req.params.id);
  if (updatedSrv) {
    broadcast({ type: 'server:updated' as any, data: updatedSrv as any });
  }
  res.json({ success: true });
});

// Kick a member from server
app.delete('/api/servers/:id/members/:userId', requireAuth, (req: AuthenticatedRequest, res) => {
  const success = chatStore.removeServerMember(req.params.id, req.params.userId, req.user!.id);
  if (!success) {
    return res.status(400).json({ error: 'Could not remove member from server.' });
  }

  const updatedSrv = chatStore.getServers().find(s => s.id === req.params.id);
  if (updatedSrv) {
    broadcast({ type: 'server:updated' as any, data: updatedSrv as any });
  }
  res.json({ success: true });
});

// Discord Webhook Export API
app.post('/api/export/discord', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { webhookUrl, channelId, serverId } = req.body || {};
    const channelObj = channelId ? chatStore.getChannelById(channelId) : undefined;
    const serverObj = serverId
      ? chatStore.getServers().find((s) => s.id === serverId)
      : channelObj?.serverId
      ? chatStore.getServers().find((s) => s.id === channelObj.serverId)
      : undefined;

    const targetUrl =
      webhookUrl ||
      channelObj?.webhookUrl ||
      serverObj?.webhookUrl ||
      process.env.DISCORD_WEBHOOK_URL;

    if (!targetUrl) {
      return res.status(400).json({ error: 'No Discord Webhook URL provided.' });
    }

    let exportData: any = {};
    let fileName = `keepchat-export-${Date.now()}.json`;
    let summary = '📦 **[KeepChat Export to Discord]**';

    if (channelId) {
      const channel = chatStore.getChannelById(channelId);
      const messages = chatStore.getMessages('channel', channelId);
      exportData = { channel, messages };
      fileName = `channel-${channel?.name || channelId}-export.json`;
      summary = `📦 **[Channel #${channel?.name || channelId} Export]**\n• **Messages:** ${messages.length}`;
    } else if (serverId) {
      const server = chatStore.getServers().find(s => s.id === serverId);
      const channels = chatStore.getChannels().filter(c => c.serverId === serverId);
      exportData = { server, channels };
      fileName = `server-${server?.name || serverId}-export.json`;
      summary = `📦 **[Server "${server?.name || serverId}" Export]**\n• **Channels:** ${channels.length}`;
    } else {
      exportData = chatStore.exportBackup();
      summary = `📦 **[Full Workspace Backup]**\n• **Channels:** ${exportData.channels?.length || 0}\n• **Messages:** ${exportData.messages?.length || 0}`;
    }

    const fileBuffer = Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
    await sendDiscordWebhookFile(fileBuffer, fileName, summary, targetUrl);

    res.json({ success: true, message: 'Exported file successfully sent to Discord Webhook!' });
  } catch (err: any) {
    console.error('Discord export error:', err);
    res.status(500).json({ error: err.message || 'Failed to export to Discord Webhook.' });
  }
});

// 6. Get All Users
app.get('/api/users', optionalAuth, (_req, res) => {
  const users = chatStore.getAllUsers();
  res.json({ users });
});

// 7. Channels
app.get('/api/channels', optionalAuth, (req, res) => {
  const allChannels = chatStore.getChannels();
  const user = (req as any).user;
  
  const filtered = allChannels.filter(c => {
    // 1. Audit reports channel: owner/co-owner/kep only
    if (c.id === 'c-reports') {
      return user && (user.role === 'owner' || user.role === 'co-owner' || user.username?.toLowerCase() === 'kep' || user.username?.toLowerCase() === 'oliverg');
    }

    const allowedView = c.permissions?.canView || c.permissions?.allowedRolesSee;
    // If not restricted or contains '*', anyone can see & read the channel (including read-only channels!)
    if (!allowedView || allowedView.length === 0 || allowedView.includes('*')) {
      return true;
    }

    if (!user) return false;
    if (user.role === 'owner' || user.role === 'co-owner' || user.username?.toLowerCase() === 'kep' || user.username?.toLowerCase() === 'oliverg') {
      return true;
    }
    
    // Check if user has a role that matches allowedView IDs or permissions
    const roles = chatStore.getRoles();
    const userRoles = roles.filter(r => (user.roleIds || []).includes(r.id));
    if (userRoles.some(r => r.permissions?.canModerate || r.permissions?.canEditChannels)) {
      return true;
    }
    
    return (user.roleIds || []).some((rid: string) => allowedView.includes(rid));
  });

  res.json({ channels: filtered });
});

app.post('/api/channels', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, description, topic, type, categoryId, serverId } = req.body || {};
  try {
    const newChannel = chatStore.createChannel({
      name,
      description,
      topic,
      type,
      categoryId,
      createdById: req.user!.id,
      serverId,
    });

    broadcast({
      type: 'channel:created',
      data: newChannel,
    });

    res.status(201).json({ channel: newChannel });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create channel.' });
  }
});

// 8. Channel Messages
app.get('/api/channels/:id/messages', optionalAuth, (req, res) => {
  const channel = chatStore.getChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found.' });
  }
  const messages = chatStore.getMessages('channel', req.params.id);
  res.json({ messages });
});

app.post('/api/channels/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  const channel = chatStore.getChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found.' });
  }

  // 0. Channel typing permission check
  const isOwner =
    req.user!.role === 'owner' ||
    req.user!.role === 'co-owner' ||
    req.user!.username.toLowerCase() === 'kep' ||
    req.user!.username.toLowerCase() === 'oliverg';

  if (!isOwner) {
    const roles = chatStore.getRoles();
    const userRoles = roles.filter((r) => (req.user!.roleIds || []).includes(r.id));
    const isStaff = userRoles.some((r) => r.permissions?.canModerate || r.permissions?.canEditChannels);
    if (!isStaff) {
      const allowedRolesType = channel.permissions?.canType || channel.permissions?.allowedRolesType;
      if (allowedRolesType && allowedRolesType.length > 0 && !allowedRolesType.includes('*')) {
        const canType = (req.user!.roleIds || []).some((rid) => allowedRolesType.includes(rid));
        if (!canType) {
          return res.status(403).json({ error: 'This channel is read-only for your current role.' });
        }
      }
    }
  }

  // 1. Mute check
  if (req.user!.mutedUntil && req.user!.mutedUntil > Date.now()) {
    const remainingMins = Math.ceil((req.user!.mutedUntil - Date.now()) / 60000);
    return res.status(403).json({ error: `You are currently muted for another ${remainingMins} minute(s).` });
  }

  const { text, replyTo, attachments } = req.body || {};
  const hasText = text && typeof text === 'string' && text.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (!hasText && !hasAttachments) {
    return res.status(400).json({ error: 'Message text or attachment is required.' });
  }

  const trimmedText = (text || '').trim();

  // Check embed permissions if sending attachments or links
  if (!isOwner) {
    const roles = chatStore.getRoles();
    const userRoles = roles.filter((r) => (req.user!.roleIds || []).includes(r.id));
    const isStaff = userRoles.some((r) => r.permissions?.canModerate || r.permissions?.canEditChannels);
    if (!isStaff) {
      const allowedRolesEmbed = channel.permissions?.canEmbed || channel.permissions?.allowedRolesEmbed;
      const containsLinkOrMedia = hasAttachments || /https?:\/\//i.test(trimmedText);
      if (containsLinkOrMedia && allowedRolesEmbed && allowedRolesEmbed.length > 0 && !allowedRolesEmbed.includes('*')) {
        const canEmbed = (req.user!.roleIds || []).some((rid) => allowedRolesEmbed.includes(rid));
        if (!canEmbed) {
          return res.status(403).json({ error: 'You do not have permission to post links, media, or attachments in this channel.' });
        }
      }
    }
  }

  // 2. AutoMod Violation Check
  if (trimmedText) {
    const autoModCheck = checkAutoModViolation(trimmedText, req.user!, broadcast);
    if (autoModCheck.blocked) {
      return res.status(400).json({ error: autoModCheck.reason });
    }
  }

  // 3. AI Slash Commands Check (/ai on, /ai off, /aipersistentmemory, /aichannelmemory, /aireset, /aiclear)
  if (trimmedText.startsWith('/ai') || trimmedText.startsWith('/aipersistent') || trimmedText.startsWith('/aichannel')) {
    const aiCmdResult = groqAi.handleCommand(
      trimmedText,
      channel.id,
      req.user!.displayName || req.user!.username
    );
    if (aiCmdResult.handled && aiCmdResult.replyText) {
      const aiCmdMsg = chatStore.createMessage({
        targetType: 'channel',
        targetId: channel.id,
        senderId: 'system-ai',
        senderName: 'AI Assistant',
        senderUsername: 'ai',
        senderAvatarColor: '#8b5cf6',
        text: aiCmdResult.replyText,
      });
      broadcast({
        type: 'message:new',
        data: aiCmdMsg,
      });
      return res.status(200).json({ message: aiCmdMsg });
    }
  }

  // 4. Other Slash Commands check
  if (trimmedText.startsWith('/') && !trimmedText.startsWith('/ai ')) {
    const cmdRes = await handleSlashCommand(
      trimmedText,
      req.user!,
      channel.id,
      broadcast,
      hasAttachments ? attachments : undefined
    );
    if (cmdRes) {
      if (cmdRes.error) {
        return res.status(400).json({ error: cmdRes.error });
      }
      if (cmdRes.switchSession) {
        res.cookie('chat_session', cmdRes.switchSession.token, {
          httpOnly: true,
          maxAge: 365 * 24 * 60 * 60 * 1000,
          sameSite: 'lax',
          path: '/',
        });
        return res.status(200).json({
          message: cmdRes.responseMessage,
          switchSession: cmdRes.switchSession,
        });
      }
      return res.status(200).json({ message: cmdRes.responseMessage });
    }
  }

  // Check if this message will trigger an AI response
  const willTriggerAi = groqAi.shouldRespond(trimmedText, channel.id, replyTo);

  // 5. Regular Message creation
  const message = chatStore.createMessage({
    targetType: 'channel',
    targetId: channel.id,
    senderId: req.user!.id,
    senderName: req.user!.displayName || req.user!.username,
    senderUsername: req.user!.username,
    senderAvatarColor: req.user!.avatarColor,
    senderAvatarUrl: req.user!.avatarUrl,
    text: trimmedText,
    attachments: hasAttachments ? attachments : undefined,
    replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text } : undefined,
  });

  broadcast({
    type: 'message:new',
    data: message,
  });

  res.status(201).json({ message });

  // 6. Asynchronous AI Response generation
  if (willTriggerAi) {
    (async () => {
      try {
        broadcast({
          type: 'user:typing',
          data: {
            targetType: 'channel',
            targetId: channel.id,
            userId: 'system-ai',
            username: 'AI Assistant',
          },
        });

        const replyContextText = replyTo ? replyTo.text : undefined;
        const cooldown = groqAi.checkCooldown(req.user!.id);
        if (cooldown) {
          const cooldownMsg = chatStore.createMessage({
            targetType: 'channel',
            targetId: channel.id,
            senderId: 'system-ai',
            senderName: 'AI Assistant',
            senderAvatarColor: '#f43f5e',
            text: `⏳ **AI is on cooldown.** Please wait ${cooldown} seconds.`,
          });
          broadcast({ type: 'message:new', data: cooldownMsg });
          return;
        }
        groqAi.updateCooldown(req.user!.id);

        const { thinking, final } = await groqAi.generateDeepThoughtResponse({
          prompt: trimmedText,
          senderName: req.user!.displayName || req.user!.username,
          channelId: channel.id,
          replyToText: replyContextText,
        });

        const aiResponseText = `🧠 **Thinking Process:**\n> *${thinking.trim().split('\n').join('\n> ')}*\n\n${final}`;

        const aiMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channel.id,
          senderId: 'system-ai',
          senderName: 'AI Assistant',
          senderUsername: 'ai',
          senderAvatarColor: '#8b5cf6',
          text: aiResponseText,
          replyTo: {
            id: message.id,
            senderName: message.senderName,
            text: message.text,
          },
        });

        broadcast({
          type: 'message:new',
          data: aiMsg,
        });
      } catch (err: any) {
        console.error('Groq AI generation error:', err);
        const errStr = String(err?.message || err);
        const isRateLimit = errStr.includes('429') || errStr.toLowerCase().includes('rate') || errStr.toLowerCase().includes('quota');
        const errorText = isRateLimit
          ? '⏳ **AI Rate Limit Exceeded:** Too many requests. Please wait a moment before sending another prompt.'
          : `⚠️ **AI Generation Error:** ${err?.message || 'Failed to complete AI request.'}`;

        const errorMsg = chatStore.createMessage({
          targetType: 'channel',
          targetId: channel.id,
          senderId: 'system-ai',
          senderName: 'AI Assistant',
          senderUsername: 'ai',
          senderAvatarColor: '#8b5cf6',
          text: errorText,
          replyTo: {
            id: message.id,
            senderName: message.senderName,
            text: message.text,
          },
        });
        broadcast({
          type: 'message:new',
          data: errorMsg,
        });
      }
    })();
  }
});

// 9. Direct Messages
app.get('/api/dms', requireAuth, (req: AuthenticatedRequest, res) => {
  const dms = chatStore.getUserDms(req.user!.id);
  res.json({ dms });
});

app.post('/api/dms', requireAuth, (req: AuthenticatedRequest, res) => {
  const { recipientUserId } = req.body || {};
  if (!recipientUserId) {
    return res.status(400).json({ error: 'recipientUserId is required.' });
  }
  if (recipientUserId === req.user!.id) {
    return res.status(400).json({ error: 'Cannot start a direct message with yourself.' });
  }

  try {
    const dm = chatStore.getOrCreateDm(req.user!.id, recipientUserId);
    res.status(201).json({ dm });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create DM.' });
  }
});

app.get('/api/dms/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
  const dms = chatStore.getUserDms(req.user!.id);
  const dm = dms.find((d) => d.id === req.params.id);
  if (!dm) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }
  const messages = chatStore.getMessages('dm', req.params.id);
  res.json({ messages });
});

app.post('/api/dms/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  const dms = chatStore.getUserDms(req.user!.id);
  const dm = dms.find((d) => d.id === req.params.id);
  if (!dm) {
    return res.status(403).json({ error: 'Access denied to this conversation.' });
  }

  // Mute check
  if (req.user!.mutedUntil && req.user!.mutedUntil > Date.now()) {
    return res.status(403).json({ error: 'You are currently muted.' });
  }

  // Blocking check
  const otherUserId = dm.user1Id === req.user!.id ? dm.user2Id : dm.user1Id;
  const otherUser = chatStore.findUserById(otherUserId);
  if (otherUser && (otherUser.blockedUserIds || []).includes(req.user!.id)) {
    return res.status(403).json({ error: 'You cannot send messages to this user because they have blocked you.' });
  }

  const { text, replyTo, attachments } = req.body || {};
  const hasText = text && typeof text === 'string' && text.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (!hasText && !hasAttachments) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  const trimmedText = (text || '').trim();

  // Slash Commands check in DMs
  if (trimmedText.startsWith('/')) {
    const cmdRes = await handleSlashCommand(
      trimmedText,
      req.user!,
      'c-general',
      broadcast,
      hasAttachments ? attachments : undefined
    );
    if (cmdRes) {
      if (cmdRes.error) {
        return res.status(400).json({ error: cmdRes.error });
      }
      if (cmdRes.switchSession) {
        res.cookie('chat_session', cmdRes.switchSession.token, {
          httpOnly: true,
          maxAge: 365 * 24 * 60 * 60 * 1000,
          sameSite: 'lax',
          path: '/',
        });
        return res.status(200).json({
          message: cmdRes.responseMessage,
          switchSession: cmdRes.switchSession,
        });
      }
      return res.status(200).json({ message: cmdRes.responseMessage });
    }
  }

  const willTriggerAi = groqAi.shouldRespond(trimmedText, dm.id, replyTo);

  const message = chatStore.createMessage({
    targetType: 'dm',
    targetId: dm.id,
    senderId: req.user!.id,
    senderName: req.user!.displayName || req.user!.username,
    senderUsername: req.user!.username,
    senderAvatarColor: req.user!.avatarColor,
    senderAvatarUrl: req.user!.avatarUrl,
    text: trimmedText,
    attachments: hasAttachments ? attachments : undefined,
    replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text } : undefined,
  });

  broadcast({
    type: 'message:new',
    data: message,
  });

  res.status(201).json({ message });

  if (willTriggerAi) {
    (async () => {
      try {
        const replyContextText = replyTo ? replyTo.text : undefined;
        const aiResponseText = await groqAi.generateResponse({
          prompt: trimmedText,
          senderName: req.user!.displayName || req.user!.username,
          channelId: dm.id,
          replyToText: replyContextText,
        });

        const aiMsg = chatStore.createMessage({
          targetType: 'dm',
          targetId: dm.id,
          senderId: 'system-ai',
          senderName: 'AI Assistant',
          senderUsername: 'ai',
          senderAvatarColor: '#8b5cf6',
          text: aiResponseText,
          replyTo: {
            id: message.id,
            senderName: message.senderName,
            text: message.text,
          },
        });

        broadcast({
          type: 'message:new',
          data: aiMsg,
        });
      } catch (err: any) {
        console.error('Groq AI generation error in DM:', err);
      }
    })();
  }
});

// 10. Reactions
app.post('/api/messages/:id/react', requireAuth, (req: AuthenticatedRequest, res) => {
  const { emoji } = req.body || {};
  if (!emoji || typeof emoji !== 'string') {
    return res.status(400).json({ error: 'Emoji is required.' });
  }

  const updatedMsg = chatStore.toggleReaction(req.params.id, req.user!.id, emoji);
  if (!updatedMsg) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  broadcast({
    type: 'message:reaction',
    data: {
      messageId: updatedMsg.id,
      reactions: updatedMsg.reactions,
    },
  });

  res.json({ message: updatedMsg });
});

// 10.5 Edit Message
const handleEditMessageRoute = (req: AuthenticatedRequest, res: any) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  try {
    const updatedMsg = chatStore.editMessage(req.params.id, text, req.user!.id);
    if (!updatedMsg) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    broadcast({
      type: 'message:update',
      data: updatedMsg,
    });

    res.json({ message: updatedMsg });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to edit message.' });
  }
};

app.patch('/api/messages/:id', requireAuth, handleEditMessageRoute);
app.put('/api/messages/:id', requireAuth, handleEditMessageRoute);

// 11. Delete Message
app.delete('/api/messages/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const msg = chatStore.findMessageById(req.params.id);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const deleted = chatStore.deleteMessage(req.params.id, req.user!.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    if (msg.senderId !== req.user!.id) {
      const logText = `🗑️ **[Message Deleted]** A message from **${msg.senderName}** was deleted by moderator **${req.user!.displayName}** in \`${msg.targetType}\`.\n• **Message Content:** ||${msg.text.slice(0, 100)}||`;
      const logMsg = chatStore.logToReports(logText);
      broadcast({ type: 'message:new', data: logMsg });
    }

    broadcast({
      type: 'message:delete',
      data: { messageId: req.params.id },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Cannot delete message.' });
  }
});

// 12. Pin Message
app.post('/api/messages/:id/pin', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const updatedMsg = chatStore.togglePinMessage(req.params.id, req.user!.id);
    if (!updatedMsg) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    broadcast({
      type: 'message:update',
      data: updatedMsg,
    });

    res.json({ message: updatedMsg });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Cannot pin message.' });
  }
});

// 13. Report Message
app.post('/api/messages/:id/report', requireAuth, (req: AuthenticatedRequest, res) => {
  const { reason } = req.body || {};
  const msgId = req.params.id;
  
  const reportedMsg = chatStore.getMessageById(msgId);
  if (!reportedMsg) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  const reportText = `**REPORTED MESSAGE** by ${req.user!.displayName}\n**Reason:** ${reason || 'Inappropriate content'}\n**Sender:** ${reportedMsg.senderName}\n**Text:** ${reportedMsg.text}\n**Message ID:** \`${reportedMsg.id}\`\n\nTo act on this, owners can use the slash commands:\n\`/approve ${reportedMsg.id}\` (Deletes the reported message)\n\`/disapprove ${reportedMsg.id}\` (Dismisses the report)`;

  const reportMessage = chatStore.createMessage({
    targetType: 'channel',
    targetId: 'c-reports',
    senderId: 'system-bot',
    senderName: 'Moderator Bot',
    senderAvatarColor: '#dc2626',
    text: reportText,
  });

  broadcast({
    type: 'message:new',
    data: reportMessage,
  });

  res.json({ success: true });
});

// 13.5. Link Previews & OpenGraph Unfurling
const linkPreviewCache = new Map<string, { data: any; expiresAt: number }>();

app.get('/api/link-preview', async (req, res) => {
  const urlStr = req.query.url as string;
  if (!urlStr || typeof urlStr !== 'string') {
    return res.status(400).json({ error: 'url query parameter is required.' });
  }

  try {
    const parsedUrl = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol.' });
    }

    // Check memory cache
    const cached = linkPreviewCache.get(urlStr);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    // 1. Check if it's YouTube
    const ytRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    const ytMatch = urlStr.match(ytRegex);

    if (ytMatch) {
      const videoId = ytMatch[1];
      let title = 'YouTube';
      let description = 'Share your videos with friends, family, and the world.';
      let authorName = 'YouTube';
      let thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      // Try YouTube oEmbed for rich video title & author
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlStr)}&format=json`;
        const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(3000) });
        if (oembedRes.ok) {
          const oData: any = await oembedRes.json();
          if (oData.title) title = oData.title;
          if (oData.author_name) authorName = oData.author_name;
          if (oData.thumbnail_url) thumbUrl = oData.thumbnail_url;
          description = `YouTube video by ${authorName}. Share your videos with friends, family, and the world.`;
        }
      } catch {
        // Fallback default description
      }

      const previewData = {
        url: urlStr,
        title,
        description,
        siteName: 'YouTube',
        imageUrl: thumbUrl,
        mediaType: 'youtube',
        videoId,
      };

      linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
      return res.json(previewData);
    }

    // 2. Direct media links
    if (urlStr.match(/\.(mp4|webm|mov|mkv)(\?|$)/i)) {
      const previewData = {
        url: urlStr,
        title: urlStr.split('/').pop()?.split('?')[0] || 'Video',
        siteName: parsedUrl.hostname,
        mediaType: 'video',
      };
      linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
      return res.json(previewData);
    }

    if (urlStr.match(/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i)) {
      const previewData = {
        url: urlStr,
        title: urlStr.split('/').pop()?.split('?')[0] || 'Audio',
        siteName: parsedUrl.hostname,
        mediaType: 'audio',
      };
      linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
      return res.json(previewData);
    }

    if (urlStr.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i)) {
      const previewData = {
        url: urlStr,
        title: urlStr.split('/').pop()?.split('?')[0] || 'Image',
        siteName: parsedUrl.hostname,
        imageUrl: urlStr,
        mediaType: 'image',
      };
      linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
      return res.json(previewData);
    }

    // 3. General website metadata fetch
    let title = parsedUrl.hostname;
    let description = `Visit ${parsedUrl.hostname}`;
    let siteName = parsedUrl.hostname.replace(/^www\./, '');
    let imageUrl: string | undefined;
    let mediaType = 'website';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(urlStr, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.startsWith('image/')) {
        const previewData = { url: urlStr, siteName, imageUrl: urlStr, mediaType: 'image' };
        linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
        return res.json(previewData);
      }
      if (contentType.startsWith('video/')) {
        const previewData = { url: urlStr, siteName, mediaType: 'video' };
        linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
        return res.json(previewData);
      }
      if (contentType.startsWith('audio/')) {
        const previewData = { url: urlStr, siteName, mediaType: 'audio' };
        linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
        return res.json(previewData);
      }

      const text = await resp.text();
      const htmlSlice = text.slice(0, 100000);

      // Extract OpenGraph / Meta tags
      const ogTitleMatch = htmlSlice.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i) ||
                           htmlSlice.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
      const titleMatch = htmlSlice.match(/<title[^>]*>([^<]+)<\/title>/i);

      const ogDescMatch = htmlSlice.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["'][^>]+content=["']([^"']+)["']/i) ||
                          htmlSlice.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["']/i);

      const ogImageMatch = htmlSlice.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
                           htmlSlice.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);

      const ogSiteMatch = htmlSlice.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
                          htmlSlice.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:site_name["']/i);

      if (ogTitleMatch?.[1]) title = ogTitleMatch[1].trim();
      else if (titleMatch?.[1]) title = titleMatch[1].trim();

      if (ogDescMatch?.[1]) description = ogDescMatch[1].trim();
      if (ogSiteMatch?.[1]) siteName = ogSiteMatch[1].trim();

      if (ogImageMatch?.[1]) {
        const rawImg = ogImageMatch[1].trim();
        try {
          imageUrl = new URL(rawImg, urlStr).href;
        } catch {
          imageUrl = rawImg;
        }
      }
    } catch {
      // Use fallback defaults
    }

    const previewData = {
      url: urlStr,
      title,
      description,
      siteName,
      imageUrl,
      mediaType,
    };

    linkPreviewCache.set(urlStr, { data: previewData, expiresAt: Date.now() + 3600000 });
    return res.json(previewData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate link preview.' });
  }
});

// 13.6. Site Style API
app.get('/api/site-style', (_req, res) => {
  res.json({ style: siteStyleStore.getCurrentStyle() });
});

// 13.7. Media Downloader Endpoint (yt-dlp)
app.get('/api/download-media', async (req, res) => {
  const urlStr = req.query.url as string;
  if (!urlStr || typeof urlStr !== 'string') {
    return res.status(400).json({ error: 'url parameter is required.' });
  }

  try {
    const parsedUrl = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol.' });
    }

    const hash = crypto.createHash('md5').update(urlStr).digest('hex').slice(0, 10);
    const fileName = `media_${hash}.mp4`;
    const outputPath = path.join(UPLOADS_DIR, fileName);
    const publicUrl = `/uploads/${fileName}`;

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
      return res.json({
        url: publicUrl,
        filename: fileName,
        title: 'Downloaded Media',
      });
    }

    const ytDlpPath = path.join(process.cwd(), 'yt-dlp');
    const binaryToRun = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';

    const downloadWithYtDlp = () =>
      new Promise<{ success: boolean; title?: string }>((resolve) => {
        execFile(
          binaryToRun,
          [
            '-f',
            'b[ext=mp4]/best[ext=mp4]/b/best',
            '-o',
            outputPath,
            '--no-playlist',
            '--force-overwrites',
            '--no-warnings',
            urlStr,
          ],
          { timeout: 45000 },
          (err, stdout) => {
            if (!err && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
              resolve({ success: true, title: stdout.slice(0, 100).trim() || 'Downloaded Media' });
            } else {
              resolve({ success: false });
            }
          }
        );
      });

    const ytResult = await downloadWithYtDlp();
    if (ytResult.success) {
      return res.json({
        url: publicUrl,
        filename: fileName,
        title: ytResult.title || 'Downloaded Media',
      });
    }

    // Direct fetch fallback for MP4 / WebM or direct stream URLs
    try {
      const fetchRes = await fetch(urlStr, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (fetchRes.ok) {
        const buffer = Buffer.from(await fetchRes.arrayBuffer());
        if (buffer.length > 500) {
          fs.writeFileSync(outputPath, buffer);
          return res.json({
            url: publicUrl,
            filename: fileName,
            title: urlStr.split('/').pop()?.split('?')[0] || 'Media File',
          });
        }
      }
    } catch {
      // Ignore
    }

    return res.status(500).json({
      error: 'Could not fetch video from target URL. Please verify the URL or video availability.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to download media.' });
  }
});

// 13.5 Channel Reordering (MUST BE BEFORE /api/channels/:id)
app.put('/api/channels/reorder', optionalAuth, (req, res) => {
  const { channelIds } = req.body || {};
  if (!Array.isArray(channelIds)) {
    return res.status(400).json({ error: 'channelIds array required' });
  }
  const updated = chatStore.reorderChannels(channelIds);
  broadcast({ type: 'channels:reordered', data: updated });
  res.json({ channels: updated });
});

// 14. Channel Editing (Name, Topic, Slowmode, Permissions)
app.put('/api/channels/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!, req.params.id)) {
    return res.status(403).json({ error: 'You do not have permission to edit this channel.' });
  }

  const { name, description, topic, slowmodeMs, permissions, categoryId } = req.body || {};
  const updated = chatStore.updateChannel(req.params.id, {
    name,
    description,
    topic,
    slowmodeMs,
    permissions,
    categoryId,
  });

  if (!updated) {
    return res.status(404).json({ error: 'Channel not found.' });
  }

  const logMsg = chatStore.logToReports(
    `⚙️ **[Channel Updated]** **#${updated.name}** was updated by **${req.user!.displayName}** (Slowmode: ${updated.slowmodeMs ? `${updated.slowmodeMs / 1000}s` : 'Off'})`
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'channel:updated', data: updated });

  res.json({ channel: updated });
});

app.delete('/api/channels/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!, req.params.id)) {
    return res.status(403).json({ error: 'You do not have permission to delete this channel.' });
  }
  const success = chatStore.deleteChannel(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Channel not found.' });
  }
  
  const logMsg = chatStore.logToReports(
    `🗑️ **[Channel Deleted]** A channel was deleted by **${req.user!.displayName}**`
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'channel:deleted', data: { channelId: req.params.id } });
  res.json({ success: true });
});

app.patch('/api/channels/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!, req.params.id)) {
    return res.status(403).json({ error: 'You do not have permission to edit this channel.' });
  }
  const { categoryId } = req.body;
  const updatedCh = chatStore.updateChannel(req.params.id, { categoryId });
  if (!updatedCh) return res.status(404).json({ error: 'Channel not found' });
  broadcast({ type: 'channel:updated', data: updatedCh });
  res.json({ channel: updatedCh });
});

// Categories API
app.get('/api/categories', optionalAuth, (_req, res) => {
  res.json({ categories: chatStore.getCategories() });
});

app.post('/api/categories', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, serverId } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  try {
    const category = chatStore.createCategory(name.trim(), serverId);
    broadcast({ type: 'category:created', data: category });
    res.status(201).json({ category });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create category.' });
  }
});

app.delete('/api/categories/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const ok = chatStore.deleteCategory(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  broadcast({ type: 'category:deleted', data: { categoryId: req.params.id } });
  res.json({ success: true });
});

app.put('/api/categories/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to edit categories.' });
  }
  const { name, permissions, isPrivate, syncChannels } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  try {
    const category = chatStore.updateCategory(req.params.id, name.trim(), {
      permissions,
      isPrivate,
      syncChannels,
    });
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    broadcast({ type: 'category:updated', data: category });
    if (syncChannels) {
      broadcast({ type: 'channels:reordered', data: chatStore.getChannels() });
    }
    res.json({ category });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update category.' });
  }
});

// 15. Roles API
app.get('/api/roles', optionalAuth, (_req, res) => {
  res.json({ roles: chatStore.getRoles() });
});

app.put('/api/roles/reorder', requireAuth, (req: AuthenticatedRequest, res) => {
  const { roleIds } = req.body || {};
  if (!Array.isArray(roleIds)) {
    return res.status(400).json({ error: 'roleIds array required' });
  }
  const updated = chatStore.reorderRoles(roleIds);
  broadcast({ type: 'roles:reordered', data: updated });
  res.json({ roles: updated });
});

app.post('/api/roles', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to create roles.' });
  }
  const { name, color, permissions } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Role name is required.' });
  }

  const role = chatStore.createRole(name.trim(), color, permissions);
  const logMsg = chatStore.logToReports(
    `✨ **[Role Created]** Role **@${role.name}** was created by **${req.user!.displayName}**`
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'role:created', data: role });

  res.status(201).json({ role });
});

app.put('/api/roles/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to modify roles.' });
  }
  const updated = chatStore.updateRole(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Role not found.' });
  }

  broadcast({ type: 'role:updated', data: updated });
  res.json({ role: updated });
});

app.delete('/api/roles/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to delete roles.' });
  }
  const success = chatStore.deleteRole(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Role not found.' });
  }

  const logMsg = chatStore.logToReports(
    `🗑️ **[Role Deleted]** A role was deleted by **${req.user!.displayName}**`
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'role:deleted', data: { roleId: req.params.id } });

  res.json({ success: true });
});

app.post('/api/roles/assign', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to assign roles.' });
  }
  const { userId, roleId } = req.body || {};
  if (!userId || !roleId) {
    return res.status(400).json({ error: 'userId and roleId are required.' });
  }

  const result = chatStore.assignRole(userId, roleId);
  if (!result) {
    return res.status(404).json({ error: 'User or role not found.' });
  }

  const logMsg = chatStore.logToReports(
    `🎖️ **[Role Assigned]** **${req.user!.displayName}** assigned role **@${result.role.name}** to **${result.user.displayName}**`
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'user:updated', data: result.user });

  res.json({ success: true, user: result.user, role: result.role });
});

app.post('/api/roles/remove', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canEditChannels(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to remove roles.' });
  }
  const { userId, roleId } = req.body || {};
  if (!userId || !roleId) {
    return res.status(400).json({ error: 'userId and roleId are required.' });
  }

  const result = chatStore.removeRole(userId, roleId);
  if (!result) {
    return res.status(404).json({ error: 'User or role not found.' });
  }

  const logMsg = chatStore.logToReports(
    `⚠️ **[Role Removed]** **${req.user!.displayName}** removed role **@${result.role.name}** from **${result.user.displayName}**`
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'user:updated', data: result.user });

  res.json({ success: true, user: result.user, role: result.role });
});

// 16. AutoMod API
app.get('/api/automod', requireAuth, (_req, res) => {
  res.json({ automod: chatStore.getAutoMod() });
});

app.put('/api/automod', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canModerate(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to configure AutoMod.' });
  }

  const updated = chatStore.updateAutoMod(req.body || {});
  const logMsg = chatStore.logToReports(
    `🛡️ **[AutoMod Updated]** Configuration updated by **${req.user!.displayName}**\n• Slowmode: ${updated.slowmodeMs ? `${updated.slowmodeMs / 1000}s` : 'Off'}\n• Action: ${updated.action}\n• Filtered Words: ${updated.filteredWords.length} words`,
    'AutoMod Config'
  );
  broadcast({ type: 'message:new', data: logMsg });
  broadcast({ type: 'automod:updated', data: updated });

  res.json({ automod: updated });
});

// Discord Bot Integration Endpoints
app.get('/api/discord-bot/status', requireAuth, (_req, res) => {
  res.json(discordBot.getStatus());
});

app.post('/api/discord-bot/config', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canModerate(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to configure Discord Bot.' });
  }
  const { token } = req.body || {};
  if (typeof token === 'string') {
    discordBot.setToken(token);
  }
  res.json({ success: true, status: discordBot.getStatus() });
});

app.post('/api/discord-bot/test-command', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!canModerate(req.user!)) {
    return res.status(403).json({ error: 'You do not have permission to test Discord Bot commands.' });
  }

  const { command, target, reason, duration, channel } = req.body || {};
  const modName = req.user?.displayName || req.user?.username || 'Admin';

  if (command === 'kick' && target) {
    const result = discordBot.executeKick(target, reason || 'Tested from web console', modName);
    return res.json(result);
  }
  if (command === 'ban' && target) {
    const result = discordBot.executeBan(target, duration, reason || 'Tested from web console', modName);
    return res.json(result);
  }
  if (command === 'mute' && target) {
    const result = discordBot.executeMute(target, duration || 10, reason || 'Tested from web console', modName);
    return res.json(result);
  }
  if (command === 'logs') {
    const embed = discordBot.generateLogsEmbed(channel);
    return res.json({ success: true, embed });
  }
  if (command === 'export') {
    return res.json({
      success: true,
      message: 'Use GET /api/export to download the full backup file.',
    });
  }

  return res.status(400).json({ error: 'Unknown command or missing parameters' });
});

app.get('/api/uptime', (req, res) => {
  res.json({ uptime: chatStore.getUptime() });
});

app.get('/api/export', (req, res) => {
  const backup = chatStore.exportBackup();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="keepchat-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(backup));
});

// 17. Group DMs
app.post('/api/dms/group', requireAuth, (req: AuthenticatedRequest, res) => {
  const { memberIds, name } = req.body || {};
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: 'memberIds must be an array with at least one recipient.' });
  }

  try {
    const groupDm = chatStore.createGroupDm(req.user!.id, memberIds, name);
    res.status(201).json({ dm: groupDm });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not create group chat.' });
  }
});

// 18. User Blocking and Friends
app.post('/api/users/:id/block', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot block yourself.' });
  }

  try {
    const result = chatStore.toggleBlockUser(req.user!.id, req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not block user.' });
  }
});

app.post('/api/users/:id/friend', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot friend yourself.' });
  }

  try {
    const result = chatStore.toggleFriend(req.user!.id, req.params.id);
    broadcast({ type: 'user:updated', data: result.user });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not toggle friend.' });
  }
});

// 19. Ping Moderator (+ button or /pingmod)
app.post('/api/ping-mod', requireAuth, (req: AuthenticatedRequest, res) => {
  const { reason, channelName } = req.body || {};
  const userIp = chatStore.getUserIp(req.user!.id);
  const text = `🚨 **[PING MODERATOR]** **${req.user!.displayName}** (@${req.user!.username}) requested moderator assistance!\n• **Location:** \`#${channelName || 'general'}\`\n• **Reason:** ${reason || 'Immediate help needed'}\n• **User IP:** \`${userIp}\`\n• **Timestamp:** ${new Date().toLocaleTimeString()}`;

  const logMsg = chatStore.logToReports(text, 'Urgent Mod Alert');
  broadcast({ type: 'message:new', data: logMsg });

  res.json({ success: true, message: logMsg });
});

// 20. Individual User Browser & Oceania Proxy API
app.get('/api/browser/state', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || 'guest-session';
    const state = chatStore.getUserBrowserState(userId);
    res.json({ success: true, state });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch browser state.' });
  }
});

app.post('/api/browser/state', optionalAuth, (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || 'guest-session';
    const updated = chatStore.updateUserBrowserState(userId, req.body);
    res.json({ success: true, state: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update browser state.' });
  }
});

app.get('/api/browser/proxy', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const targetUrl = (req.query.url as string || '').trim();
  if (!targetUrl) {
    return res.status(400).json({ error: 'url query parameter is required' });
  }

  let finalUrl = targetUrl;
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
      finalUrl = `https://${finalUrl}`;
    } else {
      finalUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl)}`;
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(finalUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || 'text/html';

    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      let html = await response.text();
      const origin = new URL(finalUrl).origin;

      // Strip Content-Security-Policy meta tags that block iframe rendering
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

      // Inject base tag so relative links, styles, and images resolve to original host
      // Also inject a postMessage link click interceptor script
      const scriptTag = `
<script>
(function() {
  document.addEventListener('click', function(e) {
    var anchor = e.target.closest('a');
    if (!anchor) return;
    
    var href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    
    try {
      // Resolve absolute URL based on document.baseURI
      var targetUrl = new URL(href, document.baseURI).href;
      var currentOrigin = new URL(document.baseURI).origin;
      var targetOrigin = new URL(targetUrl).origin;
      
      if (targetOrigin === currentOrigin) {
        // Internal link -> Navigate in-place via parent proxy
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ type: 'proxy-navigate', url: targetUrl }, '*');
      } else {
        // External link -> Let it open in a new tab (target="_blank" is default on base tag)
        anchor.setAttribute('target', '_blank');
      }
    } catch (err) {
      console.error('Proxy link resolution error:', err);
    }
  }, true);
})();
</script>
`;
      const baseTag = `<base href="${origin}/" target="_blank">${scriptTag}`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else if (html.includes('<HEAD>')) {
        html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
      } else {
        html = `${baseTag}${html}`;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Oceania-Proxy', 'Active (AU/NZ Node - Sydney Hub)');
      return res.send(html);
    }

    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Oceania-Proxy', 'Active (AU/NZ Node)');
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Oceania Secure Gateway - ${finalUrl}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f8fafc; margin: 0; padding: 32px 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; text-align: center; box-sizing: border-box; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; max-width: 620px; width: 100%; box-shadow: 0 20px 35px -10px rgba(0,0,0,0.5); }
    h1 { color: #38bdf8; font-size: 22px; font-weight: 700; margin: 0 0 10px 0; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25); padding: 5px 14px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #090d16; padding: 10px 14px; border-radius: 8px; color: #7dd3fc; word-break: break-all; margin-bottom: 24px; border: 1px solid #1e293b; font-size: 13px; }
    .btn-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn { background: #0284c7; color: white; border: none; padding: 10px 22px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
    .btn:hover { background: #0369a1; transform: translateY(-1px); }
    .btn-secondary { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; }
    .btn-secondary:hover { background: #334155; color: white; }
    .quick-links { margin-top: 24px; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; }
    .quick-links a { color: #38bdf8; text-decoration: none; margin: 0 8px; }
    .quick-links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Oceania Gateway Reader (Sydney/Auckland Node)</div>
    <h1>Secure Web Reader</h1>
    <p>Target site requires direct browser execution or protected TLS handshake. You can open it in a new window or use our DuckDuckGo / Wikipedia gateway below.</p>
    <div class="url">${finalUrl}</div>
    <div class="btn-row">
      <a href="${finalUrl}" target="_blank" rel="noopener noreferrer" class="btn">Open in New Tab ↗</a>
      <a href="/api/browser/proxy?url=https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl)}" class="btn btn-secondary">Search DuckDuckGo 🔍</a>
      <a href="/api/browser/proxy?url=https://en.wikipedia.org/wiki/Main_Page" class="btn btn-secondary">Wikipedia 📚</a>
    </div>
    <div class="quick-links">
      Quick Sites:
      <a href="/api/browser/proxy?url=https://news.ycombinator.com">Hacker News</a> •
      <a href="/api/browser/proxy?url=https://en.wikipedia.org">Wikipedia</a> •
      <a href="/api/browser/proxy?url=https://lite.cnn.com">CNN Lite</a> •
      <a href="/api/browser/proxy?url=https://text.npr.org">NPR Text</a>
    </div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Oceania-Proxy', 'Active (AU/NZ Node - Gateway Fallback)');
    res.send(fallbackHtml);
  }
});

// Global Error Handler for RangeNotSatisfiableError and other Express errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.status === 416 || err.statusCode === 416 || err.name === 'RangeNotSatisfiableError' || err.message?.includes('Range Not Satisfiable') || err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    if (!res.headersSent) {
      return res.status(416).send('Range Not Satisfiable');
    }
    return;
  }
  console.error('Express Error:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  }
});

// ----------------------------------------------------
// Vite Integration (Dev vs Prod)
// ----------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chat application running on port ${PORT}`);
  });
}

start();
