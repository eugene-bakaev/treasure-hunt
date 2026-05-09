import { describe, expect, it, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { GameWsServer } from '../../src/ws/GameWsServer.js';
import type { GatewayToGameMsg, GameToGatewayMsg } from '@treasure-hunt/protocol';

const TEST_PORT = 13010;

describe('GameWsServer', () => {
  let server: GameWsServer;

  afterEach(async () => {
    await server?.close();
  });

  it('accepts a WebSocket connection', async () => {
    server = new GameWsServer(TEST_PORT);
    await server.listen();

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      ws.on('open', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    });
  });

  it('responds to player_join with player_init', async () => {
    server = new GameWsServer(TEST_PORT + 1);
    await server.listen();

    const received: GameToGatewayMsg[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}`);
      ws.on('open', () => {
        const msg: GatewayToGameMsg = { type: 'player_join', playerId: 'alice' };
        ws.send(JSON.stringify(msg));
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as GameToGatewayMsg;
        received.push(msg);
        if (msg.type === 'player_init') {
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    expect(received.some((m) => m.type === 'player_init')).toBe(true);
  });
});
