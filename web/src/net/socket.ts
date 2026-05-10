import type { ClientMessage, ServerMessage } from '@treasure-hunt/protocol';
import { initFromServerMsg, applyDiff, useGameStore } from '../state/gameStore.js';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE: string =
  (import.meta.env as Record<string, string | undefined>)['VITE_WS_URL'] ??
  `${protocol}//${window.location.host}/ws`;

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('treasure_hunt_player_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('treasure_hunt_player_id', id);
  }
  return id;
}

const playerId = getOrCreatePlayerId();

let ws: WebSocket | null = null;

export function connect(matchId: string): void {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  const socket = new WebSocket(
    `${WS_BASE}?matchId=${encodeURIComponent(matchId)}&playerId=${playerId}`
  );
  ws = socket;

  socket.onmessage = (event: MessageEvent<string>) => {
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

  socket.onerror = () => {
    if (ws === socket) ws = null;
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
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
  useGameStore.setState({ playerId: null, matchId: null });
}
