import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { GatewayToGameMsg, GameToGatewayMsg } from '@treasure-hunt/protocol';
import { GameMatch } from '../match/GameMatch.js';

export class GameWsServer {
  private readonly port: number;
  private wss: WebSocketServer | null = null;
  private readonly matches = new Map<string, GameMatch>();

  constructor(port: number) {
    this.port = port;
  }

  listen(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });
      this.wss.on('listening', resolve);
      this.wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  close(): Promise<void> {
    for (const match of this.matches.values()) {
      match.stop();
    }
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return; }
      this.wss.close(() => resolve());
    });
  }

  private getOrCreateMatch(matchId: string): GameMatch {
    if (!this.matches.has(matchId)) {
      const seed = uuidv4();
      const match = new GameMatch(matchId, seed, (msg) => this.broadcast(msg));
      this.matches.set(matchId, match);
    }
    return this.matches.get(matchId)!;
  }

  private handleConnection(ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as GatewayToGameMsg;
        this.handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    });
  }

  private handleMessage(msg: GatewayToGameMsg): void {
    if (msg.type === 'player_join') {
      this.getOrCreateMatch(msg.matchId).addPlayer(msg.playerId);
    } else if (msg.type === 'player_leave') {
      this.matches.get(msg.matchId)?.removePlayer(msg.playerId);
    } else if (msg.type === 'player_intent') {
      this.matches.get(msg.matchId)?.queueIntent(msg.playerId, msg.intent);
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
