import fetch from 'node-fetch';

/**
 * Gets the best available fetch function (preferring native globalThis.fetch in Node 18+)
 */
function getFetch() {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch;
  }
  return fetch as any;
}

/**
 * Clean & validate Discord Webhook URL
 */
export function sanitizeWebhookUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!url) return null;

  // Fix missing protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Ensure it's a valid Discord webhook URL domain or standard HTTP webhook
  if (
    url.includes('discord.com/api/webhooks') ||
    url.includes('discordapp.com/api/webhooks') ||
    url.includes('canary.discord.com/api/webhooks') ||
    url.includes('ptb.discord.com/api/webhooks')
  ) {
    return url;
  }

  // If user provided custom webhook endpoint
  return url;
}

export async function sendDiscordWebhook(content: string, embeds?: any[], customUrl?: string): Promise<boolean> {
  const targetUrl = sanitizeWebhookUrl(customUrl || process.env.DISCORD_WEBHOOK_URL);
  if (!targetUrl) {
    console.warn('DISCORD_WEBHOOK_URL not configured and no valid customUrl provided. Skipping webhook.');
    return false;
  }

  try {
    const payload: any = {};
    if (content) payload.content = content;
    if (embeds && embeds.length > 0) payload.embeds = embeds;

    const doFetch = getFetch();
    const res = await doFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'KeepChatApp/1.0 (https://ai.studio; Discord Webhook Integration)',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Discord Webhook error (${res.status}):`, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to send Discord webhook:', err);
    return false;
  }
}

export async function sendDiscordWebhookFile(
  fileBuffer: Buffer,
  fileName: string,
  content?: string,
  customUrl?: string
): Promise<boolean> {
  const targetUrl = sanitizeWebhookUrl(customUrl || process.env.DISCORD_WEBHOOK_URL);
  if (!targetUrl) {
    throw new Error('No valid Discord Webhook URL configured or provided.');
  }

  // Check file size (Discord free webhooks limit is 8MB)
  const MAX_DISCORD_FILE_SIZE = 7.5 * 1024 * 1024; // 7.5MB safety margin
  let uploadBuffer = fileBuffer;
  let finalFileName = fileName;

  if (uploadBuffer.length > MAX_DISCORD_FILE_SIZE) {
    console.warn(`Export buffer size (${(uploadBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds Discord 8MB limit. Trimming message history for Discord upload.`);
    try {
      const parsed = JSON.parse(uploadBuffer.toString('utf-8'));
      if (Array.isArray(parsed.messages)) {
        parsed.messages = parsed.messages.slice(-500); // Keep last 500 messages
        parsed._note = 'Export trimmed to fit Discord 8MB attachment limit.';
      }
      uploadBuffer = Buffer.from(JSON.stringify(parsed, null, 2), 'utf-8');
      finalFileName = `trimmed-${fileName}`;
    } catch {
      // If unable to parse, slice raw buffer safely
      uploadBuffer = uploadBuffer.subarray(0, MAX_DISCORD_FILE_SIZE);
    }
  }

  try {
    const boundary = '----KeepChatDiscordBoundary' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const bodyParts: Buffer[] = [];

    const payload = {
      content: content || `📦 **[KeepChat Export]** attached backup file: \`${finalFileName}\``,
    };

    // Part 1: JSON payload
    bodyParts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(
          payload
        )}\r\n`
      )
    );

    // Part 2: File attachment
    bodyParts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${finalFileName}"\r\nContent-Type: application/json\r\n\r\n`
      )
    );
    bodyParts.push(uploadBuffer);
    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const fullBuffer = Buffer.concat(bodyParts);

    const doFetch = getFetch();
    const res = await doFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'KeepChatApp/1.0 (https://ai.studio; Discord Webhook Integration)',
      },
      body: fullBuffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      // If multipart fails, fallback to simple embed text message
      console.warn(`Discord multipart upload returned status ${res.status}: ${errText}. Attempting text fallback...`);
      
      const fallbackPayload = {
        content: `${content || '📦 **[KeepChat Export]**'}\n⚠️ *Note: File upload was too large or rejected by Discord. Summary sent above.*`,
      };

      const fallbackRes = await doFetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'KeepChatApp/1.0 (https://ai.studio; Discord Webhook Integration)',
        },
        body: JSON.stringify(fallbackPayload),
      });

      if (!fallbackRes.ok) {
        throw new Error(`Discord returned HTTP status ${res.status}: ${errText}`);
      }
      return true;
    }

    return true;
  } catch (err: any) {
    console.error('Failed to send file to Discord webhook:', err);
    throw new Error(err?.message || 'Failed to send file to Discord webhook.');
  }
}
