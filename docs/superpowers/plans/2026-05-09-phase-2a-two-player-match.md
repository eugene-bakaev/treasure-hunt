# Phase 2a — Two-Player Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two browsers play the same match via a private invite link — both see each other move in real time, the game starts when both are connected, and the winner/loser result is shown to both.

**Architecture:** Lobby Service stores join codes in memory and hands `matchId` to the frontend. The frontend connects to the gateway WebSocket with `?matchId=` in the URL. The gateway forwards `matchId` in every `player_join`/`player_intent`/`player_leave` message. The Game Server creates `GameMatch` instances lazily per `matchId`, caps each match at two players, and only sends `init` + starts the tick loop when both players are present.

**Tech Stack:** Node 22, TypeScript 5, ESM, Express 4, `ws@^8`, `uuid@^10`, Vitest, supertest, React 18, react-router-dom 6, Zustand 5.

---

## File Structure

**Create:**
- `services/lobby/src/store.ts` — in-memory match records (matchId → joinCode)
- `web/src/net/lobby.ts` — `createMatch()` / `joinMatch()` HTTP calls to Lobby
- `web/src/screens/Join.tsx` — resolves joinCode → navigates to `/match/:matchId`
- `web/test/screens/Home.test.tsx` — unit tests for Home screen
- `web/test/screens/Join.test.tsx` — unit tests for Join screen

**Modify:**
- `packages/protocol/src/messages.ts` — add `matchId` to all three `GatewayToGameMsg` variants
- `services/lobby/src/server.ts` — add `POST /match`, `GET /match/join/:joinCode`, CORS headers
- `services/lobby/test/server.test.ts` — add tests for new endpoints
- `services/game/src/map/MapGenerator.ts` — second 3×3 spawn pocket, treasure ≥15 cells from both spawns
- `services/game/src/match/GameMatch.ts` — deferred start (init only when 2 players), two spawn positions, `emitInit` helper
- `services/game/src/ws/GameWsServer.ts` — replace single match with `Map<matchId, GameMatch>`, route by `matchId`
- `services/gateway/src/ws/clientHandler.ts` — parse `?matchId` from WS upgrade URL
- `web/src/net/socket.ts` — `connect(matchId: string)`, reset store on `disconnect()`
- `web/src/screens/Home.tsx` — "Create Match" button calling Lobby
- `web/src/screens/Match.tsx` — pass `id` to `connect()`, add waiting overlay
- `web/src/App.tsx` — add `/join/:joinCode` route
- `web/test/App.test.tsx` — add Join route test, update Home mock

---

## Task 1: Protocol — add matchId to GatewayToGameMsg

**Files:**
- Modify: `packages/protocol/src/messages.ts`

- [ ] **Step 1: Write the failing TypeScript check**

The current `GatewayToGameMsg` type does not include `matchId`. After this change, `GameWsServer` and `clientHandler` will produce TypeScript errors until Tasks 5 and 6 fix them — that is expected and correct.

- [ ] **Step 2: Update `packages/protocol/src/messages.ts`**

Replace the existing `GatewayToGameMsg` type (lines 54–57):

```ts
export type GatewayToGameMsg =
  | { type: 'player_join';   matchId: string; playerId: string }
  | { type: 'player_leave';  matchId: string; playerId: string }
  | { type: 'player_intent'; matchId: string; playerId: string; intent: ClientMessage };
```

- [ ] **Step 3: Build protocol to confirm the type compiles**

```bash
cd /path/to/repo && pnpm --filter @treasure-hunt/protocol build
```

Expected: `dist/` updated, no TypeScript errors in the protocol package itself.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/messages.ts
git commit -m "feat(protocol): add matchId to GatewayToGameMsg"
```

---

## Task 2: Lobby Service — match store and endpoints

**Files:**
- Create: `services/lobby/src/store.ts`
- Modify: `services/lobby/src/server.ts`
- Modify: `services/lobby/test/server.test.ts`

The lobby package does not have `uuid` yet — add it first.

- [ ] **Step 1: Add uuid dependency to lobby**

```bash
pnpm --filter @treasure-hunt/lobby add uuid
pnpm --filter @treasure-hunt/lobby add -D @types/uuid
```

Expected: `services/lobby/package.json` now lists `uuid` in dependencies and `@types/uuid` in devDependencies.

- [ ] **Step 2: Write the failing tests**

Replace the full contents of `services/lobby/test/server.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('lobby server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'lobby' });
  });

  it('POST /match returns matchId and joinCode', async () => {
    const app = createServer();
    const res = await request(app).post('/match');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      matchId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      joinCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
    });
  });

  it('GET /match/join/:joinCode resolves to matchId', async () => {
    const app = createServer();
    const createRes = await request(app).post('/match');
    const { joinCode, matchId } = createRes.body as { joinCode: string; matchId: string };
    const joinRes = await request(app).get(`/match/join/${joinCode}`);
    expect(joinRes.status).toBe(200);
    expect(joinRes.body).toEqual({ matchId });
  });

  it('GET /match/join/UNKNOWN returns 404', async () => {
    const app = createServer();
    const res = await request(app).get('/match/join/ZZZZZZ');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter @treasure-hunt/lobby test -- --run
```

Expected: 3 tests FAIL (POST /match route doesn't exist yet), 1 PASS (health check).

- [ ] **Step 4: Create `services/lobby/src/store.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';

export interface MatchRecord {
  matchId: string;
  joinCode: string;
  createdAt: Date;
}

const matches = new Map<string, MatchRecord>();  // matchId → record
const codeIndex = new Map<string, string>();      // joinCode → matchId

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

export function createMatch(): MatchRecord {
  const matchId = uuidv4();
  const joinCode = generateJoinCode();
  const record: MatchRecord = { matchId, joinCode, createdAt: new Date() };
  matches.set(matchId, record);
  codeIndex.set(joinCode, matchId);
  return record;
}

export function resolveJoinCode(joinCode: string): MatchRecord | undefined {
  const matchId = codeIndex.get(joinCode.toUpperCase());
  return matchId !== undefined ? matches.get(matchId) : undefined;
}
```

- [ ] **Step 5: Update `services/lobby/src/server.ts`**

```ts
import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';
import { createMatch, resolveJoinCode } from './store.js';

export function createServer(): Express {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'lobby' };
    res.status(200).json(body);
  });

  app.post('/match', (_req, res) => {
    const record = createMatch();
    res.status(201).json({ matchId: record.matchId, joinCode: record.joinCode });
  });

  app.get('/match/join/:joinCode', (req, res) => {
    const record = resolveJoinCode(req.params['joinCode'] ?? '');
    if (!record) {
      res.status(404).json({ error: 'Invalid join code' });
      return;
    }
    res.status(200).json({ matchId: record.matchId });
  });

  return app;
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @treasure-hunt/lobby test -- --run
```

Expected: 4/4 PASS.

- [ ] **Step 7: Commit**

```bash
git add services/lobby/src/store.ts services/lobby/src/server.ts \
        services/lobby/test/server.test.ts services/lobby/package.json \
        pnpm-lock.yaml
git commit -m "feat(lobby): match store with POST /match and GET /match/join/:joinCode"
```

---

## Task 3: Game Server — MapGenerator second spawn pocket

**Files:**
- Modify: `services/game/src/map/MapGenerator.ts`
- Modify: `services/game/test/map/MapGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `services/game/test/map/MapGenerator.test.ts`. Add these tests (keep any existing tests):

```ts
import { describe, expect, it } from 'vitest';
import { generateMap } from '../../src/map/MapGenerator.js';

describe('generateMap', () => {
  const map = generateMap('test-seed-phase2');

  it('second spawn pocket cells (36–38, 36–38) are walkable', () => {
    for (let y = 36; y <= 38; y++) {
      for (let x = 36; x <= 38; x++) {
        expect(map.cells[y]![x]).toBe('walkable');
      }
    }
  });

  it('treasure is at least 15 cells from both spawn centers', () => {
    const { x: tx, y: ty } = map.treasurePos;
    const d1 = Math.hypot(tx - 2, ty - 2);
    const d2 = Math.hypot(tx - 37, ty - 37);
    expect(Math.min(d1, d2)).toBeGreaterThanOrEqual(15);
  });

  it('first spawn pocket cells (1–3, 1–3) are still walkable', () => {
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(map.cells[y]![x]).toBe('walkable');
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @treasure-hunt/game test -- --run
```

Expected: the two new tests FAIL.

- [ ] **Step 3: Update `services/game/src/map/MapGenerator.ts`**

Replace the entire file:

```ts
import type { CellType } from './types.js';
import type { MapGrid } from './types.js';

const MAP_WIDTH = 40;
const MAP_HEIGHT = 40;
const SPAWN1_CENTER_X = 2;
const SPAWN1_CENTER_Y = 2;
const SPAWN2_CENTER_X = 37;
const SPAWN2_CENTER_Y = 37;
const MIN_TREASURE_DIST = 15;

function makePrng(seedStr: string): () => number {
  let h = 0;
  for (const c of seedStr) {
    h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  }
  return function () {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carveSpawnPocket(
  cells: CellType[][],
  cx: number,
  cy: number,
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) {
        cells[y]![x] = 'walkable';
      }
    }
  }
}

export function generateMap(seed: string): MapGrid {
  const rng = makePrng(seed);

  const cells: CellType[][] = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, (): CellType => 'rock'),
  );

  carveSpawnPocket(cells, SPAWN1_CENTER_X, SPAWN1_CENTER_Y);
  carveSpawnPocket(cells, SPAWN2_CENTER_X, SPAWN2_CENTER_Y);

  // Place treasure in a rock cell ≥ MIN_TREASURE_DIST from both spawn centers
  let treasurePos: { x: number; y: number };
  while (true) {
    const tx = Math.floor(rng() * MAP_WIDTH);
    const ty = Math.floor(rng() * MAP_HEIGHT);
    const d1 = Math.hypot(tx - SPAWN1_CENTER_X, ty - SPAWN1_CENTER_Y);
    const d2 = Math.hypot(tx - SPAWN2_CENTER_X, ty - SPAWN2_CENTER_Y);
    if (Math.min(d1, d2) >= MIN_TREASURE_DIST && cells[ty]![tx] === 'rock') {
      treasurePos = { x: tx, y: ty };
      break;
    }
  }

  return { width: MAP_WIDTH, height: MAP_HEIGHT, cells, treasurePos, seed };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @treasure-hunt/game test -- --run
```

Expected: all tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add services/game/src/map/MapGenerator.ts \
        services/game/test/map/MapGenerator.test.ts
git commit -m "feat(game): add second spawn pocket and update treasure placement for two players"
```

---

## Task 4: Game Server — GameMatch deferred start and two spawn positions

**Files:**
- Modify: `services/game/src/match/GameMatch.ts`
- Modify: `services/game/test/match/GameMatch.test.ts`

**Context:** Currently `addPlayer()` immediately sends `init` and `GameWsServer` calls `match.start()`. After this task, `addPlayer()` silently stores the first player and only sends `init` to both players + starts the loop when the **second** player joins. `GameWsServer` no longer calls `start()` (Task 5 handles that).

- [ ] **Step 1: Write the failing tests**

Open `services/game/test/match/GameMatch.test.ts`. Keep any existing tests, but note: **existing tests that call `addPlayer()` once and then test gameplay must be updated to call `addPlayer()` twice** — the match only starts (and sends init) when two players are present. Update existing tests accordingly and add the new ones below.

Add these tests (after updating existing ones to use two players):

```ts
import { describe, expect, it, vi } from 'vitest';
import type { GameToGatewayMsg } from '@treasure-hunt/protocol';
import { GameMatch } from '../../src/match/GameMatch.js';

describe('GameMatch two-player deferred start', () => {
  it('does not emit init after first player joins', () => {
    const emitted: GameToGatewayMsg[] = [];
    const match = new GameMatch('m1', 'seed1', (msg) => emitted.push(msg));
    match.addPlayer('p1');
    const initMsgs = emitted.filter((m) => m.type === 'player_init');
    expect(initMsgs).toHaveLength(0);
  });

  it('emits init to both players when second player joins', () => {
    const emitted: GameToGatewayMsg[] = [];
    const match = new GameMatch('m1', 'seed1', (msg) => emitted.push(msg));
    match.addPlayer('p1');
    match.addPlayer('p2');
    const initMsgs = emitted.filter((m) => m.type === 'player_init');
    expect(initMsgs).toHaveLength(2);
    const playerIds = initMsgs.map((m) => (m as { type: 'player_init'; playerId: string }).playerId);
    expect(playerIds).toContain('p1');
    expect(playerIds).toContain('p2');
  });

  it('ignores a third player join', () => {
    const emitted: GameToGatewayMsg[] = [];
    const match = new GameMatch('m1', 'seed1', (msg) => emitted.push(msg));
    match.addPlayer('p1');
    match.addPlayer('p2');
    match.addPlayer('p3');
    expect(match['players'].size).toBe(2);
    match.stop();
  });

  it('player 1 spawns at (2.5, 2.5) and player 2 at (37.5, 37.5)', () => {
    const match = new GameMatch('m1', 'seed1', () => {});
    match.addPlayer('p1');
    match.addPlayer('p2');
    expect(match['players'].get('p1')).toMatchObject({ x: 2.5, y: 2.5 });
    expect(match['players'].get('p2')).toMatchObject({ x: 37.5, y: 37.5 });
    match.stop();
  });
});
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
pnpm --filter @treasure-hunt/game test -- --run
```

Expected: the four new tests FAIL.

- [ ] **Step 3: Update `services/game/src/match/GameMatch.ts`**

Replace the `addPlayer` method and add the private `emitInit` method. The rest of the file is unchanged.

Replace the existing `addPlayer` method (lines 42–70) with:

```ts
addPlayer(playerId: string): void {
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
  });
  this.intentQueues.set(playerId, []);

  if (this.players.size === 2) {
    for (const [pid] of this.players) {
      this.emitInit(pid);
    }
    this.start();
  }
}

private emitInit(playerId: string): void {
  const player = this.players.get(playerId)!;
  const walkableCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < this.map.height; y++) {
    for (let x = 0; x < this.map.width; x++) {
      if (this.map.cells[y]![x] === 'walkable') walkableCells.push({ x, y });
    }
  }
  const init: Extract<ServerMessage, { type: 'init' }> = {
    type: 'init',
    matchId: this.matchId,
    playerId,
    mapWidth: this.map.width,
    mapHeight: this.map.height,
    walkableCells,
    spawnX: player.x,
    spawnY: player.y,
  };
  this.emit({ type: 'player_init', playerId, init });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @treasure-hunt/game test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/game/src/match/GameMatch.ts \
        services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): deferred match start — init sent to both players when second joins"
```

---

## Task 5: Game Server — GameWsServer multi-match routing

**Files:**
- Modify: `services/game/src/ws/GameWsServer.ts`

**Context:** The protocol change in Task 1 means `GatewayToGameMsg` now has a `matchId` field. This task updates `GameWsServer` to route messages to the correct `GameMatch` by `matchId` and removes the call to `match.start()` (now handled inside `GameMatch.addPlayer()`).

- [ ] **Step 1: Replace `services/game/src/ws/GameWsServer.ts`**

```ts
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
```

- [ ] **Step 2: Build the game service to verify no TypeScript errors**

```bash
pnpm --filter @treasure-hunt/game build
```

Expected: compiles cleanly. The `_ws` parameter in `handleMessage` is now removed (it was unused) — replaced with just `msg`.

- [ ] **Step 3: Run all game tests**

```bash
pnpm --filter @treasure-hunt/game test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add services/game/src/ws/GameWsServer.ts
git commit -m "feat(game): multi-match routing by matchId in GameWsServer"
```

---

## Task 6: Gateway — parse matchId from WebSocket upgrade URL

**Files:**
- Modify: `services/gateway/src/ws/clientHandler.ts`

**Context:** The `WebSocketServer` `connection` event provides the HTTP upgrade `IncomingMessage` as a second argument. We parse `?matchId=` from it and forward it in all proxy messages.

- [ ] **Step 1: Replace `services/gateway/src/ws/clientHandler.ts`**

```ts
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
    const playerId = uuidv4();
    clients.set(playerId, ws);

    proxy.send({ type: 'player_join', matchId, playerId });

    ws.on('message', (data) => {
      try {
        const intent = JSON.parse(data.toString()) as ClientMessage;
        proxy.send({ type: 'player_intent', matchId, playerId, intent });
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      clients.delete(playerId);
      proxy.send({ type: 'player_leave', matchId, playerId });
    });
  });
}
```

- [ ] **Step 2: Build the gateway to verify no TypeScript errors**

```bash
pnpm --filter @treasure-hunt/gateway build
```

Expected: compiles cleanly.

- [ ] **Step 3: Run gateway tests**

```bash
pnpm --filter @treasure-hunt/gateway test -- --run
```

Expected: 1/1 PASS (health check test).

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/ws/clientHandler.ts
git commit -m "feat(gateway): forward matchId from WS upgrade URL to game server"
```

---

## Task 7: Web — lobby.ts, socket.ts matchId, and store reset

**Files:**
- Create: `web/src/net/lobby.ts`
- Modify: `web/src/net/socket.ts`

- [ ] **Step 1: Create `web/src/net/lobby.ts`**

```ts
import type { } from '@treasure-hunt/protocol';

const LOBBY_URL: string =
  (import.meta.env as Record<string, string | undefined>)['VITE_LOBBY_URL'] ??
  'http://localhost:3001';

export async function createMatch(): Promise<{ matchId: string; joinCode: string }> {
  const res = await fetch(`${LOBBY_URL}/match`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create match');
  return res.json() as Promise<{ matchId: string; joinCode: string }>;
}

export async function joinMatch(joinCode: string): Promise<{ matchId: string }> {
  const res = await fetch(
    `${LOBBY_URL}/match/join/${encodeURIComponent(joinCode)}`,
  );
  if (!res.ok) throw new Error('Invalid invite link');
  return res.json() as Promise<{ matchId: string }>;
}
```

- [ ] **Step 2: Update `web/src/net/socket.ts`**

Two changes: `connect` now accepts `matchId: string` and appends it to the WS URL; `disconnect` resets `playerId` and `matchId` in the store so the Match screen shows the waiting overlay on reconnect.

Replace the full file:

```ts
import type { ClientMessage, ServerMessage } from '@treasure-hunt/protocol';
import { initFromServerMsg, applyDiff, useGameStore } from '../state/gameStore.js';

const WS_BASE: string =
  (import.meta.env as Record<string, string | undefined>)['VITE_WS_URL'] ??
  'ws://localhost:3000/ws';

let ws: WebSocket | null = null;

export function connect(matchId: string): void {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  const socket = new WebSocket(`${WS_BASE}?matchId=${encodeURIComponent(matchId)}`);
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
  // Reset store so Match screen shows waiting overlay on next connect
  useGameStore.setState({ playerId: null, matchId: null });
}
```

- [ ] **Step 3: TypeScript check**

```bash
pnpm --filter @treasure-hunt/web exec tsc --noEmit
```

Expected: no errors (the `Match.tsx` call to `connect()` without args will error — that's expected and fixed in Task 9).

- [ ] **Step 4: Commit**

```bash
git add web/src/net/lobby.ts web/src/net/socket.ts
git commit -m "feat(web): lobby API client and socket matchId param"
```

---

## Task 8: Web — Home, Join screens, and App routing

**Files:**
- Modify: `web/src/screens/Home.tsx`
- Create: `web/src/screens/Join.tsx`
- Modify: `web/src/App.tsx`
- Create: `web/test/screens/Home.test.tsx`
- Create: `web/test/screens/Join.test.tsx`
- Modify: `web/test/App.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `web/test/screens/Home.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Home from '../../src/screens/Home.js';

vi.mock('../../src/net/lobby.js', () => ({
  createMatch: vi.fn().mockResolvedValue({ matchId: 'match-123', joinCode: 'ABC123' }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Home screen', () => {
  it('renders Create Match button', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /create match/i })).toBeInTheDocument();
  });

  it('navigates to /match/:id with joinCode state on click', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /create match/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/match/match-123',
        { state: { joinCode: 'ABC123' } },
      );
    });
  });
});
```

Create `web/test/screens/Join.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Join from '../../src/screens/Join.js';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../src/net/lobby.js', () => ({
  joinMatch: vi.fn().mockResolvedValue({ matchId: 'match-456' }),
}));

function renderJoin(joinCode: string) {
  return render(
    <MemoryRouter initialEntries={[`/join/${joinCode}`]}>
      <Routes>
        <Route path="/join/:joinCode" element={<Join />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Join screen', () => {
  it('shows Joining… while resolving', () => {
    renderJoin('ABC123');
    expect(screen.getByText(/joining/i)).toBeInTheDocument();
  });

  it('navigates to /match/:id after resolving', async () => {
    renderJoin('ABC123');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/match/match-456');
    });
  });

  it('shows error for invalid join code', async () => {
    const { joinMatch } = await import('../../src/net/lobby.js');
    vi.mocked(joinMatch).mockRejectedValueOnce(new Error('Invalid'));
    renderJoin('XXXXXX');
    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    });
  });
});
```

Update `web/test/App.test.tsx` — add the Join route test and update the socket mock to accept a `matchId` arg:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.js';

vi.mock('../src/pixi/PixiCanvas.js', () => ({
  default: () => <div data-testid="pixi-canvas" />,
}));

vi.mock('../src/net/socket.js', () => ({
  connect: (_matchId: string) => {},
  disconnect: () => {},
  sendIntent: () => {},
}));

vi.mock('../src/net/lobby.js', () => ({
  createMatch: vi.fn(),
  joinMatch: vi.fn(),
}));

vi.mock('../src/state/gameStore.js', () => ({
  useGameStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ detector: 50, score: 0, matchEnded: false, winnerId: null, playerId: null }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('renders Home at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /treasure hunt/i })).toBeInTheDocument();
  });

  it('renders Lobby at /lobby', () => {
    renderAt('/lobby');
    expect(screen.getByRole('heading', { name: /lobby/i })).toBeInTheDocument();
  });

  it('renders Join at /join/:joinCode', () => {
    renderAt('/join/ABC123');
    expect(screen.getByText(/joining/i)).toBeInTheDocument();
  });

  it('renders Match waiting overlay at /match/:id (no playerId)', () => {
    renderAt('/match/abc-123');
    expect(screen.getByText(/waiting for opponent/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @treasure-hunt/web test -- --run
```

Expected: new tests FAIL (files don't exist yet or routing not wired).

- [ ] **Step 3: Update `web/src/screens/Home.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMatch } from '../net/lobby.js';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    try {
      const { matchId, joinCode } = await createMatch();
      navigate(`/match/${matchId}`, { state: { joinCode } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Treasure Hunt</h1>
      <p>Find the buried treasure before your opponent does.</p>
      <button
        onClick={() => { void handleCreate(); }}
        disabled={loading}
        style={{
          marginTop: '1.5rem',
          padding: '0.75rem 2rem',
          fontSize: '1.1rem',
          cursor: loading ? 'default' : 'pointer',
          background: '#ffd700',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Creating…' : 'Create Match'}
      </button>
    </main>
  );
}
```

- [ ] **Step 4: Create `web/src/screens/Join.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { joinMatch } from '../net/lobby.js';

export default function Join() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!joinCode) return;
    joinMatch(joinCode)
      .then(({ matchId }) => navigate(`/match/${matchId}`))
      .catch(() => setError('Invalid or expired invite link.'));
  }, [joinCode, navigate]);

  if (error) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#f88' }}>{error}</p>
      </main>
    );
  }
  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: '#eee' }}>Joining…</p>
    </main>
  );
}
```

- [ ] **Step 5: Update `web/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import Home from './screens/Home.js';
import Lobby from './screens/Lobby.js';
import Join from './screens/Join.js';
import Match from './screens/Match.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/join/:joinCode" element={<Join />} />
      <Route path="/match/:id" element={<Match />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm --filter @treasure-hunt/web test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/screens/Home.tsx web/src/screens/Join.tsx web/src/App.tsx \
        web/test/screens/Home.test.tsx web/test/screens/Join.test.tsx \
        web/test/App.test.tsx
git commit -m "feat(web): Create Match flow, Join screen, /join/:joinCode route"
```

---

## Task 9: Web — Match screen waiting overlay

**Files:**
- Modify: `web/src/screens/Match.tsx`

**Context:** `socket.ts`'s `connect()` now requires a `matchId` argument. `Match.tsx` reads it from the `:id` route param. The waiting overlay is shown when `playerId === null` (before `init` is received from the server).

- [ ] **Step 1: Run existing tests to confirm current state**

```bash
pnpm --filter @treasure-hunt/web test -- --run
```

The App routing test for Match (`renderAt('/match/abc-123')`) expects `getByText(/waiting for opponent/i)`. This should still fail because `Match.tsx` doesn't yet render that text. Confirm it fails before proceeding.

- [ ] **Step 2: Replace `web/src/screens/Match.tsx`**

```tsx
import { useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import PixiCanvas from '../pixi/PixiCanvas.js';
import DetectorGauge from '../hud/DetectorGauge.js';
import Scoreboard from '../hud/Scoreboard.js';
import { useGameStore } from '../state/gameStore.js';
import { useInput } from '../hooks/useInput.js';
import { connect, disconnect, sendIntent } from '../net/socket.js';
import type { Facing } from '@treasure-hunt/protocol';

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const detector = useGameStore((s) => s.detector);
  const score = useGameStore((s) => s.score);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const winnerId = useGameStore((s) => s.winnerId);
  const playerId = useGameStore((s) => s.playerId);

  useEffect(() => {
    connect(id!);
    return () => disconnect();
  }, [id]);

  useEffect(() => {
    if (matchEnded) {
      const timer = setTimeout(() => navigate('/'), 4000);
      return () => clearTimeout(timer);
    }
  }, [matchEnded, navigate]);

  const onMove = useCallback(
    (dir: Facing) => sendIntent({ type: 'move', dir }),
    [],
  );
  const onStop = useCallback(() => sendIntent({ type: 'stop' }), []);
  const onDig = useCallback(() => sendIntent({ type: 'dig' }), []);

  useInput({ onMove, onStop, onDig });

  const joinCode = (location.state as { joinCode?: string } | null)?.joinCode;
  const inviteUrl = joinCode
    ? `${window.location.origin}/join/${joinCode}`
    : null;

  if (playerId === null) {
    return (
      <main style={{ color: '#eee', padding: '2rem', textAlign: 'center', background: '#111', minHeight: '100vh' }}>
        <h2>Waiting for opponent…</h2>
        {inviteUrl && (
          <>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#aaa' }}>
              Share this link:
            </p>
            <code style={{
              display: 'block', margin: '0.5rem auto', padding: '0.5rem 1rem',
              background: '#222', borderRadius: '4px', maxWidth: '480px',
              wordBreak: 'break-all', fontSize: '0.9rem',
            }}>
              {inviteUrl}
            </code>
            <button
              onClick={() => { void navigator.clipboard.writeText(inviteUrl); }}
              style={{
                marginTop: '0.5rem', padding: '0.4rem 1rem', cursor: 'pointer',
                background: '#444', color: '#eee', border: 'none', borderRadius: '4px',
              }}
            >
              Copy
            </button>
          </>
        )}
      </main>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        gap: '0.5rem',
        background: '#111',
        minHeight: '100vh',
      }}
    >
      <div style={{ width: '640px' }}>
        <Scoreboard
          nickname={playerId}
          score={score}
          matchEnded={matchEnded}
          isWinner={matchEnded && winnerId === playerId}
        />
      </div>

      <PixiCanvas />

      <div style={{ width: '640px' }}>
        <DetectorGauge value={detector} />
      </div>

      {matchEnded && (
        <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
          Returning to home in 4 seconds…
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run all web tests**

```bash
pnpm --filter @treasure-hunt/web test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: TypeScript check**

```bash
pnpm --filter @treasure-hunt/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite and build**

```bash
cd /path/to/repo && pnpm test && pnpm build
```

Expected: all tests pass across all packages; all dist/ directories produced.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/Match.tsx
git commit -m "feat(web): Match screen waiting overlay and invite link"
```

---

## Done criteria

Phase 2a is complete when:
1. Player 1 clicks "Create Match" → sees invite link and "Waiting for opponent…"
2. Player 2 opens the invite link → both screens transition to gameplay simultaneously
3. Both player dots are visible and move independently
4. One player finds the treasure → both screens show correct win/lose result → both redirect home after 4 seconds
5. `pnpm test` passes across all packages
6. `pnpm build` succeeds
