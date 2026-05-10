# Phase 2b — Nuggets and Powerup Pickups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add item diversity to the map — nuggets score points when dug, powerups go into a per-player slot, dropped powerups land on the ground and are picked up by walking over them, with a HUD slot display.

**Architecture:** Items are placed in rock cells by `MapGenerator` using the same PRNG, stored in `MapGrid.items[]`. `GameMatch` maintains two runtime Maps (`buriedItems` and `groundItems`) keyed `"x,y"`. Ground items are broadcast as a full array each tick. The frontend renders them as colored squares in a dedicated Pixi layer and shows the held powerup in a new `PowerupSlot` HUD component.

**Tech Stack:** TypeScript 5 strict ESM, Vitest, Pixi.js 8, React 18, Zustand 5, pnpm workspace monorepo.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/protocol/src/messages.ts` | Modify | Add `ItemType`, `heldPowerup` on `PlayerSnapshot`, `groundItems` on `state_diff`, expand `pickup` event |
| `services/game/src/map/types.ts` | Modify | Add `items` field to `MapGrid` |
| `services/game/src/map/MapGenerator.ts` | Modify | Place 6 nuggets, 2 shovels, 2 compasses, 2 bombs after treasure |
| `services/game/src/physics/movement.ts` | Modify | Add `heldPowerup` field to `PlayerState` |
| `services/game/src/match/GameMatch.ts` | Modify | Dual Maps for buried/ground items, pickup logic, `groundItems` in `state_diff` |
| `services/game/test/map/MapGenerator.test.ts` | Modify | New tests: item counts, distance constraints, no collisions |
| `services/game/test/match/GameMatch.test.ts` | Modify | New tests: nugget pickup, powerup slot, ground pickup |
| `web/src/state/gameStore.ts` | Modify | Add `groundItems` and `heldPowerup` fields, update `applyDiff` and `initFromServerMsg` |
| `web/test/state/gameStore.test.ts` | Modify | Fix broken fixtures (add `groundItems`/`heldPowerup`) + new store tests |
| `web/src/pixi/renderers/MapRenderer.ts` | Modify | Add ground-item container and `updateGroundItems` method |
| `web/src/pixi/PixiCanvas.tsx` | Modify | Subscribe to `groundItems`, call `updateGroundItems` |
| `web/src/hud/PowerupSlot.tsx` | Create | HUD component showing held powerup (or empty slot) |
| `web/src/screens/Match.tsx` | Modify | Render `<PowerupSlot>` and read `heldPowerup` from store |

---

## Task 1: Protocol — ItemType, heldPowerup, groundItems, expanded pickup

**Files:**
- Modify: `packages/protocol/src/messages.ts`

- [ ] **Step 1: Write the new messages.ts in full**

Replace the entire content of `packages/protocol/src/messages.ts`:

```ts
// Shared types for WebSocket messages and the internal Gateway↔GameServer protocol.

export type Facing = 'N' | 'S' | 'E' | 'W';
export type CellType = 'rock' | 'walkable';
export type ItemType = 'treasure' | 'nugget' | 'shovel' | 'compass' | 'bomb';

// --- Browser → Gateway → Game Server ---

export type ClientMessage =
  | { type: 'move'; dir: Facing }
  | { type: 'stop' }
  | { type: 'dig' };

// --- Game Server → Gateway → Browser ---

export interface CellChange {
  x: number;
  y: number;
  cellType: CellType;
}

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  digProgress: number; // 0–1; negative means not digging
  score: number;
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
}

export type MatchEvent =
  | { type: 'match_end'; winnerId: string; scores: Record<string, number> }
  | { type: 'pickup'; playerId: string; itemType: ItemType };

export type ServerMessage =
  | {
      type: 'init';
      matchId: string;
      playerId: string;
      mapWidth: number;
      mapHeight: number;
      walkableCells: Array<{ x: number; y: number }>; // all non-rock cells
      spawnX: number;
      spawnY: number;
    }
  | {
      type: 'state_diff';
      tick: number;
      cellsChanged: CellChange[];
      players: PlayerSnapshot[];
      detector: number; // 0–100, private per-player
      events: MatchEvent[];
      groundItems: Array<{ x: number; y: number; item: ItemType }>;
    };

// --- Internal: Gateway → Game Server ---

export type GatewayToGameMsg =
  | { type: 'player_join'; matchId: string; playerId: string }
  | { type: 'player_leave'; matchId: string; playerId: string }
  | { type: 'player_intent'; matchId: string; playerId: string; intent: ClientMessage };

// --- Internal: Game Server → Gateway ---

export type GameToGatewayMsg =
  | {
      type: 'player_init';
      playerId: string;
      init: Extract<ServerMessage, { type: 'init' }>;
    }
  | {
      type: 'player_diff';
      playerId: string;
      diff: Extract<ServerMessage, { type: 'state_diff' }>;
    };
```

- [ ] **Step 2: Verify TypeScript compiles for the protocol package**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/packages/protocol
pnpm build
```

Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/messages.ts
git commit -m "feat(protocol): add ItemType, heldPowerup, groundItems, expand pickup event"
```

---

## Task 2: MapGrid.items field + MapGenerator item placement

**Files:**
- Modify: `services/game/src/map/types.ts`
- Modify: `services/game/src/map/MapGenerator.ts`
- Test: `services/game/test/map/MapGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests to `services/game/test/map/MapGenerator.test.ts` (before the closing `}`):

```ts
  it('items array contains exactly 13 entries', () => {
    const map = generateMap('test-seed');
    expect(map.items).toHaveLength(13);
  });

  it('places exactly 1 treasure, 6 nuggets, 2 shovels, 2 compasses, 2 bombs', () => {
    const map = generateMap('test-seed');
    expect(map.items.filter((i) => i.item === 'treasure')).toHaveLength(1);
    expect(map.items.filter((i) => i.item === 'nugget')).toHaveLength(6);
    expect(map.items.filter((i) => i.item === 'shovel')).toHaveLength(2);
    expect(map.items.filter((i) => i.item === 'compass')).toHaveLength(2);
    expect(map.items.filter((i) => i.item === 'bomb')).toHaveLength(2);
  });

  it('nuggets, shovels, compasses, bombs are each ≥5 cells from both spawns', () => {
    const map = generateMap('test-seed');
    for (const { x, y, item } of map.items) {
      if (item === 'treasure') continue;
      const d1 = Math.hypot(x - 2, y - 2);
      const d2 = Math.hypot(x - 37, y - 37);
      expect(Math.min(d1, d2)).toBeGreaterThanOrEqual(5);
    }
  });

  it('no two items share the same cell', () => {
    const map = generateMap('test-seed');
    const keys = map.items.map((i) => `${i.x},${i.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('items array is deterministic for the same seed', () => {
    const a = generateMap('deterministic-items');
    const b = generateMap('deterministic-items');
    expect(a.items).toEqual(b.items);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/services/game
pnpm test -- --reporter=verbose test/map/MapGenerator.test.ts
```

Expected: new tests FAIL (Property 'items' does not exist or undefined).

- [ ] **Step 3: Update MapGrid to add items field**

Replace `services/game/src/map/types.ts` in full:

```ts
import type { ItemType } from '@treasure-hunt/protocol';

export type CellType = 'rock' | 'walkable';

export interface MapGrid {
  width: number;
  height: number;
  cells: CellType[][];  // cells[y][x]
  treasurePos: { x: number; y: number };
  items: Array<{ x: number; y: number; item: ItemType }>;
  seed: string;
}
```

- [ ] **Step 4: Update MapGenerator to place all 13 items**

Replace `services/game/src/map/MapGenerator.ts` in full:

```ts
import type { ItemType } from '@treasure-hunt/protocol';
import type { CellType } from './types.js';
import type { MapGrid } from './types.js';

const MAP_WIDTH = 40;
const MAP_HEIGHT = 40;
const SPAWN1_CENTER_X = 2;
const SPAWN1_CENTER_Y = 2;
const SPAWN2_CENTER_X = 37;
const SPAWN2_CENTER_Y = 37;
const MIN_TREASURE_DIST = 15;
const MIN_ITEM_DIST = 5;

const ITEMS_TO_PLACE: Array<{ item: Exclude<ItemType, 'treasure'>; count: number }> = [
  { item: 'nugget', count: 6 },
  { item: 'shovel', count: 2 },
  { item: 'compass', count: 2 },
  { item: 'bomb', count: 2 },
];

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

  const items: Array<{ x: number; y: number; item: ItemType }> = [
    { x: treasurePos.x, y: treasurePos.y, item: 'treasure' },
  ];
  const occupiedKeys = new Set<string>([`${treasurePos.x},${treasurePos.y}`]);

  for (const { item, count } of ITEMS_TO_PLACE) {
    let placed = 0;
    while (placed < count) {
      const x = Math.floor(rng() * MAP_WIDTH);
      const y = Math.floor(rng() * MAP_HEIGHT);
      const d1 = Math.hypot(x - SPAWN1_CENTER_X, y - SPAWN1_CENTER_Y);
      const d2 = Math.hypot(x - SPAWN2_CENTER_X, y - SPAWN2_CENTER_Y);
      if (
        cells[y]![x] === 'rock' &&
        Math.min(d1, d2) >= MIN_ITEM_DIST &&
        !occupiedKeys.has(`${x},${y}`)
      ) {
        items.push({ x, y, item });
        occupiedKeys.add(`${x},${y}`);
        placed++;
      }
    }
  }

  return { width: MAP_WIDTH, height: MAP_HEIGHT, cells, treasurePos, items, seed };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/services/game
pnpm test -- --reporter=verbose test/map/MapGenerator.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/game/src/map/types.ts services/game/src/map/MapGenerator.ts services/game/test/map/MapGenerator.test.ts
git commit -m "feat(game): add items field to MapGrid, place 13 items in MapGenerator"
```

---

## Task 3: PlayerState.heldPowerup + GameMatch pickup logic

**Files:**
- Modify: `services/game/src/physics/movement.ts`
- Modify: `services/game/src/match/GameMatch.ts`
- Test: `services/game/test/match/GameMatch.test.ts`

**Background:** `DIG_TICKS = 24` (from `digSystem.ts`). Tests teleport the player's dig state directly to avoid running 24 ticks. `match['players']`, `match['buriedItems']`, and `match['groundItems']` are accessible via bracket notation (TypeScript private, but accessible in JS tests).

- [ ] **Step 1: Write the failing tests**

Append the following describe block to `services/game/test/match/GameMatch.test.ts`:

```ts
describe('GameMatch item pickups', () => {
  it('digging a nugget cell awards 10 pts and emits pickup event', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const nugget = match['map'].items.find((i: { item: string }) => i.item === 'nugget')!;
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      digTarget: { x: nugget.x, y: nugget.y },
      digTicksRemaining: 1,
    });

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.score).toBe(10);
      expect(diff.diff.events).toContainEqual({
        type: 'pickup', playerId: 'alice', itemType: 'nugget',
      });
      expect(match['buriedItems'].has(`${nugget.x},${nugget.y}`)).toBe(false);
    }
  });

  it('digging a powerup cell with empty slot sets heldPowerup and emits pickup', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const shovel = match['map'].items.find((i: { item: string }) => i.item === 'shovel')!;
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: null,
      digTarget: { x: shovel.x, y: shovel.y },
      digTicksRemaining: 1,
    });

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.heldPowerup).toBe('shovel');
      expect(diff.diff.events).toContainEqual({
        type: 'pickup', playerId: 'alice', itemType: 'shovel',
      });
    }
  });

  it('digging a powerup cell with full slot drops it to groundItems', () => {
    const { match } = makeTwoPlayerMatch();
    const shovel1 = match['map'].items.filter(
      (i: { item: string }) => i.item === 'shovel',
    )[0]!;
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: 'compass',
      digTarget: { x: shovel1.x, y: shovel1.y },
      digTicksRemaining: 1,
    });

    match.tickOnce();

    expect(match['groundItems'].get(`${shovel1.x},${shovel1.y}`)).toBe('shovel');
    expect(match['buriedItems'].has(`${shovel1.x},${shovel1.y}`)).toBe(false);
  });

  it('walking over a nugget ground item awards 10 pts and removes it', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['groundItems'].set(groundKey, 'nugget');

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.score).toBe(10);
      expect(match['groundItems'].has(groundKey)).toBe(false);
    }
  });

  it('walking over a powerup ground item with empty slot picks it up', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['players'].set('alice', { ...alice, heldPowerup: null });
    match['groundItems'].set(groundKey, 'bomb');

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.heldPowerup).toBe('bomb');
      expect(match['groundItems'].has(groundKey)).toBe(false);
    }
  });

  it('walking over a powerup ground item with full slot leaves it in groundItems', () => {
    const { match } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['players'].set('alice', { ...alice, heldPowerup: 'compass' });
    match['groundItems'].set(groundKey, 'bomb');

    match.tickOnce();

    expect(match['groundItems'].has(groundKey)).toBe(true);
    expect(match['groundItems'].get(groundKey)).toBe('bomb');
  });

  it('state_diff includes groundItems array', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['groundItems'].set(`${Math.floor(alice.x)},${Math.floor(alice.y)}`, 'shovel');

    match.tickOnce();

    const diff = emitted.find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      expect(Array.isArray(diff.diff.groundItems)).toBe(true);
      expect(diff.diff.groundItems.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/services/game
pnpm test -- --reporter=verbose test/match/GameMatch.test.ts
```

Expected: new tests FAIL (heldPowerup, groundItems, buriedItems not in expected shape).

- [ ] **Step 3: Add heldPowerup to PlayerState**

In `services/game/src/physics/movement.ts`, replace the `PlayerState` interface:

```ts
export interface PlayerState {
  id: string;
  x: number;         // fractional cell coordinate
  y: number;
  facing: Facing;
  moveDir: Facing | null;
  digTarget: { x: number; y: number } | null;
  digTicksRemaining: number; // 0 = not digging; starts at DIG_TICKS on dig start
  score: number;
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
}
```

- [ ] **Step 4: Rewrite GameMatch.ts**

Replace `services/game/src/match/GameMatch.ts` in full:

```ts
import type {
  ClientMessage,
  CellChange,
  PlayerSnapshot,
  MatchEvent,
  ServerMessage,
  GameToGatewayMsg,
  ItemType,
} from '@treasure-hunt/protocol';
import { generateMap } from '../map/MapGenerator.js';
import type { MapGrid } from '../map/types.js';
import { applyMovement, type PlayerState } from '../physics/movement.js';
import { computeDetector } from '../physics/detector.js';
import {
  DIG_TICKS,
  startDig,
  advanceDig,
  isDugComplete,
} from './digSystem.js';

export type MatchEventEmitter = (msg: GameToGatewayMsg) => void;

export class GameMatch {
  private readonly matchId: string;
  private readonly map: MapGrid;
  private readonly players = new Map<string, PlayerState>();
  private readonly intentQueues = new Map<string, ClientMessage[]>();
  private readonly buriedItems = new Map<string, ItemType>(); // "x,y" → item
  private readonly groundItems = new Map<string, ItemType>(); // "x,y" → item
  private tick = 0;
  private ended = false;
  private emit: MatchEventEmitter;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(matchId: string, seed: string, emit: MatchEventEmitter) {
    this.matchId = matchId;
    this.map = generateMap(seed);
    this.emit = emit;
    for (const { x, y, item } of this.map.items) {
      this.buriedItems.set(`${x},${y}`, item);
    }
  }

  addPlayer(playerId: string): void {
    if (this.players.has(playerId) || this.players.size >= 2) return;
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

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.intentQueues.delete(playerId);
  }

  queueIntent(playerId: string, intent: ClientMessage): void {
    this.intentQueues.get(playerId)?.push(intent);
  }

  start(): void {
    if (this.intervalHandle !== null) return;
    this.intervalHandle = setInterval(() => this.tickOnce(), 1000 / 30);
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // Exposed for testing — run one tick manually
  tickOnce(): void {
    if (this.ended) return;
    this.tick++;

    const cellsChanged: CellChange[] = [];
    const events: MatchEvent[] = [];

    for (const [playerId, player] of this.players) {
      const queue = this.intentQueues.get(playerId) ?? [];
      this.intentQueues.set(playerId, []);

      let state = player;

      // Drain intents
      for (const intent of queue) {
        if (intent.type === 'move') {
          state = { ...state, moveDir: intent.dir, facing: intent.dir };
        } else if (intent.type === 'stop') {
          state = { ...state, moveDir: null };
        } else if (intent.type === 'dig') {
          state = startDig(state, this.map);
        }
      }

      // Advance dig timer
      state = advanceDig(state);

      // Resolve completed dig
      if (isDugComplete(state) && state.digTarget) {
        const { x: tx, y: ty } = state.digTarget;
        const buriedKey = `${tx},${ty}`;
        this.map.cells[ty]![tx] = 'walkable';
        cellsChanged.push({ x: tx, y: ty, cellType: 'walkable' });

        const buried = this.buriedItems.get(buriedKey);
        if (buried !== undefined) {
          this.buriedItems.delete(buriedKey);
          if (buried === 'treasure') {
            state = { ...state, score: state.score + 100 };
            events.push({ type: 'pickup', playerId, itemType: 'treasure' });
            events.push({
              type: 'match_end',
              winnerId: playerId,
              scores: { [playerId]: state.score },
            });
            this.ended = true;
          } else if (buried === 'nugget') {
            state = { ...state, score: state.score + 10 };
            events.push({ type: 'pickup', playerId, itemType: 'nugget' });
          } else {
            // powerup: shovel | compass | bomb
            if (state.heldPowerup === null) {
              state = { ...state, heldPowerup: buried as 'shovel' | 'compass' | 'bomb' };
              events.push({ type: 'pickup', playerId, itemType: buried });
            } else {
              this.groundItems.set(buriedKey, buried);
            }
          }
        }

        state = { ...state, digTarget: null };
      }

      // Apply movement (only if not digging)
      if (state.digTicksRemaining === 0) {
        state = applyMovement(state, this.map);
      }

      // Ground pickup
      const groundKey = `${Math.floor(state.x)},${Math.floor(state.y)}`;
      const groundItem = this.groundItems.get(groundKey);
      if (groundItem !== undefined) {
        if (groundItem === 'nugget') {
          state = { ...state, score: state.score + 10 };
          this.groundItems.delete(groundKey);
          events.push({ type: 'pickup', playerId, itemType: 'nugget' });
        } else if (state.heldPowerup === null) {
          state = { ...state, heldPowerup: groundItem as 'shovel' | 'compass' | 'bomb' };
          this.groundItems.delete(groundKey);
          events.push({ type: 'pickup', playerId, itemType: groundItem });
        }
        // else: full slot — leave item in groundItems
      }

      this.players.set(playerId, state);
    }

    // Build and emit a state diff for each player
    const groundItemsArray = [...this.groundItems.entries()].map(([key, item]) => {
      const [xs, ys] = key.split(',');
      return { x: Number(xs), y: Number(ys), item };
    });

    for (const [playerId, player] of this.players) {
      const buriedPositions = [...this.buriedItems.keys()].map((key) => {
        const [xs, ys] = key.split(',');
        return { x: Number(xs), y: Number(ys) };
      });
      const detector = computeDetector(player, buriedPositions);

      const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        facing: p.facing,
        digProgress: p.digTarget !== null ? 1 - p.digTicksRemaining / DIG_TICKS : -1,
        score: p.score,
        heldPowerup: p.heldPowerup,
      }));

      const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
        type: 'state_diff',
        tick: this.tick,
        cellsChanged,
        players,
        detector,
        events,
        groundItems: groundItemsArray,
      };
      this.emit({ type: 'player_diff', playerId, diff });
    }

    if (this.ended) this.stop();
  }
}
```

- [ ] **Step 5: Run game tests**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/services/game
pnpm test -- --reporter=verbose
```

Expected: all tests PASS (including existing tests and the new item pickup tests).

- [ ] **Step 6: Commit**

```bash
git add services/game/src/physics/movement.ts services/game/src/match/GameMatch.ts services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): dual buriedItems/groundItems Maps, pickup logic, heldPowerup in PlayerState"
```

---

## Task 4: Frontend store — groundItems and heldPowerup

**Files:**
- Modify: `web/src/state/gameStore.ts`
- Modify: `web/test/state/gameStore.test.ts`

**Background:** Existing test fixtures in `gameStore.test.ts` construct `state_diff` and `PlayerSnapshot` objects literally. Since both now have required new fields (`groundItems` and `heldPowerup`), those fixtures break TypeScript. We fix them and add new assertions.

- [ ] **Step 1: Write the new test file**

Replace `web/test/state/gameStore.test.ts` in full:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useGameStore, initFromServerMsg, applyDiff } from '../../src/state/gameStore.js';
import type { ServerMessage } from '@treasure-hunt/protocol';

beforeEach(() => {
  useGameStore.setState({
    matchId: null,
    playerId: null,
    mapWidth: 0,
    mapHeight: 0,
    cells: new Map(),
    players: [],
    detector: 0,
    score: 0,
    matchEnded: false,
    winnerId: null,
    groundItems: [],
    heldPowerup: null,
  });
});

describe('gameStore', () => {
  const initMsg: Extract<ServerMessage, { type: 'init' }> = {
    type: 'init',
    matchId: 'm1',
    playerId: 'alice',
    mapWidth: 40,
    mapHeight: 40,
    walkableCells: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    spawnX: 2.5,
    spawnY: 2.5,
  };

  it('initialises state from an init message', () => {
    initFromServerMsg(initMsg);
    const state = useGameStore.getState();
    expect(state.matchId).toBe('m1');
    expect(state.playerId).toBe('alice');
    expect(state.mapWidth).toBe(40);
    expect(state.cells.get('1,1')).toBe('walkable');
    expect(state.cells.get('0,0')).toBe('rock');
    expect(state.groundItems).toEqual([]);
    expect(state.heldPowerup).toBeNull();
  });

  it('applies cell changes from a state_diff', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 1,
      cellsChanged: [{ x: 5, y: 5, cellType: 'walkable' }],
      players: [{ id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0, heldPowerup: null }],
      detector: 42,
      events: [],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.cells.get('5,5')).toBe('walkable');
    expect(state.detector).toBe(42);
    expect(state.score).toBe(0);
  });

  it('sets matchEnded on match_end event', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 2,
      cellsChanged: [],
      players: [{ id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 100, heldPowerup: null }],
      detector: 0,
      events: [{ type: 'match_end', winnerId: 'alice', scores: { alice: 100 } }],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.matchEnded).toBe(true);
    expect(state.winnerId).toBe('alice');
    expect(state.score).toBe(100);
  });

  it('updates groundItems from state_diff', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 3,
      cellsChanged: [],
      players: [{ id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0, heldPowerup: null }],
      detector: 0,
      events: [],
      groundItems: [{ x: 10, y: 15, item: 'shovel' }],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.groundItems).toEqual([{ x: 10, y: 15, item: 'shovel' }]);
  });

  it('reads heldPowerup from own PlayerSnapshot', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 4,
      cellsChanged: [],
      players: [{ id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0, heldPowerup: 'compass' }],
      detector: 0,
      events: [],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.heldPowerup).toBe('compass');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/web
pnpm test -- --reporter=verbose test/state/gameStore.test.ts
```

Expected: new tests FAIL (groundItems/heldPowerup not in store).

- [ ] **Step 3: Update gameStore.ts**

Replace `web/src/state/gameStore.ts` in full:

```ts
import { create } from 'zustand';
import type {
  CellType,
  ServerMessage,
  PlayerSnapshot,
  ItemType,
} from '@treasure-hunt/protocol';

interface GameState {
  matchId: string | null;
  playerId: string | null;
  mapWidth: number;
  mapHeight: number;
  cells: Map<string, CellType>;   // key = `${x},${y}`
  players: PlayerSnapshot[];
  detector: number;
  score: number;
  matchEnded: boolean;
  winnerId: string | null;
  groundItems: Array<{ x: number; y: number; item: ItemType }>;
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
}

export const useGameStore = create<GameState>()(() => ({
  matchId: null,
  playerId: null,
  mapWidth: 0,
  mapHeight: 0,
  cells: new Map(),
  players: [],
  detector: 0,
  score: 0,
  matchEnded: false,
  winnerId: null,
  groundItems: [],
  heldPowerup: null,
}));

export function initFromServerMsg(
  msg: Extract<ServerMessage, { type: 'init' }>,
): void {
  const cells = new Map<string, CellType>();
  for (let y = 0; y < msg.mapHeight; y++) {
    for (let x = 0; x < msg.mapWidth; x++) {
      cells.set(`${x},${y}`, 'rock');
    }
  }
  for (const { x, y } of msg.walkableCells) {
    cells.set(`${x},${y}`, 'walkable');
  }

  useGameStore.setState({
    matchId: msg.matchId,
    playerId: msg.playerId,
    mapWidth: msg.mapWidth,
    mapHeight: msg.mapHeight,
    cells,
    players: [],
    detector: 0,
    score: 0,
    matchEnded: false,
    winnerId: null,
    groundItems: [],
    heldPowerup: null,
  });
}

export function applyDiff(
  diff: Extract<ServerMessage, { type: 'state_diff' }>,
  myPlayerId: string,
): void {
  useGameStore.setState((prev) => {
    const cells = new Map(prev.cells);
    for (const { x, y, cellType } of diff.cellsChanged) {
      cells.set(`${x},${y}`, cellType);
    }

    let matchEnded = prev.matchEnded;
    let winnerId = prev.winnerId;
    const myPlayer = diff.players.find((p: PlayerSnapshot) => p.id === myPlayerId);
    const score = myPlayer?.score ?? prev.score;
    const heldPowerup = myPlayer?.heldPowerup ?? prev.heldPowerup;

    for (const event of diff.events) {
      if (event.type === 'match_end') {
        matchEnded = true;
        winnerId = event.winnerId;
      }
    }

    return {
      cells,
      players: diff.players,
      detector: diff.detector,
      score,
      matchEnded,
      winnerId,
      groundItems: diff.groundItems,
      heldPowerup,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/web
pnpm test -- --reporter=verbose test/state/gameStore.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/state/gameStore.ts web/test/state/gameStore.test.ts
git commit -m "feat(web): add groundItems and heldPowerup to game store"
```

---

## Task 5: MapRenderer ground items + PixiCanvas subscription

**Files:**
- Modify: `web/src/pixi/renderers/MapRenderer.ts`
- Modify: `web/src/pixi/PixiCanvas.tsx`

**Background:** The Pixi stage uses insertion order for draw order. `MapRenderer` currently adds one container for tile sprites. We add a second container (`groundContainer`) in the same constructor, which goes on top of tiles but under the player layer (which `PlayerRenderer` adds afterwards in `PixiCanvas`).

- [ ] **Step 1: Update MapRenderer.ts**

Replace `web/src/pixi/renderers/MapRenderer.ts` in full:

```ts
import { Application, Graphics, Container } from 'pixi.js';
import type { CellType, ItemType } from '@treasure-hunt/protocol';

const CELL_SIZE = 16;
const ROCK_COLOR = 0x333333;
const WALKABLE_COLOR = 0x888888;
const ITEM_SIZE = 8;

const ITEM_COLORS: Record<Exclude<ItemType, 'treasure'>, number> = {
  nugget: 0xffd700,
  shovel: 0x88aaff,
  compass: 0x88ffaa,
  bomb: 0xff8888,
};

export class MapRenderer {
  private container: Container;
  private groundContainer: Container;
  private tiles = new Map<string, Graphics>(); // key = `${x},${y}`

  constructor(app: Application) {
    this.container = new Container();
    app.stage.addChild(this.container);
    this.groundContainer = new Container();
    app.stage.addChild(this.groundContainer);
  }

  initMap(
    width: number,
    height: number,
    cells: Map<string, CellType>,
  ): void {
    this.container.removeChildren();
    this.tiles.clear();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cellType = cells.get(`${x},${y}`) ?? 'rock';
        const g = this.drawCell(cellType);
        g.x = x * CELL_SIZE;
        g.y = y * CELL_SIZE;
        this.container.addChild(g);
        this.tiles.set(`${x},${y}`, g);
      }
    }
  }

  updateCells(cells: Map<string, CellType>): void {
    for (const [key, cellType] of cells) {
      const g = this.tiles.get(key);
      if (g) {
        g.clear();
        g.rect(0, 0, CELL_SIZE, CELL_SIZE)
          .fill(cellType === 'walkable' ? WALKABLE_COLOR : ROCK_COLOR);
      }
    }
  }

  updateGroundItems(items: Array<{ x: number; y: number; item: ItemType }>): void {
    this.groundContainer.removeChildren();
    for (const { x, y, item } of items) {
      if (item === 'treasure') continue;
      const color = ITEM_COLORS[item as Exclude<ItemType, 'treasure'>];
      const g = new Graphics();
      g.rect(0, 0, ITEM_SIZE, ITEM_SIZE).fill(color);
      g.x = x * CELL_SIZE + (CELL_SIZE - ITEM_SIZE) / 2;
      g.y = y * CELL_SIZE + (CELL_SIZE - ITEM_SIZE) / 2;
      this.groundContainer.addChild(g);
    }
  }

  private drawCell(cellType: CellType): Graphics {
    const g = new Graphics();
    g.rect(0, 0, CELL_SIZE, CELL_SIZE)
      .fill(cellType === 'walkable' ? WALKABLE_COLOR : ROCK_COLOR);
    return g;
  }
}
```

- [ ] **Step 2: Update PixiCanvas.tsx to call updateGroundItems**

In `web/src/pixi/PixiCanvas.tsx`, replace the store subscriber (lines 76–87):

```ts
  // Subscribe to players and ground items at high frequency using a store subscriber
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      playerRendRef.current?.update(state.players);
      // Update only changed cells
      const changed = new Map<string, CellType>();
      for (const [k, v] of state.cells) {
        changed.set(k, v);
      }
      mapRendRef.current?.updateCells(changed);
      mapRendRef.current?.updateGroundItems(state.groundItems);
    });
    return unsub;
  }, []);
```

- [ ] **Step 3: Build web to verify TypeScript is happy**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/web
pnpm build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pixi/renderers/MapRenderer.ts web/src/pixi/PixiCanvas.tsx
git commit -m "feat(web): render ground items as colored squares in dedicated Pixi layer"
```

---

## Task 6: PowerupSlot HUD component + Match.tsx integration

**Files:**
- Create: `web/src/hud/PowerupSlot.tsx`
- Modify: `web/src/screens/Match.tsx`
- Test: `web/test/hud/PowerupSlot.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `web/test/hud/PowerupSlot.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PowerupSlot from '../../src/hud/PowerupSlot.js';

describe('PowerupSlot', () => {
  it('renders "—" when heldPowerup is null', () => {
    render(<PowerupSlot heldPowerup={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders powerup name in uppercase when held', () => {
    render(<PowerupSlot heldPowerup="shovel" />);
    expect(screen.getByText('SHOVEL')).toBeInTheDocument();
  });

  it('renders COMPASS in uppercase when held', () => {
    render(<PowerupSlot heldPowerup="compass" />);
    expect(screen.getByText('COMPASS')).toBeInTheDocument();
  });

  it('renders BOMB in uppercase when held', () => {
    render(<PowerupSlot heldPowerup="bomb" />);
    expect(screen.getByText('BOMB')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/web
pnpm test -- --reporter=verbose test/hud/PowerupSlot.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create PowerupSlot.tsx**

Create `web/src/hud/PowerupSlot.tsx`:

```tsx
interface Props {
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
}

const POWERUP_COLORS: Record<'shovel' | 'compass' | 'bomb', string> = {
  shovel: '#88aaff',
  compass: '#88ffaa',
  bomb: '#ff8888',
};

export default function PowerupSlot({ heldPowerup }: Props) {
  const isEmpty = heldPowerup === null;
  const color = isEmpty ? undefined : POWERUP_COLORS[heldPowerup];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.75rem',
        border: `2px solid ${isEmpty ? '#444' : color}`,
        borderRadius: '4px',
        background: isEmpty ? 'transparent' : `${color}33`,
        color: isEmpty ? '#555' : '#eee',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
      }}
    >
      <span style={{ fontWeight: 'bold' }}>POWERUP:</span>
      <span>{isEmpty ? '—' : heldPowerup.toUpperCase()}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/web
pnpm test -- --reporter=verbose test/hud/PowerupSlot.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Add PowerupSlot to Match.tsx**

In `web/src/screens/Match.tsx`, add the import after the existing HUD imports:

```ts
import PowerupSlot from '../hud/PowerupSlot.js';
```

Add `heldPowerup` to the store reads (after the `playerId` line):

```ts
  const heldPowerup = useGameStore((s) => s.heldPowerup);
```

Add `<PowerupSlot>` to the rendered layout. In the return block, add it between the Scoreboard `<div>` and `<PixiCanvas />`:

```tsx
      <div style={{ width: '640px' }}>
        <PowerupSlot heldPowerup={heldPowerup} />
      </div>
```

The full updated return block for the non-waiting path becomes:

```tsx
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

      <div style={{ width: '640px' }}>
        <PowerupSlot heldPowerup={heldPowerup} />
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
```

- [ ] **Step 6: Run all web tests**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt/web
pnpm test -- --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 7: Build the full monorepo**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt
pnpm build
```

Expected: exits 0, no TypeScript errors anywhere.

- [ ] **Step 8: Commit**

```bash
git add web/src/hud/PowerupSlot.tsx web/test/hud/PowerupSlot.test.tsx web/src/screens/Match.tsx
git commit -m "feat(web): PowerupSlot HUD component and Match.tsx integration"
```
