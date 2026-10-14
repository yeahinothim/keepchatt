import { GoogleGenAI } from '@google/genai';
import type { Message, WsServerPayload } from '../src/types.ts';
import { chatStore } from './storage.ts';

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const SECONDARY_FALLBACK_MODEL = 'gemini-3.6-flash';
const PRIMARY_LLAMA_MODEL = 'llama-3.3-70b-versatile';
const SECONDARY_LLAMA_MODEL = 'llama-3.1-8b-instant';

interface ChatMessageContext {
  role: 'user' | 'model';
  content: string;
}

export class GeminiAiService {
  private aiClient: GoogleGenAI | null = null;
  private groqApiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || '';
  private channelEnabled: Map<string, boolean> = new Map();
  private lastUsage: Map<string, number> = new Map(); // For cooldown
  private persistentMemoryEnabled = true;
  private channelMemoryEnabled = true;
  private persistentHistory: ChatMessageContext[] = [];
  private channelHistories: Map<string, ChatMessageContext[]> = new Map();

  constructor() {
    this.initClient();
  }

  public checkCooldown(userId: string): number | null {
    if (userId === 'kep') return null; // No cooldown for kep
    const last = this.lastUsage.get(userId) || 0;
    const now = Date.now();
    const cooldown = 30 * 1000;
    if (now - last < cooldown) {
      return Math.ceil((cooldown - (now - last)) / 1000);
    }
    return null;
  }

  public updateCooldown(userId: string) {
    if (userId !== 'kep') {
      this.lastUsage.set(userId, Date.now());
    }
  }

  private initClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!this.aiClient && apiKey) {
      this.aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    if (!this.aiClient) {
      this.aiClient = new GoogleGenAI({
        apiKey: apiKey || '',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return this.aiClient;
  }

  public async generateDeepThoughtResponse(params: {
    prompt: string;
    senderName: string;
    channelId: string;
    replyToText?: string;
  }): Promise<{ thinking: string; final: string }> {
    const thinkingPrompt = `You are "AI Assistant". You have a 'deepthinking' capability. 
    User query: "${params.prompt}"
    Think deeply about this query, analyze it, and provide your thought process in a concise way.`;
    
    const finalPrompt = `Based on your thought process, provide the final response to the user query.`;

    const thinking = await this.callWithLlamaFallback(
      [{ role: 'user', parts: [{ text: thinkingPrompt }] }],
      "You are a deep thinking AI",
      PRIMARY_MODEL
    );
    const final = await this.callWithLlamaFallback(
      [
        { role: 'user', parts: [{ text: thinkingPrompt }] },
        { role: 'model', parts: [{ text: thinking }] },
        { role: 'user', parts: [{ text: finalPrompt }] },
      ],
      "You are a deep thinking AI",
      PRIMARY_MODEL
    );
    
    return { thinking, final };
  }

  public setGroqApiKey(key: string) {
    this.groqApiKey = key.trim();
    process.env.GROQ_API_KEY = key.trim();
  }

  public setApiKey(key: string) {
    if (key && key.trim()) {
      process.env.GEMINI_API_KEY = key.trim();
      this.aiClient = new GoogleGenAI({
        apiKey: key.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  /**
   * Fallback to LLaMA models via Groq API (or Ollama / OpenRouter)
   */
  public async callLlama(
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string,
    preferredModel: string = PRIMARY_LLAMA_MODEL
  ): Promise<string> {
    const key = this.groqApiKey || process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || process.env.OPENROUTER_API_KEY;
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    if (key) {
      try {
        const endpoint = process.env.LLAMA_API_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: preferredModel,
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 2048,
          }),
        });

        if (!res.ok) {
          if (preferredModel !== SECONDARY_LLAMA_MODEL) {
            return this.callLlama(messages, systemPrompt, SECONDARY_LLAMA_MODEL);
          }
          const errText = await res.text();
          throw new Error(`LLaMA API error (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as any;
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
      } catch (err: any) {
        console.warn(`[AI] LLaMA API call with model ${preferredModel} failed:`, err?.message || err);
        if (preferredModel !== SECONDARY_LLAMA_MODEL) {
          return this.callLlama(messages, systemPrompt, SECONDARY_LLAMA_MODEL);
        }
        throw err;
      }
    }

    throw new Error('LLaMA fallback model could not be reached (no GROQ_API_KEY configured).');
  }

  private async callWithLlamaFallback(
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
    systemInstruction: string,
    modelName: string = PRIMARY_MODEL
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = contents.map((c) => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts.map((p) => p.text).join('\n'),
    }));
    const prompt = messages[messages.length - 1]?.content || '';

    // 1. Try lightweight LLaMA first!
    try {
      console.log('[AI] Running lightweight LLaMA mode on server (Primary)...');
      
      // Try Groq LLaMA if key exists
      const key = this.groqApiKey || process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || process.env.OPENROUTER_API_KEY;
      if (key) {
        try {
          return await this.callLlama(messages, systemInstruction, SECONDARY_LLAMA_MODEL); // llama-3.1-8b-instant is extremely lightweight & fast
        } catch (llamaErr: any) {
          console.warn('[AI] Groq LLaMA failed, trying HF Serverless...', llamaErr.message);
        }
      }

      // Try Hugging Face free LLaMA 3.2 3B Instruct
      const hfEndpoint = 'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct';
      const response = await fetch(hfEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: `<|system|>\n${systemInstruction}\n<|user|>\n${prompt}\n<|assistant|>\n`,
          parameters: {
            max_new_tokens: 1024,
            temperature: 0.7,
            return_full_text: false,
          }
        }),
      });

      if (response.ok) {
        const resData = (await response.json()) as any;
        let generatedText = '';
        if (Array.isArray(resData) && resData[0]?.generated_text) {
          generatedText = resData[0].generated_text;
        } else if (resData?.generated_text) {
          generatedText = resData.generated_text;
        }
        if (generatedText) {
          return generatedText.replace(/<\|system\|>|<\|user\|>|<\|assistant\|>/g, '').trim();
        }
      }
    } catch (err: any) {
      console.warn('[AI] Lightweight LLaMA mode failed, falling back to existing models...', err.message);
    }

    // 2. Fall back to existing Gemini models!
    try {
      console.log(`[AI] Falling back to primary Gemini model: ${modelName}`);
      return await this.callGemini(contents, systemInstruction, modelName);
    } catch (geminiErr: any) {
      console.warn(`[AI] Primary Gemini failed, falling back to alternate: ${FALLBACK_MODEL}...`);
      try {
        return await this.callGemini(contents, systemInstruction, FALLBACK_MODEL);
      } catch {
        return await this.callGemini(contents, systemInstruction, SECONDARY_FALLBACK_MODEL);
      }
    }
  }

  public isAiEnabledForChannel(channelId: string): boolean {
    if (this.channelEnabled.has(channelId)) {
      return Boolean(this.channelEnabled.get(channelId));
    }
    return true; // Enabled by default
  }

  public setAiEnabledForChannel(channelId: string, enabled: boolean) {
    this.channelEnabled.set(channelId, enabled);
  }

  public setPersistentMemory(enabled: boolean) {
    this.persistentMemoryEnabled = enabled;
  }

  public setChannelMemory(enabled: boolean) {
    this.channelMemoryEnabled = enabled;
  }

  public clearMemory(channelId?: string) {
    if (channelId) {
      this.channelHistories.delete(channelId);
    } else {
      this.persistentHistory = [];
      this.channelHistories.clear();
    }
  }

  public getMemoryStatus(channelId?: string) {
    return {
      persistentMemory: this.persistentMemoryEnabled,
      channelMemory: this.channelMemoryEnabled,
      persistentItems: this.persistentHistory.length,
      channelItems: channelId ? (this.channelHistories.get(channelId)?.length || 0) : 0,
      aiEnabledInChannel: channelId ? this.isAiEnabledForChannel(channelId) : true,
    };
  }

  public handleCommand(
    commandStr: string,
    channelId: string,
    userName: string
  ): { handled: boolean; replyText?: string } {
    const trimmed = commandStr.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts[1]?.toLowerCase();

    if (cmd === '/ai') {
      if (!arg) {
        return {
          handled: true,
          replyText: `🤖 **Gemini AI Assistant Commands & Usage:**\n- **/ai on** - Enable AI in this channel\n- **/ai off** - Disable AI in this channel\n- **/ai [prompt]** - Ask AI directly\n- **/aipersistentmemory [on/off/clear]** - Global persistent memory\n- **/aichannelmemory [on/off/clear]** - Channel-specific message context\n- **/aireset** - Clear AI conversation memory\n\n💡 *Tip: You can talk to Gemini AI anytime by typing \`@ai\` in your message or replying directly to an AI message!*`,
        };
      }
      if (arg === 'on') {
        this.setAiEnabledForChannel(channelId, true);
        return { handled: true, replyText: `✅ **AI Assistant is now enabled** in this channel.` };
      }
      if (arg === 'off') {
        this.setAiEnabledForChannel(channelId, false);
        return { handled: true, replyText: `🛑 **AI Assistant is now disabled** in this channel. (Type \`/ai on\` to re-enable)` };
      }
      return { handled: false };
    }

    if (cmd === '/aipersistentmemory') {
      if (arg === 'on') {
        this.setPersistentMemory(true);
        return { handled: true, replyText: `🧠 **AI Persistent Memory is now ON.** The AI will remember context across channels.` };
      }
      if (arg === 'off') {
        this.setPersistentMemory(false);
        return { handled: true, replyText: `🧠 **AI Persistent Memory is now OFF.**` };
      }
      if (arg === 'clear') {
        this.persistentHistory = [];
        return { handled: true, replyText: `🧹 **AI Persistent Memory has been cleared.**` };
      }
      return {
        handled: true,
        replyText: `🧠 **AI Persistent Memory**: ${this.persistentMemoryEnabled ? 'ENABLED' : 'DISABLED'} (${this.persistentHistory.length} saved exchanges). Use \`/aipersistentmemory on\`, \`off\`, or \`clear\`.`,
      };
    }

    if (cmd === '/aichannelmemory') {
      if (arg === 'on') {
        this.setChannelMemory(true);
        return { handled: true, replyText: `📚 **AI Channel Memory is now ON.** The AI uses recent channel messages as context.` };
      }
      if (arg === 'off') {
        this.setChannelMemory(false);
        return { handled: true, replyText: `📚 **AI Channel Memory is now OFF.**` };
      }
      if (arg === 'clear') {
        this.channelHistories.delete(channelId);
        return { handled: true, replyText: `🧹 **AI Channel Memory for this channel has been cleared.**` };
      }
      const count = this.channelHistories.get(channelId)?.length || 0;
      return {
        handled: true,
        replyText: `📚 **AI Channel Memory**: ${this.channelMemoryEnabled ? 'ENABLED' : 'DISABLED'} (${count} channel messages retained). Use \`/aichannelmemory on\`, \`off\`, or \`clear\`.`,
      };
    }

    if (cmd === '/aireset' || cmd === '/aiclear') {
      this.clearMemory(channelId);
      return { handled: true, replyText: `✨ **AI Assistant conversation memory has been cleared.**` };
    }

    if (cmd === '/llamakey' || cmd === '/groqkey') {
      const keyVal = parts.slice(1).join(' ').trim();
      if (!keyVal) {
        return {
          handled: true,
          replyText: `🦙 **LLaMA Fallback Key**: ${this.groqApiKey ? 'Configured ✅' : 'Not set ❌'}\nUsage: \`/llamakey gsk_...\` or configure \`GROQ_API_KEY\` in environment.`,
        };
      }
      this.setGroqApiKey(keyVal);
      return {
        handled: true,
        replyText: `✅ **LLaMA API Key configured successfully!** Using \`${PRIMARY_LLAMA_MODEL}\` as fallback.`,
      };
    }

    return { handled: false };
  }

  public shouldRespond(
    text: string,
    channelId: string,
    replyTo?: { senderId?: string; senderName?: string }
  ): boolean {
    if (!this.isAiEnabledForChannel(channelId)) {
      return false;
    }

    const lower = text.toLowerCase();
    const hasAtAi = /\b@ai\b/i.test(lower) || lower.startsWith('/ai ');
    const isReplyingToAi =
      replyTo &&
      (replyTo.senderId === 'system-ai' ||
        replyTo.senderName?.toLowerCase() === 'ai assistant' ||
        replyTo.senderName?.toLowerCase() === 'ai');

    return Boolean(hasAtAi || isReplyingToAi);
  }

  public async generateResponse(params: {
    prompt: string;
    senderName: string;
    channelId: string;
    replyToText?: string;
  }): Promise<string> {
    const { final } = await this.generateDeepThoughtResponse(params);
    return final;
  }

  private async callGemini(
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
    systemInstruction: string,
    modelName: string,
    retries = 2
  ): Promise<string> {
    const client = this.getClient();
    let attempt = 0;
    while (true) {
      try {
        const response = await client.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error(`Empty text response from Gemini model (${modelName}).`);
        }

        return text.trim();
      } catch (err: any) {
        const errStr = String(err?.message || err);
        const isRateLimit = errStr.includes('429') || errStr.toLowerCase().includes('rate') || errStr.toLowerCase().includes('quota');
        if (isRateLimit && attempt < retries) {
          attempt++;
          const delay = attempt * 2000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
  }

  public async generateSiteStyleChange(prompt: string, currentCss: string): Promise<{
    css: string;
    themeConfig?: any;
    summary: string;
  }> {
    const systemPrompt = `You are an elite web UI designer and CSS architect for this live chat and publishing web app.
The user (workspace owner kep) is requesting site style changes. You generate valid, responsive, modern CSS overrides.

GUIDELINES FOR GENERATING CSS OVERRIDES:
1. Provide standard CSS rules that customize colors, headers, sidebars, cards, message bubbles, backgrounds, fonts, borders, scrollbars, glowing effects, neon accents, or glassmorphism.
2. Target key classes & selectors such as:
   - body, html, :root
   - .chat-workspace, .chat-header, .sidebar, .message-bubble
   - button, input, textarea, div
   - [data-site-theme="custom"]
3. Return ONLY a single raw JSON object matching this interface:
{
  "css": "/* complete CSS code overrides */",
  "themeConfig": {
    "primaryColor": "#hex",
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "fontFamily": "font family name",
    "accentColor": "#hex"
  },
  "summary": "1-sentence summary of the styling transformation"
}
Do NOT wrap the answer with markdown code blocks or additional text!`;

    const contents = [
      {
        role: 'user' as const,
        parts: [
          {
            text: `User prompt: "${prompt}"\n\nCurrent CSS overrides:\n${currentCss || '/* Start Style */'}`,
          },
        ],
      },
    ];

    let raw = '';
    try {
      raw = await this.callWithLlamaFallback(contents, systemPrompt, PRIMARY_MODEL);
    } catch {
      raw = await this.callGemini(contents, systemPrompt, FALLBACK_MODEL);
    }

    try {
      const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        css: parsed.css || `/* Custom style generated for: ${prompt} */`,
        themeConfig: parsed.themeConfig || {},
        summary: parsed.summary || `Applied site style transformation based on prompt: "${prompt}"`,
      };
    } catch {
      return {
        css: raw.replace(/```css/gi, '').replace(/```/g, '').trim(),
        summary: `Updated site style based on prompt: "${prompt}"`,
      };
    }
  }
}

export const geminiAi = new GeminiAiService();
export const groqAi = geminiAi;
