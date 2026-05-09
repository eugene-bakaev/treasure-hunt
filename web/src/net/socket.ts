import type { ClientMessage, ServerMessage } from '@treasure-hunt/protocol';
import { initFromServerMsg, applyDiff, useGameStore } from '../state/gameStore.js';

const WS_URL: string = (import.meta.env as Record<string, string | undefined>)['VITE_WS_URL'] ?? 'ws://localhost:3000/ws';

let ws: WebSocket | null = null;

export function connect(): void {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  ws = new WebSocket(WS_URL);

  ws.onmessage = (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as ServerMessage;
      const { playerId } = useGameStore.getState();

      if (msg.type === 'init') {
        initFromServerMsg(msg);
      } else if (msg.type === 'state_diff' && playerId) {
        applyDiff(msg, playerId);
      }
    } catch {
      // ignore malformed
    }
  };

  ws.onerror = () => {
    ws = null;
  };

  ws.onclose = () => {
    ws = null;
  };
}

export function sendIntent(intent: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(intent));
  }
}

export function disconnect(): void {
  ws?.close();
  ws = null;
}
