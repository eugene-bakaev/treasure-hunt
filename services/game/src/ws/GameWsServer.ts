import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { GatewayToGameMsg, GameToGatewayMsg } from '@treasure-hunt/protocol';
import { GameMatch } from '../match/GameMatch.js';

export class GameWsServer {
  private readonly port: number;
  private wss: WebSocketServer | null = null;
  private match: GameMatch;

  constructor(port: number) {
    this.port = port;
    // One hardcoded match for Phase 1
    const seed = process.env['MATCH_SEED'] ?? uuidv4();
    this.match = new GameMatch('dev', seed, (msg) => this.broadcast(msg));
  }

  listen(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });
      this.wss.on('listening', resolve);
      this.wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  close(): Promise<void> {
    this.match.stop();
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return; }
      this.wss.close(() => resolve());
    });
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as GatewayToGameMsg;
        this.handleMessage(ws, msg);
      } catch {
        // ignore malformed messages
      }
    });
  }

  private handleMessage(_ws: WebSocket, msg: GatewayToGameMsg): void {
    if (msg.type === 'player_join') {
      this.match.addPlayer(msg.playerId);
    } else if (msg.type === 'player_leave') {
      this.match.removePlayer(msg.playerId);
    } else if (msg.type === 'player_intent') {
      this.match.queueIntent(msg.playerId, msg.intent);
    }
  }

  private broadcast(msg: GameToGatewayMsg): void {
    if (!this.wss) return;
    const payload = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}
