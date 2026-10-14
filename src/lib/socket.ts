import type { WsClientPayload, WsServerPayload } from '../types.ts';
import { getStoredToken } from './api.ts';

type Listener<T = any> = (data: T) => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectTimer: number | null = null;
  private isExplicitlyClosed = false;

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(socketUrl);

      this.ws.onopen = () => {
        const token = getStoredToken();
        if (token) {
          this.send({ type: 'auth', token });
        }
      };

      this.ws.onmessage = (evt) => {
        try {
          const payload: WsServerPayload = JSON.parse(evt.data);
          if (payload.type) {
            const handlers = this.listeners.get(payload.type);
            if (handlers) {
              handlers.forEach((fn) => fn((payload as any).data !== undefined ? (payload as any).data : payload));
            }
          }
        } catch {
          // Ignore invalid frames
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2500);
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public send(payload: WsClientPayload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public on<T = any>(eventType: string, handler: Listener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    return () => {
      const set = this.listeners.get(eventType);
      if (set) {
        set.delete(handler);
      }
    };
  }
}

export const socket = new SocketClient();
