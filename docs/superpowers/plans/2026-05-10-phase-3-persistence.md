# Phase 3 — Persistence (DB + GraphQL + MQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the full persistence pipeline — Game publishes match results to RabbitMQ, Stats Consumer writes them to Postgres, and the Gateway serves a read-only GraphQL endpoint; the web shows a leaderboard on Home and a post-match stats modal.

**Architecture:** Six independent but sequentially-dependent tasks. Tasks 1–2 build the data-flow spine (protocol types → game publish → stats consume → Postgres). Tasks 3–4 add the read path (Gateway GraphQL → Postgres). Task 5 wires the frontend (Apollo Client + leaderboard + post-match modal). Each task is independently testable. RabbitMQ is used as a simple durable queue (`match.results`); no exchange topology needed for MVP.

**Tech Stack:** Node 22, TypeScript 5, `amqplib` (publish + consume), `pg` (Postgres client), Apollo Server 4 (`@apollo/server/express4`), Apollo Client 3 (`@apollo/client`), `@graphql-codegen/client-preset`, `graphql`, `cors`, `testcontainers` (integration test for Stats Consumer).

---

## File Structure

**New files:**
```
packages/protocol/src/schema.graphql              ← canonical SDL (used by codegen + gateway)

services/game/src/rabbitmq/publisher.ts           ← amqplib publish wrapper
services/game/test/rabbitmq/publisher.test.ts

services/stats/src/db/migrate.ts                  ← CREATE TABLE IF NOT EXISTS
services/stats/src/db/queries.ts                  ← idempotent match + player_stats upsert
services/stats/src/consumer.ts                    ← amqplib consumer
services/stats/test/consumer.integration.test.ts  ← testcontainers integration test

services/gateway/src/db/queries.ts                ← read-only pg queries
services/gateway/src/graphql/schema.ts            ← SDL string (mirrors schema.graphql)
services/gateway/src/graphql/resolvers.ts
services/gateway/test/graphql.test.ts

web/codegen.ts                                    ← graphql-codegen config
web/src/net/graphql.ts                            ← Apollo Client singleton
web/src/gql/leaderboard.graphql                   ← query documents
web/src/gql/player-stats.graphql
web/src/gql/generated.ts                          ← codegen output (checked in)
web/src/screens/PostMatch.tsx
web/src/components/Leaderboard.tsx
web/test/screens/PostMatch.test.tsx
web/test/components/Leaderboard.test.tsx
```

**Modified files:**
```
packages/protocol/src/messages.ts      ← add MatchResultsMsg, MatchPlayerResult; add nickname to player_join
packages/protocol/src/index.ts         ← export new types

services/game/src/match/GameMatch.ts   ← store nicknames/seed/startedAt; call onMatchEnd cb
services/game/src/ws/GameWsServer.ts   ← extract nickname from msg; create publisher; pass onMatchEnd
services/game/src/index.ts             ← init RabbitMQ publisher
services/game/package.json             ← add amqplib + @types/amqplib

services/stats/src/index.ts            ← run migration then start consumer
services/stats/package.json            ← add pg + amqplib + @types/pg + @types/amqplib + testcontainers

services/gateway/src/server.ts         ← async createServer(); mount Apollo middleware at /graphql
services/gateway/test/server.test.ts   ← update to await createServer()
services/gateway/package.json          ← add @apollo/server + graphql + pg + cors + @types/pg + @types/cors

web/src/net/socket.ts                  ← pass nickname in WS URL
web/src/screens/Home.tsx               ← nickname input + Leaderboard
web/src/screens/Match.tsx              ← mount PostMatch overlay
web/src/main.tsx                       ← wrap with ApolloProvider
web/vite.config.ts                     ← add /graphql proxy entry
web/package.json                       ← add @apollo/client + graphql + codegen deps
```

---

## Task 1: Protocol — MatchResultsMsg + nickname in player_join + GraphQL SDL

**Files:**
- Modify: `packages/protocol/src/messages.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/schema.graphql`

- [ ] **Step 1: Add `MatchResultsMsg`, `MatchPlayerResult` and update `GatewayToGameMsg` in `packages/protocol/src/messages.ts`**

  Add these three additions to the file. Do not change existing types except the single line in `GatewayToGameMsg` shown below.

  At the bottom of `messages.ts`, before the last line, insert:

  ```typescript
  // --- RabbitMQ: match.results payload ---

  export interface MatchPlayerResult {
    playerId: string;
    nickname: string;
    score: number;
  }

  export interface MatchResultsMsg {
    matchId: string;
    startedAt: string;   // ISO 8601
    endedAt: string;     // ISO 8601
    durationSec: number;
    mapSeed: string;
    playerA: MatchPlayerResult;
    playerB: MatchPlayerResult;
    winnerId: string;
    endReason: 'main_treasure' | 'opponent_disconnect';
  }
  ```

  Also update the `player_join` variant of `GatewayToGameMsg` to include `nickname`:

  ```typescript
  export type GatewayToGameMsg =
    | { type: 'player_join'; matchId: string; playerId: string; nickname: string }
    | { type: 'player_leave'; matchId: string; playerId: string }
    | { type: 'player_intent'; matchId: string; playerId: string; intent: ClientMessage };
  ```

- [ ] **Step 2: Export new types from `packages/protocol/src/index.ts`**

  Replace the messages export block:

  ```typescript
  export type {
    Facing,
    CellType,
    ItemType,
    PowerupType,
    ClientMessage,
    CellChange,
    PlayerBuffs,
    PlayerSnapshot,
    CompassResult,
    MatchEvent,
    ServerMessage,
    GatewayToGameMsg,
    GameToGatewayMsg,
    MatchPlayerResult,
    MatchResultsMsg,
  } from './messages.js';
  ```

- [ ] **Step 3: Create `packages/protocol/src/schema.graphql`**

  ```graphql
  enum LeaderboardSort {
    TOTAL_SCORE
    WINS
    BEST_SCORE
  }

  type Query {
    leaderboard(limit: Int = 20, sortBy: LeaderboardSort = TOTAL_SCORE): [PlayerStats!]!
    player(nickname: String!): PlayerStats
    recentMatches(nickname: String, limit: Int = 20): [Match!]!
  }

  type PlayerStats {
    nickname: String!
    matchesPlayed: Int!
    matchesWon: Int!
    winRate: Float!
    totalScore: Int!
    bestScore: Int!
    lastPlayedAt: String
    recentMatches(limit: Int = 5): [Match!]!
  }

  type Match {
    id: ID!
    startedAt: String!
    endedAt: String!
    durationSec: Int!
    winnerNick: String!
    playerA: MatchPlayer!
    playerB: MatchPlayer!
    endReason: String!
  }

  type MatchPlayer {
    nickname: String!
    score: Int!
    won: Boolean!
  }
  ```

- [ ] **Step 4: Build the protocol package to verify no TypeScript errors**

  ```bash
  cd packages/protocol && pnpm build
  ```

  Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/protocol/
  git commit -m "feat(protocol): add MatchResultsMsg, nickname in player_join, GraphQL SDL"
  ```

---

## Task 2: Nickname propagation (Web → Gateway → Game) + Game publishes match results

**Files:**
- Modify: `web/src/net/socket.ts`
- Modify: `services/gateway/src/ws/clientHandler.ts`
- Modify: `services/game/src/match/GameMatch.ts`
- Modify: `services/game/src/ws/GameWsServer.ts`
- Modify: `services/game/src/index.ts`
- Modify: `services/game/package.json`
- Create: `services/game/src/rabbitmq/publisher.ts`
- Create: `services/game/test/rabbitmq/publisher.test.ts`

### Step group A — Web passes nickname in WS URL

- [ ] **Step 1: Update `web/src/net/socket.ts` to read/pass nickname**

  Add a `getNickname()` helper and pass it in the WS URL. Full replacement of `socket.ts`:

  ```typescript
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

  export function getNickname(): string {
    return localStorage.getItem('treasure_hunt_nickname') ?? 'Anonymous';
  }

  export function setNickname(name: string): void {
    localStorage.setItem('treasure_hunt_nickname', name.trim() || 'Anonymous');
  }

  const playerId = getOrCreatePlayerId();

  let ws: WebSocket | null = null;

  export function connect(matchId: string): void {
    if (ws && ws.readyState !== WebSocket.CLOSED) return;

    const nickname = encodeURIComponent(getNickname());
    const socket = new WebSocket(
      `${WS_BASE}?matchId=${encodeURIComponent(matchId)}&playerId=${playerId}&nickname=${nickname}`
    );
    ws = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        const { playerId: storedId } = useGameStore.getState();

        if (msg.type === 'init') {
          initFromServerMsg(msg);
        } else if (msg.type === 'state_diff' && storedId) {
          applyDiff(msg, storedId);
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
  ```

- [ ] **Step 2: Update `services/gateway/src/ws/clientHandler.ts` to extract nickname and include it in `player_join`**

  Replace the `player_join` send line. Full replacement of `clientHandler.ts`:

  ```typescript
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

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '/', 'ws://x');
      const matchId = url.searchParams.get('matchId') ?? 'dev';
      const playerId = url.searchParams.get('playerId') ?? uuidv4();
      const nickname = url.searchParams.get('nickname') ?? playerId;
      clients.set(playerId, ws);

      ws.on('error', (err) => {
        console.error(`[gateway] client ws error (player: ${playerId}):`, err);
      });

      proxy.send({ type: 'player_join', matchId, playerId, nickname });

      ws.on('message', (data) => {
        try {
          const intent = JSON.parse(data.toString()) as ClientMessage;
          proxy.send({ type: 'player_intent', matchId, playerId, intent });
        } catch (err) {
          console.error(`[gateway] failed to parse client intent:`, err);
        }
      });

      ws.on('close', (code) => {
        console.log(`[gateway] client ws closed (player: ${playerId}) code: ${code}`);
        clients.delete(playerId);
        proxy.send({ type: 'player_leave', matchId, playerId });
      });
    });

    wss.on('error', (err) => {
      console.error('[gateway] wss error:', err);
    });
  }
  ```

### Step group B — Game stores nicknames and emits match results

- [ ] **Step 3: Add `amqplib` to `services/game/package.json`**

  ```bash
  cd services/game && pnpm add amqplib && pnpm add -D @types/amqplib
  ```

- [ ] **Step 4: Create `services/game/src/rabbitmq/publisher.ts`**

  ```typescript
  import amqplib from 'amqplib';
  import type { MatchResultsMsg } from '@treasure-hunt/protocol';

  const QUEUE = 'match.results';

  export class RabbitMQPublisher {
    private connection: amqplib.ChannelModel | null = null;
    private channel: amqplib.Channel | null = null;
    private readonly url: string;

    constructor(url: string) {
      this.url = url;
    }

    async connect(): Promise<void> {
      this.connection = await amqplib.connect(this.url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(QUEUE, { durable: true });
    }

    publish(msg: MatchResultsMsg): void {
      if (!this.channel) {
        console.warn('[game] RabbitMQ channel not ready — match.results not published');
        return;
      }
      this.channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(msg)), {
        persistent: true,
      });
    }

    async close(): Promise<void> {
      await this.channel?.close();
      await this.connection?.close();
    }
  }
  ```

- [ ] **Step 5: Write failing tests for `RabbitMQPublisher` in `services/game/test/rabbitmq/publisher.test.ts`**

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import amqplib from 'amqplib';
  import { RabbitMQPublisher } from '../../src/rabbitmq/publisher.js';
  import type { MatchResultsMsg } from '@treasure-hunt/protocol';

  vi.mock('amqplib');

  const mockChannel = {
    assertQueue: vi.fn().mockResolvedValue(undefined),
    sendToQueue: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.mocked(amqplib.connect).mockResolvedValue(mockConnection as never);
    vi.clearAllMocks();
    vi.mocked(amqplib.connect).mockResolvedValue(mockConnection as never);
  });

  const sampleMsg: MatchResultsMsg = {
    matchId: 'm1',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:05:00.000Z',
    durationSec: 300,
    mapSeed: 'abc123',
    playerA: { playerId: 'alice-id', nickname: 'Alice', score: 100 },
    playerB: { playerId: 'bob-id', nickname: 'Bob', score: 20 },
    winnerId: 'alice-id',
    endReason: 'main_treasure',
  };

  describe('RabbitMQPublisher', () => {
    it('connects and asserts the match.results queue', async () => {
      const pub = new RabbitMQPublisher('amqp://localhost');
      await pub.connect();
      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost');
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('match.results', { durable: true });
    });

    it('sendToQueue with persistent flag and JSON payload', async () => {
      const pub = new RabbitMQPublisher('amqp://localhost');
      await pub.connect();
      pub.publish(sampleMsg);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'match.results',
        Buffer.from(JSON.stringify(sampleMsg)),
        { persistent: true },
      );
    });

    it('publish is a no-op when not yet connected', () => {
      const pub = new RabbitMQPublisher('amqp://localhost');
      expect(() => pub.publish(sampleMsg)).not.toThrow();
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();
    });

    it('close tears down channel and connection', async () => {
      const pub = new RabbitMQPublisher('amqp://localhost');
      await pub.connect();
      await pub.close();
      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 6: Run tests to confirm they fail**

  ```bash
  cd services/game && pnpm test -- --reporter=verbose test/rabbitmq/publisher.test.ts
  ```

  Expected: fails (publisher.ts not yet complete / amqplib not mocked correctly).

- [ ] **Step 7: Run tests to confirm they pass after step 4**

  ```bash
  cd services/game && pnpm test -- --reporter=verbose test/rabbitmq/publisher.test.ts
  ```

  Expected: 4 tests pass.

- [ ] **Step 8: Update `services/game/src/match/GameMatch.ts` to store seed/nicknames/startedAt and call `onMatchEnd`**

  Key changes (show the full constructor signature and the affected methods):

  **Replace the class declaration and constructor:**

  ```typescript
  export type MatchEventEmitter = (msg: GameToGatewayMsg) => void;
  export type MatchEndCallback = (results: MatchResultsMsg) => void;

  // (keep existing PowerupItemType and isPowerup helpers unchanged)

  export class GameMatch {
    private readonly matchId: string;
    private readonly mapSeed: string;
    private readonly map: MapGrid;
    private readonly players = new Map<string, PlayerState>();
    private readonly nicknames = new Map<string, string>(); // playerId → nickname
    private readonly intentQueues = new Map<string, ClientMessage[]>();
    private readonly buriedItems = new Map<string, ItemType>();
    private readonly groundItems = new Map<string, ItemType>();
    private tick = 0;
    private ended = false;
    private startedAt: Date | null = null;
    private emit: MatchEventEmitter;
    private onMatchEnd: MatchEndCallback | null;
    private intervalHandle: ReturnType<typeof setInterval> | null = null;

    constructor(
      matchId: string,
      seed: string,
      emit: MatchEventEmitter,
      onMatchEnd: MatchEndCallback | null = null,
    ) {
      this.matchId = matchId;
      this.mapSeed = seed;
      this.map = generateMap(seed);
      this.emit = emit;
      this.onMatchEnd = onMatchEnd;
      for (const { x, y, item } of this.map.items) {
        this.buriedItems.set(`${x},${y}`, item);
      }
    }
  ```

  **Replace `addPlayer` to accept nickname:**

  ```typescript
    addPlayer(playerId: string, nickname: string = playerId): void {
      this.nicknames.set(playerId, nickname);
      if (this.players.has(playerId)) {
        this.emitInit(playerId);
        return;
      }
      if (this.players.size >= 2) return;

      const spawn = this.players.size === 0
        ? { x: 2.5, y: 2.5 }
        : { x: 37.5, y: 37.5 };
      this.players.set(playerId, {
        id: playerId,
        ...spawn,
        facing: 'E',
        moveDir: null,
        digTarget: null,
        digTicksRemaining: 0,
        score: 0,
        heldPowerup: null,
        fasterShovelTicksRemaining: 0,
      });
      this.intentQueues.set(playerId, []);

      if (this.players.size === 2) {
        for (const [pid] of this.players) {
          this.emitInit(pid);
        }
        this.start();
      } else if (this.intervalHandle !== null) {
        this.emitInit(playerId);
      }
    }
  ```

  **Update `start()` to record `startedAt`:**

  ```typescript
    start(): void {
      if (this.intervalHandle !== null) return;
      this.startedAt = new Date();
      this.intervalHandle = setInterval(() => this.tickOnce(), 1000 / 30);
    }
  ```

  **In `tickOnce()`, after `if (this.ended) this.stop();`, add the results publish:**

  Replace the last two lines of `tickOnce()`:

  ```typescript
    if (this.ended) {
      this.stop();
      this._publishResults(events);
    }
  ```

  **Add `_publishResults` private method (before the closing `}` of the class):**

  ```typescript
    private _publishResults(events: MatchEvent[]): void {
      if (!this.onMatchEnd || !this.startedAt) return;
      const endEvent = events.find((e): e is Extract<MatchEvent, { type: 'match_end' }> =>
        e.type === 'match_end'
      );
      if (!endEvent) return;

      const endedAt = new Date();
      const playerIds = [...this.players.keys()];
      const [aId, bId] = playerIds as [string, string];
      const aState = this.players.get(aId)!;
      const bState = this.players.get(bId)!;

      this.onMatchEnd({
        matchId: this.matchId,
        startedAt: this.startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSec: Math.round((endedAt.getTime() - this.startedAt.getTime()) / 1000),
        mapSeed: this.mapSeed,
        playerA: {
          playerId: aId,
          nickname: this.nicknames.get(aId) ?? aId,
          score: aState.score,
        },
        playerB: {
          playerId: bId,
          nickname: this.nicknames.get(bId) ?? bId,
          score: bState.score,
        },
        winnerId: endEvent.winnerId,
        endReason: 'main_treasure',
      });
    }
  ```

  Also add this import at the top of `GameMatch.ts`:

  ```typescript
  import type { MatchResultsMsg } from '@treasure-hunt/protocol';
  ```

  (add `MatchResultsMsg` to the existing import from `@treasure-hunt/protocol`)

- [ ] **Step 9: Run existing `GameMatch` tests to confirm they still pass**

  ```bash
  cd services/game && pnpm test -- --reporter=verbose test/match/GameMatch.test.ts
  ```

  Expected: all existing tests pass (the new `nickname` param is optional, so no call sites break).

- [ ] **Step 10: Update `services/game/src/ws/GameWsServer.ts` to pass nickname and publisher**

  Full replacement:

  ```typescript
  import { WebSocketServer, WebSocket } from 'ws';
  import { v4 as uuidv4 } from 'uuid';
  import type { GatewayToGameMsg, GameToGatewayMsg } from '@treasure-hunt/protocol';
  import { GameMatch } from '../match/GameMatch.js';
  import type { RabbitMQPublisher } from '../rabbitmq/publisher.js';

  export class GameWsServer {
    private readonly port: number;
    private wss: WebSocketServer | null = null;
    private readonly matches = new Map<string, GameMatch>();
    private readonly publisher: RabbitMQPublisher | null;

    constructor(port: number, publisher: RabbitMQPublisher | null = null) {
      this.port = port;
      this.publisher = publisher;
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
        const match = new GameMatch(matchId, seed, (msg) => this.broadcast(msg), (results) => {
          this.publisher?.publish(results);
        });
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
        this.getOrCreateMatch(msg.matchId).addPlayer(msg.playerId, msg.nickname);
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
  ```

- [ ] **Step 11: Update `services/game/src/index.ts` to create publisher and pass to GameWsServer**

  ```typescript
  import { createServer } from './server.js';
  import { GameWsServer } from './ws/GameWsServer.js';
  import { RabbitMQPublisher } from './rabbitmq/publisher.js';

  const port = Number(process.env['PORT'] ?? 3002);
  const internalPort = Number(process.env['GAME_INTERNAL_PORT'] ?? 3010);
  const rabbitUrl = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

  const app = createServer();
  app.listen(port, () => {
    console.log(`[game] listening on :${port}`);
  });

  const publisher = new RabbitMQPublisher(rabbitUrl);
  publisher.connect().then(() => {
    console.log('[game] connected to RabbitMQ');
  }).catch((err) => {
    console.warn('[game] RabbitMQ unavailable, match results will not be persisted:', err);
  });

  const wsServer = new GameWsServer(internalPort, publisher);
  wsServer.listen().then(() => {
    console.log(`[game] internal WS listening on :${internalPort}`);
  });
  ```

- [ ] **Step 12: Run all game tests**

  ```bash
  cd services/game && pnpm test
  ```

  Expected: all tests pass (existing tests still compile because `addPlayer` has a default for `nickname`, and `GameWsServer` constructor's second arg is optional).

- [ ] **Step 13: Build the game service**

  ```bash
  cd services/game && pnpm build
  ```

  Expected: exits 0.

- [ ] **Step 14: Commit**

  ```bash
  git add packages/protocol/ services/game/ services/gateway/src/ws/clientHandler.ts web/src/net/socket.ts
  git commit -m "feat: propagate nickname end-to-end and publish match.results to RabbitMQ"
  ```

---

## Task 3: Stats service — Postgres schema + RabbitMQ consumer

**Files:**
- Modify: `services/stats/package.json`
- Create: `services/stats/src/db/migrate.ts`
- Create: `services/stats/src/db/queries.ts`
- Create: `services/stats/src/consumer.ts`
- Modify: `services/stats/src/index.ts`
- Create: `services/stats/test/consumer.integration.test.ts`

- [ ] **Step 1: Add dependencies to `services/stats/package.json`**

  ```bash
  cd services/stats && pnpm add pg amqplib && pnpm add -D @types/pg @types/amqplib testcontainers
  ```

- [ ] **Step 2: Write failing integration test in `services/stats/test/consumer.integration.test.ts`**

  This test requires Docker. It starts real Postgres and RabbitMQ containers.

  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { GenericContainer, StartedTestContainer } from 'testcontainers';
  import pg from 'pg';
  import amqplib from 'amqplib';
  import { runMigration } from '../../src/db/migrate.js';
  import { startConsumer } from '../../src/consumer.js';
  import type { MatchResultsMsg } from '@treasure-hunt/protocol';

  // This test starts real Docker containers — it may take 30–60 s on first run.

  let pgContainer: StartedTestContainer;
  let rabbitContainer: StartedTestContainer;
  let pool: pg.Pool;
  let rabbitUrl: string;

  const matchMsg: MatchResultsMsg = {
    matchId: '11111111-1111-1111-1111-111111111111',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:05:00.000Z',
    durationSec: 300,
    mapSeed: 'seed42',
    playerA: { playerId: 'alice-id', nickname: 'Alice', score: 100 },
    playerB: { playerId: 'bob-id', nickname: 'Bob', score: 20 },
    winnerId: 'alice-id',
    endReason: 'main_treasure',
  };

  beforeAll(async () => {
    pgContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test',
      })
      .withExposedPorts(5432)
      .start();

    rabbitContainer = await new GenericContainer('rabbitmq:3')
      .withExposedPorts(5672)
      .start();

    const pgUrl = `postgresql://test:test@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/test`;
    rabbitUrl = `amqp://${rabbitContainer.getHost()}:${rabbitContainer.getMappedPort(5672)}`;

    await runMigration(pgUrl);
    pool = new pg.Pool({ connectionString: pgUrl });
    await startConsumer(rabbitUrl, pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await pgContainer.stop();
    await rabbitContainer.stop();
  });

  async function publishMsg(msg: MatchResultsMsg): Promise<void> {
    const conn = await amqplib.connect(rabbitUrl);
    const ch = await conn.createChannel();
    await ch.assertQueue('match.results', { durable: true });
    ch.sendToQueue('match.results', Buffer.from(JSON.stringify(msg)), { persistent: true });
    await ch.close();
    await conn.close();
  }

  async function waitForRow(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { rows } = await pool.query('SELECT id FROM matches WHERE id = $1', [matchMsg.matchId]);
      if (rows.length > 0) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Row not inserted within timeout');
  }

  describe('Stats Consumer (integration)', () => {
    it('inserts a match row and updates player_stats', async () => {
      await publishMsg(matchMsg);
      await waitForRow();

      const { rows: matches } = await pool.query('SELECT * FROM matches WHERE id = $1', [matchMsg.matchId]);
      expect(matches).toHaveLength(1);
      expect(matches[0].winner_nick).toBe('Alice');
      expect(matches[0].player_a_score).toBe(100);
      expect(matches[0].player_b_score).toBe(20);

      const { rows: statsA } = await pool.query('SELECT * FROM player_stats WHERE nickname = $1', ['Alice']);
      expect(statsA[0].matches_played).toBe(1);
      expect(statsA[0].matches_won).toBe(1);
      expect(Number(statsA[0].total_score)).toBe(100);

      const { rows: statsB } = await pool.query('SELECT * FROM player_stats WHERE nickname = $1', ['Bob']);
      expect(statsB[0].matches_played).toBe(1);
      expect(statsB[0].matches_won).toBe(0);
    }, 30_000);

    it('is idempotent — publishing the same matchId twice does not double-count', async () => {
      await publishMsg(matchMsg);
      await new Promise((r) => setTimeout(r, 1000)); // allow consumer time

      const { rows: matches } = await pool.query('SELECT id FROM matches WHERE id = $1', [matchMsg.matchId]);
      expect(matches).toHaveLength(1); // still just one row

      const { rows: statsA } = await pool.query('SELECT matches_played FROM player_stats WHERE nickname = $1', ['Alice']);
      expect(statsA[0].matches_played).toBe(1); // not incremented again
    }, 15_000);
  });
  ```

- [ ] **Step 3: Run to confirm failure**

  ```bash
  cd services/stats && pnpm test
  ```

  Expected: fails — `migrate.ts`, `consumer.ts` don't exist yet.

- [ ] **Step 4: Create `services/stats/src/db/migrate.ts`**

  ```typescript
  import pg from 'pg';

  export async function runMigration(dbUrl: string): Promise<void> {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS matches (
          id              uuid primary key,
          started_at      timestamptz not null,
          ended_at        timestamptz not null,
          duration_sec    int not null,
          map_seed        text not null,
          winner_nick     text not null,
          player_a_nick   text not null,
          player_a_score  int not null,
          player_b_nick   text not null,
          player_b_score  int not null,
          end_reason      text not null
        );
        CREATE INDEX IF NOT EXISTS idx_matches_ended_at  ON matches (ended_at desc);
        CREATE INDEX IF NOT EXISTS idx_matches_winner    ON matches (winner_nick);
        CREATE INDEX IF NOT EXISTS idx_matches_player_a  ON matches (player_a_nick);
        CREATE INDEX IF NOT EXISTS idx_matches_player_b  ON matches (player_b_nick);

        CREATE TABLE IF NOT EXISTS player_stats (
          nickname        text primary key,
          matches_played  int not null default 0,
          matches_won     int not null default 0,
          total_score     bigint not null default 0,
          best_score      int not null default 0,
          last_played_at  timestamptz
        );
      `);
    } finally {
      await client.end();
    }
  }
  ```

- [ ] **Step 5: Create `services/stats/src/db/queries.ts`**

  ```typescript
  import pg from 'pg';
  import type { MatchResultsMsg } from '@treasure-hunt/protocol';

  export async function persistMatch(pool: pg.Pool, msg: MatchResultsMsg): Promise<void> {
    const winnerNick =
      msg.playerA.playerId === msg.winnerId ? msg.playerA.nickname : msg.playerB.nickname;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO matches
           (id, started_at, ended_at, duration_sec, map_seed, winner_nick,
            player_a_nick, player_a_score, player_b_nick, player_b_score, end_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          msg.matchId,
          new Date(msg.startedAt),
          new Date(msg.endedAt),
          msg.durationSec,
          msg.mapSeed,
          winnerNick,
          msg.playerA.nickname,
          msg.playerA.score,
          msg.playerB.nickname,
          msg.playerB.score,
          msg.endReason,
        ],
      );

      if (result.rows.length === 0) {
        // duplicate delivery — skip stats update
        await client.query('COMMIT');
        return;
      }

      for (const player of [msg.playerA, msg.playerB]) {
        const won = player.playerId === msg.winnerId ? 1 : 0;
        await client.query(
          `INSERT INTO player_stats (nickname, matches_played, matches_won, total_score, best_score, last_played_at)
           VALUES ($1, 1, $2, $3, $4, $5)
           ON CONFLICT (nickname) DO UPDATE SET
             matches_played = player_stats.matches_played + 1,
             matches_won    = player_stats.matches_won + $2,
             total_score    = player_stats.total_score + $3,
             best_score     = GREATEST(player_stats.best_score, $4),
             last_played_at = $5`,
          [player.nickname, won, player.score, player.score, new Date(msg.endedAt)],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  ```

- [ ] **Step 6: Create `services/stats/src/consumer.ts`**

  ```typescript
  import amqplib from 'amqplib';
  import pg from 'pg';
  import { persistMatch } from './db/queries.js';
  import type { MatchResultsMsg } from '@treasure-hunt/protocol';

  const QUEUE = 'match.results';

  export async function startConsumer(rabbitUrl: string, pool: pg.Pool): Promise<void> {
    const conn = await amqplib.connect(rabbitUrl);
    const ch = await conn.createChannel();
    await ch.assertQueue(QUEUE, { durable: true });
    ch.prefetch(1);

    await ch.consume(QUEUE, async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString()) as MatchResultsMsg;
        await persistMatch(pool, payload);
        ch.ack(msg);
      } catch (err) {
        console.error('[stats] failed to process match.results:', err);
        ch.nack(msg, false, false);
      }
    });

    console.log('[stats] consuming match.results');
  }
  ```

- [ ] **Step 7: Update `services/stats/src/index.ts`**

  ```typescript
  import pg from 'pg';
  import { createServer } from './server.js';
  import { runMigration } from './db/migrate.js';
  import { startConsumer } from './consumer.js';

  const port = Number(process.env['PORT'] ?? 3003);
  const dbUrl = process.env['POSTGRES_URL'] ?? 'postgresql://treasure:treasure@localhost:5432/treasure';
  const rabbitUrl = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

  const app = createServer();
  app.listen(port, () => console.log(`[stats] listening on :${port}`));

  const pool = new pg.Pool({ connectionString: dbUrl });

  runMigration(dbUrl)
    .then(() => {
      console.log('[stats] migration complete');
      return startConsumer(rabbitUrl, pool);
    })
    .catch((err) => {
      console.error('[stats] startup error:', err);
      process.exit(1);
    });
  ```

- [ ] **Step 8: Run integration tests to confirm they pass** *(requires Docker)*

  ```bash
  cd services/stats && pnpm test
  ```

  Expected: 2 integration tests pass (takes ~30–60 s on first run due to container pull).

- [ ] **Step 9: Build stats service**

  ```bash
  cd services/stats && pnpm build
  ```

  Expected: exits 0.

- [ ] **Step 10: Commit**

  ```bash
  git add services/stats/
  git commit -m "feat(stats): postgres schema migration + idempotent match.results consumer"
  ```

---

## Task 4: Gateway — GraphQL endpoint

**Files:**
- Modify: `services/gateway/package.json`
- Create: `services/gateway/src/db/queries.ts`
- Create: `services/gateway/src/graphql/schema.ts`
- Create: `services/gateway/src/graphql/resolvers.ts`
- Modify: `services/gateway/src/server.ts`
- Modify: `services/gateway/test/server.test.ts`
- Create: `services/gateway/test/graphql.test.ts`

- [ ] **Step 1: Add dependencies**

  ```bash
  cd services/gateway && pnpm add @apollo/server graphql pg cors && pnpm add -D @types/pg @types/cors
  ```

- [ ] **Step 2: Write failing GraphQL tests in `services/gateway/test/graphql.test.ts`**

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import request from 'supertest';
  import { createServer } from '../src/server.js';

  // Mock pg so the test doesn't need a real Postgres
  vi.mock('pg', () => {
    const Pool = vi.fn().mockImplementation(() => ({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }));
    return { default: { Pool } };
  });

  describe('Gateway GraphQL endpoint', () => {
    it('POST /graphql returns 200 with data for leaderboard query', async () => {
      const server = await createServer();
      const res = await request(server)
        .post('/graphql')
        .send({ query: '{ leaderboard(limit: 5) { nickname matchesPlayed } }' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.leaderboard).toEqual([]);
    });

    it('POST /graphql resolves player query returning null for unknown nickname', async () => {
      const server = await createServer();
      const res = await request(server)
        .post('/graphql')
        .send({ query: '{ player(nickname: "nobody") { nickname } }' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.data.player).toBeNull();
    });

    it('POST /graphql resolves recentMatches returning empty array', async () => {
      const server = await createServer();
      const res = await request(server)
        .post('/graphql')
        .send({ query: '{ recentMatches(limit: 5) { id winnerNick } }' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.data.recentMatches).toEqual([]);
    });
  });
  ```

- [ ] **Step 3: Run to confirm failure**

  ```bash
  cd services/gateway && pnpm test -- test/graphql.test.ts
  ```

  Expected: fails (no /graphql endpoint yet).

- [ ] **Step 4: Create `services/gateway/src/db/queries.ts`**

  ```typescript
  import pg from 'pg';

  let _pool: pg.Pool | null = null;

  export function getPool(): pg.Pool {
    if (!_pool) {
      _pool = new pg.Pool({ connectionString: process.env['POSTGRES_URL'] });
    }
    return _pool;
  }

  export interface DbPlayerStats {
    nickname: string;
    matches_played: number;
    matches_won: number;
    total_score: bigint;
    best_score: number;
    last_played_at: Date | null;
  }

  export interface DbMatch {
    id: string;
    started_at: Date;
    ended_at: Date;
    duration_sec: number;
    winner_nick: string;
    player_a_nick: string;
    player_a_score: number;
    player_b_nick: string;
    player_b_score: number;
    end_reason: string;
  }

  type SortCol = 'total_score' | 'matches_won' | 'best_score';

  const SORT_MAP: Record<string, SortCol> = {
    TOTAL_SCORE: 'total_score',
    WINS: 'matches_won',
    BEST_SCORE: 'best_score',
  };

  export async function queryLeaderboard(sortBy: string, limit: number): Promise<DbPlayerStats[]> {
    const col: SortCol = SORT_MAP[sortBy] ?? 'total_score';
    const { rows } = await getPool().query<DbPlayerStats>(
      `SELECT * FROM player_stats ORDER BY ${col} DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }

  export async function queryPlayer(nickname: string): Promise<DbPlayerStats | null> {
    const { rows } = await getPool().query<DbPlayerStats>(
      'SELECT * FROM player_stats WHERE nickname = $1',
      [nickname],
    );
    return rows[0] ?? null;
  }

  export async function queryRecentMatches(nickname: string | null, limit: number): Promise<DbMatch[]> {
    if (nickname) {
      const { rows } = await getPool().query<DbMatch>(
        `SELECT * FROM matches WHERE player_a_nick = $1 OR player_b_nick = $1
         ORDER BY ended_at DESC LIMIT $2`,
        [nickname, limit],
      );
      return rows;
    }
    const { rows } = await getPool().query<DbMatch>(
      'SELECT * FROM matches ORDER BY ended_at DESC LIMIT $1',
      [limit],
    );
    return rows;
  }

  export async function queryPlayerRecentMatches(nickname: string, limit: number): Promise<DbMatch[]> {
    const { rows } = await getPool().query<DbMatch>(
      `SELECT * FROM matches WHERE player_a_nick = $1 OR player_b_nick = $1
       ORDER BY ended_at DESC LIMIT $2`,
      [nickname, limit],
    );
    return rows;
  }
  ```

- [ ] **Step 5: Create `services/gateway/src/graphql/schema.ts`**

  ```typescript
  export const typeDefs = `#graphql
    enum LeaderboardSort { TOTAL_SCORE WINS BEST_SCORE }

    type Query {
      leaderboard(limit: Int = 20, sortBy: LeaderboardSort = TOTAL_SCORE): [PlayerStats!]!
      player(nickname: String!): PlayerStats
      recentMatches(nickname: String, limit: Int = 20): [Match!]!
    }

    type PlayerStats {
      nickname: String!
      matchesPlayed: Int!
      matchesWon: Int!
      winRate: Float!
      totalScore: Int!
      bestScore: Int!
      lastPlayedAt: String
      recentMatches(limit: Int = 5): [Match!]!
    }

    type Match {
      id: ID!
      startedAt: String!
      endedAt: String!
      durationSec: Int!
      winnerNick: String!
      playerA: MatchPlayer!
      playerB: MatchPlayer!
      endReason: String!
    }

    type MatchPlayer {
      nickname: String!
      score: Int!
      won: Boolean!
    }
  `;
  ```

- [ ] **Step 6: Create `services/gateway/src/graphql/resolvers.ts`**

  ```typescript
  import {
    queryLeaderboard,
    queryPlayer,
    queryRecentMatches,
    queryPlayerRecentMatches,
    type DbPlayerStats,
    type DbMatch,
  } from '../db/queries.js';

  function toPlayerStats(row: DbPlayerStats) {
    const played = row.matches_played;
    const won = row.matches_won;
    return {
      nickname: row.nickname,
      matchesPlayed: played,
      matchesWon: won,
      winRate: played > 0 ? won / played : 0,
      totalScore: Number(row.total_score),
      bestScore: row.best_score,
      lastPlayedAt: row.last_played_at?.toISOString() ?? null,
    };
  }

  function toMatch(row: DbMatch) {
    return {
      id: row.id,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at.toISOString(),
      durationSec: row.duration_sec,
      winnerNick: row.winner_nick,
      playerA: { nickname: row.player_a_nick, score: row.player_a_score, won: row.player_a_nick === row.winner_nick },
      playerB: { nickname: row.player_b_nick, score: row.player_b_score, won: row.player_b_nick === row.winner_nick },
      endReason: row.end_reason,
    };
  }

  export const resolvers = {
    Query: {
      leaderboard: async (
        _: unknown,
        { limit = 20, sortBy = 'TOTAL_SCORE' }: { limit?: number; sortBy?: string },
      ) => {
        const rows = await queryLeaderboard(sortBy, limit);
        return rows.map(toPlayerStats);
      },

      player: async (_: unknown, { nickname }: { nickname: string }) => {
        const row = await queryPlayer(nickname);
        return row ? toPlayerStats(row) : null;
      },

      recentMatches: async (
        _: unknown,
        { nickname, limit = 20 }: { nickname?: string; limit?: number },
      ) => {
        const rows = await queryRecentMatches(nickname ?? null, limit);
        return rows.map(toMatch);
      },
    },

    PlayerStats: {
      recentMatches: async (
        parent: { nickname: string },
        { limit = 5 }: { limit?: number },
      ) => {
        const rows = await queryPlayerRecentMatches(parent.nickname, limit);
        return rows.map(toMatch);
      },
    },
  };
  ```

- [ ] **Step 7: Update `services/gateway/src/server.ts` — make `createServer` async and mount Apollo**

  ```typescript
  import express from 'express';
  import cors from 'cors';
  import http from 'http';
  import bodyParser from 'body-parser';
  import { createProxyMiddleware } from 'http-proxy-middleware';
  import { ApolloServer } from '@apollo/server';
  import { expressMiddleware } from '@apollo/server/express4';
  import type { HealthResponse } from '@treasure-hunt/protocol';
  import { typeDefs } from './graphql/schema.js';
  import { resolvers } from './graphql/resolvers.js';

  export async function createServer(): Promise<http.Server> {
    const app = express();

    const lobbyUrl = process.env['LOBBY_URL'] ?? 'http://localhost:3001';
    const webUrl = process.env['WEB_URL'] ?? 'http://localhost:5173';

    app.get('/health', (_req, res) => {
      const body: HealthResponse = { status: 'ok', service: 'gateway' };
      res.status(200).json(body);
    });

    // GraphQL endpoint — before catch-all proxy
    const apollo = new ApolloServer({ typeDefs, resolvers });
    await apollo.start();
    app.use(
      '/graphql',
      cors<cors.CorsRequest>(),
      bodyParser.json(),
      expressMiddleware(apollo),
    );

    // Proxy /match requests to the lobby service
    app.use(
      createProxyMiddleware({
        target: lobbyUrl,
        changeOrigin: true,
        pathFilter: '/match',
        on: {
          proxyReq: (_proxyReq, req) => {
            console.log(`[proxy] -> lobby: ${req.method} ${req.url}`);
          },
          error: (err) => {
            console.error(`[proxy] lobby error: ${err.message}`);
          },
        },
      }),
    );

    // Proxy everything else to the web service
    app.use(
      createProxyMiddleware({
        target: webUrl,
        changeOrigin: true,
        ws: true,
        on: {
          proxyReq: (_proxyReq, req) => {
            if (!req.url?.match(/\.(js|css|png|jpg|svg|ico)$/)) {
              console.log(`[proxy] -> web: ${req.method} ${req.url}`);
            }
          },
          error: (err) => {
            console.error(`[proxy] web error: ${err.message}`);
          },
        },
      }),
    );

    app.use(express.json());

    return http.createServer(app);
  }
  ```

- [ ] **Step 8: Update `services/gateway/src/index.ts` to await `createServer()`**

  Read the current `index.ts` first, then replace:

  ```typescript
  import { createServer } from './server.js';
  import { attachWebSocket } from './ws/clientHandler.js';

  const port = Number(process.env['PORT'] ?? 3000);

  createServer().then((server) => {
    attachWebSocket(server);
    server.listen(port, () => {
      console.log(`[gateway] listening on :${port}`);
    });
  }).catch((err) => {
    console.error('[gateway] failed to start:', err);
    process.exit(1);
  });
  ```

- [ ] **Step 9: Update `services/gateway/test/server.test.ts` to await `createServer()`**

  ```typescript
  import { describe, expect, it, vi } from 'vitest';
  import request from 'supertest';
  import { createServer } from '../src/server.js';

  vi.mock('pg', () => {
    const Pool = vi.fn().mockImplementation(() => ({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }));
    return { default: { Pool } };
  });

  describe('gateway server', () => {
    it('GET /health returns service-tagged ok', async () => {
      const server = await createServer();
      const res = await request(server).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'gateway' });
    });
  });
  ```

- [ ] **Step 10: Run all gateway tests**

  ```bash
  cd services/gateway && pnpm test
  ```

  Expected: 4 tests pass (1 health + 3 GraphQL).

- [ ] **Step 11: Build gateway**

  ```bash
  cd services/gateway && pnpm build
  ```

  Expected: exits 0.

- [ ] **Step 12: Commit**

  ```bash
  git add services/gateway/
  git commit -m "feat(gateway): Apollo Server GraphQL endpoint for leaderboard, player, recentMatches"
  ```

---

## Task 5: Web — Apollo Client, nickname UI, leaderboard, post-match modal

**Files:**
- Modify: `web/package.json`
- Modify: `web/vite.config.ts`
- Create: `web/codegen.ts`
- Create: `web/src/net/graphql.ts`
- Create: `web/src/gql/leaderboard.graphql`
- Create: `web/src/gql/player-stats.graphql`
- Create: `web/src/gql/generated.ts`
- Modify: `web/src/main.tsx`
- Create: `web/src/components/Leaderboard.tsx`
- Modify: `web/src/screens/Home.tsx`
- Create: `web/src/screens/PostMatch.tsx`
- Modify: `web/src/screens/Match.tsx`
- Create: `web/test/components/Leaderboard.test.tsx`
- Create: `web/test/screens/PostMatch.test.tsx`

### Step group A — Dependencies and infrastructure

- [ ] **Step 1: Add dependencies to `web/package.json`**

  ```bash
  cd web && pnpm add @apollo/client graphql
  pnpm add -D @graphql-codegen/cli @graphql-codegen/client-preset
  ```

- [ ] **Step 2: Add `/graphql` proxy to `web/vite.config.ts`**

  In both `server.proxy` and `preview.proxy` blocks, add:

  ```typescript
  '/graphql': 'http://gateway:3000',
  ```

  So the proxy sections read:

  ```typescript
  proxy: {
    '/match': 'http://gateway:3000',
    '/graphql': 'http://gateway:3000',
    '/ws': {
      target: 'ws://gateway:3000',
      ws: true,
    },
  },
  ```

  Apply this change to both the `server` and `preview` sections.

- [ ] **Step 3: Create `web/codegen.ts`**

  ```typescript
  import type { CodegenConfig } from '@graphql-codegen/cli';

  const config: CodegenConfig = {
    schema: '../packages/protocol/src/schema.graphql',
    documents: 'src/gql/**/*.graphql',
    generates: {
      'src/gql/generated.ts': {
        preset: 'client',
        config: {
          useTypeImports: true,
        },
      },
    },
  };

  export default config;
  ```

- [ ] **Step 4: Add `codegen` script to `web/package.json`**

  In the `scripts` section, add:

  ```json
  "codegen": "graphql-codegen --config codegen.ts"
  ```

- [ ] **Step 5: Create `web/src/gql/leaderboard.graphql`**

  ```graphql
  query Leaderboard($limit: Int, $sortBy: LeaderboardSort) {
    leaderboard(limit: $limit, sortBy: $sortBy) {
      nickname
      matchesPlayed
      matchesWon
      winRate
      totalScore
      bestScore
    }
  }
  ```

- [ ] **Step 6: Create `web/src/gql/player-stats.graphql`**

  ```graphql
  query PlayerStats($nickname: String!) {
    player(nickname: $nickname) {
      nickname
      matchesPlayed
      matchesWon
      winRate
      totalScore
      bestScore
      recentMatches(limit: 5) {
        id
        startedAt
        endedAt
        durationSec
        winnerNick
        playerA { nickname score won }
        playerB { nickname score won }
        endReason
      }
    }
  }
  ```

- [ ] **Step 7: Run codegen to produce `web/src/gql/generated.ts`**

  ```bash
  cd web && pnpm codegen
  ```

  Expected: creates `src/gql/generated.ts` with typed hooks and document nodes. Check the file exists and contains `LeaderboardDocument` and `PlayerStatsDocument`.

- [ ] **Step 8: Create `web/src/net/graphql.ts`**

  ```typescript
  import { ApolloClient, InMemoryCache } from '@apollo/client';

  export const apolloClient = new ApolloClient({
    uri: '/graphql',
    cache: new InMemoryCache(),
  });
  ```

- [ ] **Step 9: Update `web/src/main.tsx` to wrap with ApolloProvider**

  Read the current `main.tsx` first. Replace with (keeping any existing content except adding the ApolloProvider):

  ```typescript
  import { StrictMode } from 'react';
  import { createRoot } from 'react-dom/client';
  import { ApolloProvider } from '@apollo/client';
  import { apolloClient } from './net/graphql.js';
  import App from './App.js';

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ApolloProvider client={apolloClient}>
        <App />
      </ApolloProvider>
    </StrictMode>,
  );
  ```

### Step group B — Leaderboard component

- [ ] **Step 10: Write failing tests for `Leaderboard` in `web/test/components/Leaderboard.test.tsx`**

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import { MockedProvider } from '@apollo/client/testing';
  import Leaderboard from '../../src/components/Leaderboard.js';
  import { LeaderboardDocument } from '../../src/gql/generated.js';

  const mocks = [
    {
      request: {
        query: LeaderboardDocument,
        variables: { limit: 10, sortBy: 'TOTAL_SCORE' },
      },
      result: {
        data: {
          leaderboard: [
            { nickname: 'Alice', matchesPlayed: 3, matchesWon: 2, winRate: 0.67, totalScore: 320, bestScore: 120 },
            { nickname: 'Bob',   matchesPlayed: 3, matchesWon: 1, winRate: 0.33, totalScore: 60,  bestScore: 40  },
          ],
        },
      },
    },
  ];

  describe('Leaderboard', () => {
    it('shows a loading state initially', () => {
      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <Leaderboard />
        </MockedProvider>,
      );
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('renders leaderboard rows after data loads', async () => {
      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <Leaderboard />
        </MockedProvider>,
      );
      expect(await screen.findByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('320')).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 11: Run to confirm failure**

  ```bash
  cd web && pnpm test -- test/components/Leaderboard.test.tsx
  ```

  Expected: fails — component doesn't exist yet.

- [ ] **Step 12: Create `web/src/components/Leaderboard.tsx`**

  ```typescript
  import { useQuery } from '@apollo/client';
  import { LeaderboardDocument } from '../gql/generated.js';

  export default function Leaderboard() {
    const { data, loading, error } = useQuery(LeaderboardDocument, {
      variables: { limit: 10, sortBy: 'TOTAL_SCORE' },
      fetchPolicy: 'cache-and-network',
    });

    if (loading && !data) {
      return <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Loading leaderboard…</p>;
    }
    if (error) {
      return <p style={{ color: '#f88', fontSize: '0.85rem' }}>Leaderboard unavailable</p>;
    }
    if (!data?.leaderboard.length) {
      return <p style={{ color: '#888', fontSize: '0.85rem' }}>No matches played yet</p>;
    }

    return (
      <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: '480px' }}>
        <h3 style={{ color: '#ffd700', marginBottom: '0.5rem', fontSize: '1rem' }}>Leaderboard</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#ddd' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <th style={{ textAlign: 'left',  padding: '4px 8px' }}>#</th>
              <th style={{ textAlign: 'left',  padding: '4px 8px' }}>Player</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Score</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>W/L</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((p, i) => (
              <tr key={p.nickname} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '4px 8px', color: '#888' }}>{i + 1}</td>
                <td style={{ padding: '4px 8px' }}>{p.nickname}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{p.totalScore}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#aaa' }}>
                  {p.matchesWon}/{p.matchesPlayed - p.matchesWon}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  ```

- [ ] **Step 13: Run leaderboard tests to confirm they pass**

  ```bash
  cd web && pnpm test -- test/components/Leaderboard.test.tsx
  ```

  Expected: 2 tests pass.

### Step group C — PostMatch overlay

- [ ] **Step 14: Write failing tests for `PostMatch` in `web/test/screens/PostMatch.test.tsx`**

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { MockedProvider } from '@apollo/client/testing';
  import PostMatch from '../../src/screens/PostMatch.js';
  import { PlayerStatsDocument } from '../../src/gql/generated.js';

  const mocks = [
    {
      request: {
        query: PlayerStatsDocument,
        variables: { nickname: 'Alice' },
      },
      result: {
        data: {
          player: {
            nickname: 'Alice',
            matchesPlayed: 5,
            matchesWon: 3,
            winRate: 0.6,
            totalScore: 450,
            bestScore: 120,
            recentMatches: [],
          },
        },
      },
    },
  ];

  describe('PostMatch', () => {
    it('shows winner announcement', () => {
      const onPlayAgain = vi.fn();
      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <PostMatch
            myNickname="Alice"
            winnerId="alice-id"
            myPlayerId="alice-id"
            scores={{ 'alice-id': 100, 'bob-id': 20 }}
            onPlayAgain={onPlayAgain}
          />
        </MockedProvider>,
      );
      expect(screen.getByText(/you win/i)).toBeInTheDocument();
    });

    it('shows defeat message when opponent won', () => {
      const onPlayAgain = vi.fn();
      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <PostMatch
            myNickname="Alice"
            winnerId="bob-id"
            myPlayerId="alice-id"
            scores={{ 'alice-id': 20, 'bob-id': 100 }}
            onPlayAgain={onPlayAgain}
          />
        </MockedProvider>,
      );
      expect(screen.getByText(/you lose/i)).toBeInTheDocument();
    });

    it('calls onPlayAgain when button is clicked', async () => {
      const onPlayAgain = vi.fn();
      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <PostMatch
            myNickname="Alice"
            winnerId="alice-id"
            myPlayerId="alice-id"
            scores={{ 'alice-id': 100, 'bob-id': 20 }}
            onPlayAgain={onPlayAgain}
          />
        </MockedProvider>,
      );
      await userEvent.click(screen.getByRole('button', { name: /play again/i }));
      expect(onPlayAgain).toHaveBeenCalledOnce();
    });
  });
  ```

- [ ] **Step 15: Run to confirm failure**

  ```bash
  cd web && pnpm test -- test/screens/PostMatch.test.tsx
  ```

  Expected: fails.

- [ ] **Step 16: Create `web/src/screens/PostMatch.tsx`**

  ```typescript
  import { useQuery } from '@apollo/client';
  import { PlayerStatsDocument } from '../gql/generated.js';

  interface Props {
    myNickname: string;
    winnerId: string;
    myPlayerId: string;
    scores: Record<string, number>;
    onPlayAgain: () => void;
  }

  export default function PostMatch({ myNickname, winnerId, myPlayerId, scores, onPlayAgain }: Props) {
    const won = winnerId === myPlayerId;
    const myScore = scores[myPlayerId] ?? 0;

    const { data } = useQuery(PlayerStatsDocument, {
      variables: { nickname: myNickname },
      fetchPolicy: 'network-only',
    });

    const stats = data?.player;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '360px',
            width: '100%',
            textAlign: 'center',
            color: '#eee',
          }}
        >
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: won ? '#ffd700' : '#f88' }}>
            {won ? 'You Win!' : 'You Lose'}
          </h2>
          <p style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '1.5rem' }}>
            Score: <strong style={{ color: '#fff' }}>{myScore}</strong>
          </p>

          {stats && (
            <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              <div>All-time: <strong style={{ color: '#ddd' }}>{stats.totalScore} pts</strong></div>
              <div>
                Record:{' '}
                <strong style={{ color: '#ddd' }}>
                  {stats.matchesWon}W / {stats.matchesPlayed - stats.matchesWon}L
                </strong>
              </div>
              <div>Best: <strong style={{ color: '#ddd' }}>{stats.bestScore} pts</strong></div>
            </div>
          )}

          <button
            onClick={onPlayAgain}
            style={{
              padding: '0.6rem 2rem',
              fontSize: '1rem',
              background: '#ffd700',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: '#111',
            }}
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 17: Run PostMatch tests to confirm they pass**

  ```bash
  cd web && pnpm test -- test/screens/PostMatch.test.tsx
  ```

  Expected: 3 tests pass.

  Note: if `@testing-library/user-event` is not installed, run `pnpm add -D @testing-library/user-event` first.

### Step group D — Wire up Home and Match screens

- [ ] **Step 18: Update `web/src/screens/Home.tsx` with nickname input and leaderboard**

  ```typescript
  import { useState } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { MockedProvider } from '@apollo/client/testing';
  import { createMatch } from '../net/lobby.js';
  import { getNickname, setNickname } from '../net/socket.js';
  import Leaderboard from '../components/Leaderboard.js';

  export default function Home() {
    const navigate = useNavigate();
    const [nickname, setNicknameState] = useState(() => getNickname());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleNicknameChange(value: string) {
      setNicknameState(value);
      setNickname(value);
    }

    async function handleCreate() {
      setLoading(true);
      setError(null);
      try {
        const { matchId, joinCode } = await createMatch();
        navigate(`/match/${matchId}`, { state: { joinCode } });
      } catch {
        setError('Failed to create match. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    return (
      <main style={{ color: '#eee', padding: '2rem', textAlign: 'center', background: '#111', minHeight: '100vh' }}>
        <h1>Treasure Hunt</h1>
        <p>Find the buried treasure before your opponent does.</p>

        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={(e) => handleNicknameChange(e.target.value)}
            maxLength={32}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '1rem',
              borderRadius: '6px',
              border: '1px solid #555',
              background: '#222',
              color: '#eee',
              width: '220px',
            }}
          />

          <button
            onClick={() => { void handleCreate(); }}
            disabled={loading || !nickname.trim()}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1.1rem',
              cursor: loading || !nickname.trim() ? 'default' : 'pointer',
              background: '#ffd700',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              opacity: loading || !nickname.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Creating…' : 'Create Match'}
          </button>

          {error && (
            <p style={{ color: '#f88', fontSize: '0.9rem' }}>{error}</p>
          )}
        </div>

        <Leaderboard />
      </main>
    );
  }
  ```

  Note: remove the unused `MockedProvider` import (it was accidentally included above). The correct Home.tsx should not import MockedProvider. The full file without that line:

  ```typescript
  import { useState } from 'react';
  import { useNavigate } from 'react-router-dom';
  import { createMatch } from '../net/lobby.js';
  import { getNickname, setNickname } from '../net/socket.js';
  import Leaderboard from '../components/Leaderboard.js';

  export default function Home() {
    const navigate = useNavigate();
    const [nickname, setNicknameState] = useState(() => getNickname());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleNicknameChange(value: string) {
      setNicknameState(value);
      setNickname(value);
    }

    async function handleCreate() {
      setLoading(true);
      setError(null);
      try {
        const { matchId, joinCode } = await createMatch();
        navigate(`/match/${matchId}`, { state: { joinCode } });
      } catch {
        setError('Failed to create match. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    return (
      <main style={{ color: '#eee', padding: '2rem', textAlign: 'center', background: '#111', minHeight: '100vh' }}>
        <h1>Treasure Hunt</h1>
        <p>Find the buried treasure before your opponent does.</p>

        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={(e) => handleNicknameChange(e.target.value)}
            maxLength={32}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '1rem',
              borderRadius: '6px',
              border: '1px solid #555',
              background: '#222',
              color: '#eee',
              width: '220px',
            }}
          />

          <button
            onClick={() => { void handleCreate(); }}
            disabled={loading || !nickname.trim()}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1.1rem',
              cursor: loading || !nickname.trim() ? 'default' : 'pointer',
              background: '#ffd700',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              opacity: loading || !nickname.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Creating…' : 'Create Match'}
          </button>

          {error && (
            <p style={{ color: '#f88', fontSize: '0.9rem' }}>{error}</p>
          )}
        </div>

        <Leaderboard />
      </main>
    );
  }
  ```

- [ ] **Step 19: Update `web/src/screens/Match.tsx` to mount `PostMatch` overlay and pass `onPlayAgain`**

  After the import block at the top, add:

  ```typescript
  import PostMatch from './PostMatch.js';
  import { getNickname } from '../net/socket.js';
  ```

  Inside the component, store the final scores when the match ends. Add this state before the `useEffect` calls:

  ```typescript
  const [finalScores, setFinalScores] = useState<Record<string, number>>({});
  ```

  Update the `applyDiff` listener in `gameStore` to capture scores at match end. Actually, the simplest approach is to read from the store: scores are already in `players` snapshots. Add this derived variable:

  ```typescript
  const players = useGameStore((s) => s.players);
  ```

  And render the PostMatch overlay when `matchEnded` is true. Replace the current `matchEnded` render block (the "Returning to home" paragraph) with:

  ```typescript
  {matchEnded && playerId && (
    <PostMatch
      myNickname={getNickname()}
      winnerId={winnerId ?? ''}
      myPlayerId={playerId}
      scores={Object.fromEntries(players.map((p) => [p.id, p.score]))}
      onPlayAgain={() => navigate('/')}
    />
  )}
  ```

  Remove the old `useEffect` that navigates home after 4 seconds — `PostMatch` now handles navigation via the "Play Again" button. Remove:

  ```typescript
  useEffect(() => {
    if (matchEnded) {
      const timer = setTimeout(() => navigate('/'), 4000);
      return () => clearTimeout(timer);
    }
  }, [matchEnded, navigate]);
  ```

  Also remove the "Returning to home in 4 seconds…" paragraph at the bottom.

- [ ] **Step 20: Run all web tests**

  ```bash
  cd web && pnpm test
  ```

  Expected: all tests pass. The existing Home screen test may need updating since the "Create Match" button is now disabled when nickname is empty — the test should set a value for the nickname input before clicking. Update `web/test/screens/Home.test.tsx` if needed:

  In the test that clicks "Create Match", add an act that types into the nickname input first:

  ```typescript
  import userEvent from '@testing-library/user-event';
  // ...
  const input = screen.getByPlaceholderText('Your nickname');
  await userEvent.type(input, 'TestPlayer');
  // then click Create Match
  ```

- [ ] **Step 21: TypeScript check**

  ```bash
  cd web && pnpm build 2>&1 | head -30
  ```

  Expected: exits 0 (or only expected Vite output, no TS errors).

- [ ] **Step 22: Commit**

  ```bash
  git add web/
  git commit -m "feat(web): Apollo Client, nickname input, leaderboard, post-match modal"
  ```

---

## Task 6: Docker Compose smoke test

- [ ] **Step 1: Verify full stack starts and stats service is healthy**

  ```bash
  docker compose up --build -d
  docker compose ps
  ```

  Expected: all six services show `healthy` (postgres, rabbitmq, gateway, lobby, game, stats).

- [ ] **Step 2: Confirm stats migration ran**

  ```bash
  docker compose exec postgres psql -U treasure -d treasure -c "\dt"
  ```

  Expected: lists `matches` and `player_stats` tables.

- [ ] **Step 3: Confirm GraphQL endpoint responds**

  ```bash
  curl -s -X POST http://localhost:3000/graphql \
    -H 'Content-Type: application/json' \
    -d '{"query":"{ leaderboard(limit:5) { nickname totalScore } }"}' | jq .
  ```

  Expected:
  ```json
  { "data": { "leaderboard": [] } }
  ```

- [ ] **Step 4: Play a match end-to-end and verify leaderboard updates**

  1. Open `http://localhost:3000` in two browser tabs.
  2. In tab A: enter nickname `Alice`, click Create Match, copy the invite link.
  3. In tab B: open the invite link, enter nickname `Bob`.
  4. Play until someone digs the treasure.
  5. After the PostMatch overlay appears, wait 2–3 seconds, then run:

  ```bash
  curl -s -X POST http://localhost:3000/graphql \
    -H 'Content-Type: application/json' \
    -d '{"query":"{ leaderboard(limit:5) { nickname totalScore matchesPlayed } }"}' | jq .
  ```

  Expected: `Alice` and `Bob` appear with correct scores.

- [ ] **Step 5: Tear down**

  ```bash
  docker compose down
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add docker-compose.yml
  git commit -m "test: Phase 3 smoke test verified — leaderboard live after match end"
  ```

  (Only commit if `docker-compose.yml` changed. If not, skip this commit.)

---

## Verification

- **Phase 3 done when:** a finished match shows up in the leaderboard within a couple seconds, and `recentMatches` query returns it.
- All unit tests pass: `pnpm -r test`
- Stats integration test passes (requires Docker)
- GraphQL queries return correct data for played matches
- Nickname is preserved across page reloads (localStorage)
- Idempotency: replaying the same `match.results` message does not duplicate rows
