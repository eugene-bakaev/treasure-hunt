import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClientMessage,
  GameToGatewayMsg,
} from '@treasure-hunt/protocol';
import { GameProxy } from './gameProxy.js';

export function attachWebSocket(server: http.Server): void {
  const gameWsUrl =
    process.env['GAME_INTERNAL_WS_URL'] ?? 'ws://localhost:3010';

  // Map from playerId → client WebSocket
  const clients = new Map<string, WebSocket>();

  const proxy = new GameProxy(gameWsUrl, (msg: GameToGatewayMsg) => {
    if (msg.type === 'player_init') {
      const ws = clients.get(msg.playerId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.init));
      }
    } else if (msg.type === 'player_diff') {
      const ws = clients.get(msg.playerId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.diff));
      }
    }
  });

  proxy.connect();

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const playerId = uuidv4();
    clients.set(playerId, ws);

    proxy.send({ type: 'player_join', playerId });

    ws.on('message', (data) => {
      try {
        const intent = JSON.parse(data.toString()) as ClientMessage;
        proxy.send({ type: 'player_intent', playerId, intent });
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      clients.delete(playerId);
      proxy.send({ type: 'player_leave', playerId });
    });
  });
}
