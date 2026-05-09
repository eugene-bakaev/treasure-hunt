import { WebSocket } from 'ws';
import type { GatewayToGameMsg, GameToGatewayMsg } from '@treasure-hunt/protocol';

type DiffHandler = (msg: GameToGatewayMsg) => void;

export class GameProxy {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private onMessage: DiffHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, onMessage: DiffHandler) {
    this.url = url;
    this.onMessage = onMessage;
  }

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as GameToGatewayMsg;
        this.onMessage(msg);
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      this.ws = null;
      // Reconnect after 1 s
      this.reconnectTimer = setTimeout(() => this.connect(), 1000);
    });

    ws.on('error', () => {
      // error triggers close; reconnect handled there
    });
  }

  send(msg: GatewayToGameMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
