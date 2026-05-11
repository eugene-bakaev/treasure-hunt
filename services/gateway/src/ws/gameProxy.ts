import { WebSocket } from 'ws';
import type { GatewayToGameMsg, GameToGatewayMsg } from '@treasure-hunt/protocol';

type DiffHandler = (msg: GameToGatewayMsg) => void;

export class GameProxy {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private onMessage: DiffHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: GatewayToGameMsg[] = [];

  constructor(url: string, onMessage: DiffHandler) {
    this.url = url;
    this.onMessage = onMessage;
  }

  connect(): void {
    console.log(`[gateway] connecting to game server at ${this.url}...`);
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      console.log('[gateway] connected to game server');
      this.flushQueue();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as GameToGatewayMsg;
        this.onMessage(msg);
      } catch (err) {
        console.error('[gateway] failed to parse game message:', err);
      }
    });

    ws.on('close', () => {
      console.warn('[gateway] game server connection closed, reconnecting...');
      this.ws = null;
      // Reconnect after 1 s
      this.reconnectTimer = setTimeout(() => this.connect(), 1000);
    });

    ws.on('error', (err) => {
      console.error('[gateway] game proxy socket error:', err);
    });
  }

  send(msg: GatewayToGameMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log('[gateway] game server not ready, queuing message:', msg.type);
      this.queue.push(msg);
    }
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.queue.length > 0) {
      console.log(`[gateway] flushing ${this.queue.length} queued messages to game server`);
      while (this.queue.length > 0) {
        const msg = this.queue.shift();
        if (msg) this.ws.send(JSON.stringify(msg));
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
