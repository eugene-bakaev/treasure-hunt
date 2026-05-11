import type { ClientMessage, ServerMessage } from '@treasure-hunt/protocol';
import { initFromServerMsg, applyDiff, useGameStore } from '../state/gameStore.js';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE: string =
  (import.meta.env as Record<string, string | undefined>)['VITE_WS_URL'] ??
  `${protocol}//${window.location.host}/ws`;

function getOrCreatePlayerId(): string {
  let id = sessionStorage.getItem('treasure_hunt_player_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('treasure_hunt_player_id', id);
  }
  return id;
}

const playerId = getOrCreatePlayerId();

export function getNickname(): string {
  return localStorage.getItem('treasure_hunt_nickname') ?? `Player_${playerId.slice(0, 4)}`;
}

export function setNickname(name: string): void {
  localStorage.setItem('treasure_hunt_nickname', name);
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalDisconnect = false;

export function connect(matchId: string): void {
  intentionalDisconnect = false;
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const socket = new WebSocket(
    `${WS_BASE}?matchId=${encodeURIComponent(matchId)}&playerId=${playerId}&nickname=${encodeURIComponent(getNickname())}`
  );
  ws = socket;

  socket.onmessage = (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as ServerMessage;
      const { playerId: currentId } = useGameStore.getState();

      if (msg.type === 'init') {
        initFromServerMsg(msg);
      } else if (msg.type === 'state_diff' && currentId) {
        applyDiff(msg, currentId);
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
    
    // Auto-reconnect if it was not an intentional disconnect
    if (!intentionalDisconnect) {
      console.log(`[socket] websocket closed unexpectedly, reconnecting in 1s...`);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(matchId), 1000);
    }
  };
}

export function sendIntent(intent: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(intent));
  }
}

export function disconnect(): void {
  intentionalDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
  useGameStore.setState({ playerId: null, matchId: null });
}
