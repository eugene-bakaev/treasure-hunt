# Phase 2c — Powerup Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Spacebar activation for the three powerups (shovel, compass, bomb) so they actually do something — buff timing, nearest-item snapshot, 3×3 cell destruction — with anti-cheat-safe routing and HUD feedback.

**Architecture:** Server-authoritative as before. A new `activationSystem.ts` module owns powerup resolution; `GameMatch.tickOnce` invokes it after intent drain and before dig advance, then routes public events to all players and `compass_result` only to the activator. `PlayerState` gains a `fasterShovelTicksRemaining` field; `PlayerSnapshot` exposes it via a new `buffs` field. The frontend gets a `BuffBar`, a disabled-state on `PowerupSlot`, and a Pixi compass marker that decays after 5 s via a local timer.

**Tech Stack:** TypeScript 5 strict, ESM, pnpm workspaces, Vitest, React 18, Zustand 5, Pixi.js v8.

**Reference spec:** `docs/superpowers/specs/2026-05-10-phase-2c-powerup-activation-design.md`.

---

## File Structure

**Modified:**
- `packages/protocol/src/messages.ts` — `ClientMessage`, `PlayerSnapshot`, `MatchEvent`, new `PlayerBuffs` and `CompassResult` types.
- `services/game/src/physics/movement.ts` — add `fasterShovelTicksRemaining` to `PlayerState`.
- `services/game/src/match/digSystem.ts` — buff-aware `startDig`.
- `services/game/src/match/GameMatch.ts` — initialize buff field; two-pass intent drain (activate first, then move/stop/dig); call `activatePowerup`; per-tick buff decrement; merge cellsChanged/events from activation; `private`/`public` event routing; treasure ground pickup → `match_end`.
- `web/src/state/gameStore.ts` — `buffs`, `compassResult` fields; `applyDiff` reads buffs and compass_result events; new `expireCompassResult` action.
- `web/src/hooks/useInput.ts` — Spacebar → `onActivate`.
- `web/src/screens/Match.tsx` — wire `onActivate`, `BuffBar`, `disabled` slot.
- `web/src/hud/PowerupSlot.tsx` — `disabled` prop.
- `web/src/pixi/renderers/MapRenderer.ts` — `updateCompassMarker` (pulsing ring + arrow).
- `web/src/pixi/PixiCanvas.tsx` — subscribe to `compassResult` + local player; render via `MapRenderer`; ticker for expiry.

**Created:**
- `services/game/src/match/activationSystem.ts` — pure powerup resolution (`activatePowerup`).
- `services/game/test/match/activationSystem.test.ts` — unit tests for shovel, compass, bomb.
- `web/src/hud/BuffBar.tsx` — countdown bar component.
- `web/test/hud/BuffBar.test.tsx` — unit tests.

---

### Task 1: Extend protocol types

**Files:**
- Modify: `packages/protocol/src/messages.ts`

Adds `activate` to `ClientMessage`, `PlayerBuffs` and `buffs` field to `PlayerSnapshot`, `CompassResult` union, and three new `MatchEvent` variants. Type-only change; the failing tests come in subsequent tasks that consume these types.

- [ ] **Step 1: Replace `ClientMessage`, `PlayerSnapshot`, `MatchEvent` and add new exports**

```ts
// packages/protocol/src/messages.ts — replace the matching sections

export type ClientMessage =
  | { type: 'move'; dir: Facing }
  | { type: 'stop' }
  | { type: 'dig' }
  | { type: 'activate' };

export interface PlayerBuffs {
  fasterShovelTicksRemaining: number;
}

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  digProgress: number;
  score: number;
  heldPowerup: Exclude<ItemType, 'treasure' | 'nugget'> | null;
  buffs: PlayerBuffs;
}

export type CompassResult =
  | { kind: 'exact'; x: number; y: number; itemType: ItemType }
  | { kind: 'direction'; angleRad: number }
  | { kind: 'no_target' };

export type MatchEvent =
  | { type: 'match_end'; winnerId: string; scores: Record<string, number> }
  | { type: 'pickup'; playerId: string; itemType: ItemType }
  | { type: 'powerup_activate'; playerId: string; powerup: Exclude<ItemType, 'treasure' | 'nugget'> }
  | { type: 'compass_result'; playerId: string; result: CompassResult }
  | { type: 'bomb_detonate'; playerId: string; cells: Array<{ x: number; y: number }> };
```

- [ ] **Step 2: Build the protocol package to confirm type compilation**

Run: `pnpm --filter @treasure-hunt/protocol build`
Expected: clean build (consumers will fail to typecheck until later tasks update them; do not run downstream builds yet).

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/messages.ts
git commit -m "feat(protocol): add activate intent, buffs, compass_result, bomb_detonate, powerup_activate"
```

---

### Task 2: PlayerState carries buffs and tickOnce maps them into PlayerSnapshot

**Files:**
- Modify: `services/game/src/physics/movement.ts`
- Modify: `services/game/src/match/GameMatch.ts`
- Test: `services/game/test/match/GameMatch.test.ts`

Adds `fasterShovelTicksRemaining: number` to `PlayerState`, initializes it to `0`, and surfaces it in the per-tick `PlayerSnapshot.buffs`.

- [ ] **Step 1: Write the failing test**

Append to `services/game/test/match/GameMatch.test.ts` inside the existing top-level `describe('GameMatch', () => { ... })` block (or as a new sibling `describe`):

```ts
describe('GameMatch buffs', () => {
  it('PlayerSnapshot in diff carries buffs.fasterShovelTicksRemaining default 0', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    match.tickOnce();
    const diff = emitted.find((m) => m.type === 'player_diff');
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.buffs).toEqual({ fasterShovelTicksRemaining: 0 });
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @treasure-hunt/game test -t 'PlayerSnapshot in diff carries buffs'`
Expected: FAIL — `player.buffs` is `undefined` (property doesn't exist on snapshot).

- [ ] **Step 3: Add `fasterShovelTicksRemaining` to `PlayerState`**

In `services/game/src/physics/movement.ts`, replace the `PlayerState` interface:

```ts
export interface PlayerState {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  moveDir: Facing | null;
  digTarget: { x: number; y: number } | null;
  digTicksRemaining: number;
  score: number;
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
  fasterShovelTicksRemaining: number;
}
```

- [ ] **Step 4: Initialize the field in `GameMatch.addPlayer`**

In `services/game/src/match/GameMatch.ts`, find the `players.set` call inside `addPlayer` and add the new field:

```ts
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
```

- [ ] **Step 5: Map the field into `PlayerSnapshot.buffs` in `tickOnce`**

In `services/game/src/match/GameMatch.ts`, find the snapshot construction in the diff loop and replace:

```ts
const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
  id: p.id,
  x: p.x,
  y: p.y,
  facing: p.facing,
  digProgress: p.digTarget !== null ? 1 - p.digTicksRemaining / DIG_TICKS : -1,
  score: p.score,
  heldPowerup: p.heldPowerup,
  buffs: { fasterShovelTicksRemaining: p.fasterShovelTicksRemaining },
}));
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm --filter @treasure-hunt/game test -t 'PlayerSnapshot in diff carries buffs'`
Expected: PASS.

- [ ] **Step 7: Run the full game-server test file to confirm nothing else regressed**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add services/game/src/physics/movement.ts services/game/src/match/GameMatch.ts services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): add fasterShovelTicksRemaining to PlayerState and surface buffs in PlayerSnapshot"
```

---

### Task 3: Buff decrements per tick

**Files:**
- Modify: `services/game/src/match/GameMatch.ts`
- Test: `services/game/test/match/GameMatch.test.ts`

After movement resolves each tick, decrement `fasterShovelTicksRemaining` by 1 (floored at 0).

- [ ] **Step 1: Write the failing test**

Add inside `describe('GameMatch buffs', ...)`:

```ts
it('decrements fasterShovelTicksRemaining once per tick', () => {
  const { match, emitted } = makeTwoPlayerMatch();
  const alice = match['players'].get('alice')!;
  match['players'].set('alice', { ...alice, fasterShovelTicksRemaining: 10 });

  match.tickOnce();
  expect(match['players'].get('alice')!.fasterShovelTicksRemaining).toBe(9);

  emitted.length = 0;
  match.tickOnce();
  expect(match['players'].get('alice')!.fasterShovelTicksRemaining).toBe(8);
});

it('floors fasterShovelTicksRemaining at 0', () => {
  const { match } = makeTwoPlayerMatch();
  const alice = match['players'].get('alice')!;
  match['players'].set('alice', { ...alice, fasterShovelTicksRemaining: 0 });
  match.tickOnce();
  expect(match['players'].get('alice')!.fasterShovelTicksRemaining).toBe(0);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @treasure-hunt/game test -t 'decrements fasterShovelTicksRemaining'`
Expected: FAIL — value stays at 10.

- [ ] **Step 3: Add the decrement after movement, before ground pickup**

In `services/game/src/match/GameMatch.ts`, locate the per-player loop in `tickOnce`. Immediately after `state = applyMovement(state, this.map);` (and before the `// Ground pickup` block), insert:

```ts
// Buff decrement
state = {
  ...state,
  fasterShovelTicksRemaining: Math.max(0, state.fasterShovelTicksRemaining - 1),
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @treasure-hunt/game test -t 'decrements fasterShovelTicksRemaining'` and `... -t 'floors fasterShovelTicksRemaining'`
Expected: PASS.

- [ ] **Step 5: Run the full game suite**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/game/src/match/GameMatch.ts services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): decrement fasterShovelTicksRemaining each tick"
```

---

### Task 4: digSystem honors the Faster Shovel buff

**Files:**
- Modify: `services/game/src/match/digSystem.ts`
- Test: `services/game/test/match/digSystem.test.ts`

`startDig` halves the timer when the activator has the Faster Shovel buff.

- [ ] **Step 1: Write the failing test**

Append to `services/game/test/match/digSystem.test.ts`:

```ts
describe('startDig with Faster Shovel buff', () => {
  it('uses ceil(DIG_TICKS / 2) ticks when fasterShovelTicksRemaining > 0', () => {
    const map: MapGrid = {
      width: 3,
      height: 3,
      cells: [
        ['walkable', 'rock', 'walkable'],
        ['walkable', 'walkable', 'walkable'],
        ['walkable', 'walkable', 'walkable'],
      ],
      treasurePos: { x: 1, y: 0 },
      items: [],
      seed: 'test',
    };
    const player: PlayerState = {
      id: 'p1',
      x: 1.5,
      y: 1.5,
      facing: 'N',
      moveDir: null,
      digTarget: null,
      digTicksRemaining: 0,
      score: 0,
      heldPowerup: null,
      fasterShovelTicksRemaining: 100,
    };
    const after = startDig(player, map);
    expect(after.digTicksRemaining).toBe(Math.ceil(DIG_TICKS / 2));
  });

  it('uses full DIG_TICKS when fasterShovelTicksRemaining is 0', () => {
    const map: MapGrid = {
      width: 3,
      height: 3,
      cells: [
        ['walkable', 'rock', 'walkable'],
        ['walkable', 'walkable', 'walkable'],
        ['walkable', 'walkable', 'walkable'],
      ],
      treasurePos: { x: 1, y: 0 },
      items: [],
      seed: 'test',
    };
    const player: PlayerState = {
      id: 'p1',
      x: 1.5,
      y: 1.5,
      facing: 'N',
      moveDir: null,
      digTarget: null,
      digTicksRemaining: 0,
      score: 0,
      heldPowerup: null,
      fasterShovelTicksRemaining: 0,
    };
    const after = startDig(player, map);
    expect(after.digTicksRemaining).toBe(DIG_TICKS);
  });
});
```

(If the existing imports in this test file lack `MapGrid` or `PlayerState`, add them at the top:
```ts
import type { MapGrid } from '../../src/map/types.js';
import type { PlayerState } from '../../src/physics/movement.js';
```)

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @treasure-hunt/game test -t 'with Faster Shovel buff'`
Expected: FAIL — first test still returns full `DIG_TICKS`.

- [ ] **Step 3: Update `startDig` to halve the duration when buffed**

In `services/game/src/match/digSystem.ts`, replace the final `return` line of `startDig`:

```ts
const ticks = player.fasterShovelTicksRemaining > 0
  ? Math.ceil(DIG_TICKS / 2)
  : DIG_TICKS;
return { ...player, digTarget: target, digTicksRemaining: ticks };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @treasure-hunt/game test -t 'with Faster Shovel buff'`
Expected: PASS.

- [ ] **Step 5: Run the full game suite**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/game/src/match/digSystem.ts services/game/test/match/digSystem.test.ts
git commit -m "feat(game): startDig halves duration while Faster Shovel buff is active"
```

---

### Task 5: activationSystem module + shovel resolution

**Files:**
- Create: `services/game/src/match/activationSystem.ts`
- Test: `services/game/test/match/activationSystem.test.ts`

Pure module that resolves a powerup activation given the player and match state. This task implements only the **shovel** branch.

- [ ] **Step 1: Write the failing tests for shovel**

Create `services/game/test/match/activationSystem.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activatePowerup,
  FASTER_SHOVEL_TICKS,
  type ActivationContext,
} from '../../src/match/activationSystem.js';
import type { ItemType } from '@treasure-hunt/protocol';
import type { MapGrid } from '../../src/map/types.js';
import type { PlayerState } from '../../src/physics/movement.js';

function makeMap(width = 5, height = 5): MapGrid {
  const cells: ('rock' | 'walkable')[][] = [];
  for (let y = 0; y < height; y++) {
    const row: ('rock' | 'walkable')[] = [];
    for (let x = 0; x < width; x++) row.push('rock');
    cells.push(row);
  }
  return { width, height, cells, treasurePos: { x: 0, y: 0 }, items: [], seed: 'test' };
}

function makePlayer(over: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    x: 2.5,
    y: 2.5,
    facing: 'E',
    moveDir: null,
    digTarget: null,
    digTicksRemaining: 0,
    score: 0,
    heldPowerup: null,
    fasterShovelTicksRemaining: 0,
    ...over,
  };
}

function makeCtx(over: Partial<ActivationContext> = {}): ActivationContext {
  return {
    player: makePlayer(),
    map: makeMap(),
    buriedItems: new Map<string, ItemType>(),
    groundItems: new Map<string, ItemType>(),
    ...over,
  };
}

describe('activatePowerup — shovel', () => {
  it('activating shovel from buff=0 sets buff to FASTER_SHOVEL_TICKS, clears slot, emits powerup_activate', () => {
    const ctx = makeCtx({ player: makePlayer({ heldPowerup: 'shovel' }) });
    const res = activatePowerup(ctx);
    expect(res.player.fasterShovelTicksRemaining).toBe(FASTER_SHOVEL_TICKS);
    expect(res.player.heldPowerup).toBeNull();
    expect(res.publicEvents).toContainEqual({
      type: 'powerup_activate',
      playerId: 'p1',
      powerup: 'shovel',
    });
    expect(res.privateEvents).toEqual([]);
    expect(res.cellsChanged).toEqual([]);
  });

  it('activating shovel while buff > 0 is a no-op (slot stays full, no events)', () => {
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'shovel', fasterShovelTicksRemaining: 200 }),
    });
    const res = activatePowerup(ctx);
    expect(res.player.heldPowerup).toBe('shovel');
    expect(res.player.fasterShovelTicksRemaining).toBe(200);
    expect(res.publicEvents).toEqual([]);
    expect(res.privateEvents).toEqual([]);
  });

  it('FASTER_SHOVEL_TICKS equals 450', () => {
    expect(FASTER_SHOVEL_TICKS).toBe(450);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @treasure-hunt/game test -t 'activatePowerup'`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `activationSystem.ts` with the shovel branch**

```ts
// services/game/src/match/activationSystem.ts
import type { CellChange, ItemType, MatchEvent } from '@treasure-hunt/protocol';
import type { MapGrid } from '../map/types.js';
import type { PlayerState } from '../physics/movement.js';

export const FASTER_SHOVEL_TICKS = 450; // 15 s × 30 Hz
export const BOMB_RADIUS = 1;

export interface ActivationContext {
  player: PlayerState;
  map: MapGrid;
  buriedItems: Map<string, ItemType>;
  groundItems: Map<string, ItemType>;
}

export interface ActivationResult {
  player: PlayerState;
  cellsChanged: CellChange[];
  publicEvents: MatchEvent[];
  privateEvents: MatchEvent[];
}

function noOp(player: PlayerState): ActivationResult {
  return { player, cellsChanged: [], publicEvents: [], privateEvents: [] };
}

export function activatePowerup(ctx: ActivationContext): ActivationResult {
  const { player } = ctx;
  if (player.heldPowerup === null) return noOp(player);

  if (player.heldPowerup === 'shovel') {
    if (player.fasterShovelTicksRemaining > 0) return noOp(player);
    return {
      player: {
        ...player,
        heldPowerup: null,
        fasterShovelTicksRemaining: FASTER_SHOVEL_TICKS,
      },
      cellsChanged: [],
      publicEvents: [{ type: 'powerup_activate', playerId: player.id, powerup: 'shovel' }],
      privateEvents: [],
    };
  }

  // compass and bomb branches added in later tasks
  return noOp(player);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @treasure-hunt/game test -t 'activatePowerup — shovel'` and `... -t 'FASTER_SHOVEL_TICKS equals 450'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/game/src/match/activationSystem.ts services/game/test/match/activationSystem.test.ts
git commit -m "feat(game): activationSystem module with shovel branch"
```

---

### Task 6: Wire `activate` intent in GameMatch (two-pass drain)

**Files:**
- Modify: `services/game/src/match/GameMatch.ts`
- Test: `services/game/test/match/GameMatch.test.ts`

Refactor the per-player intent drain to a two-pass: first pick up activate intents (collapse to a flag), resolve activation, then process move/stop/dig in queue order. Merge `cellsChanged` and `publicEvents` into the per-tick lists; stash `privateEvents` for routing in a later task.

- [ ] **Step 1: Write the failing tests**

Add to `services/game/test/match/GameMatch.test.ts`:

```ts
describe('GameMatch activation', () => {
  it('queueIntent activate with held shovel sets buff and clears slot in next diff', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', { ...alice, heldPowerup: 'shovel', fasterShovelTicksRemaining: 0 });

    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.heldPowerup).toBeNull();
      // buff is set to 450 in activation, then decremented once before diff is built → 449
      expect(player?.buffs.fasterShovelTicksRemaining).toBe(449);
      expect(diff.diff.events).toContainEqual({
        type: 'powerup_activate',
        playerId: 'alice',
        powerup: 'shovel',
      });
    }
  });

  it('activate intent with empty slot is a no-op', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.buffs.fasterShovelTicksRemaining).toBe(0);
      expect(diff.diff.events.find((e) => e.type === 'powerup_activate')).toBeUndefined();
    }
  });

  it('multiple activate intents in one tick collapse to a single activation', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', { ...alice, heldPowerup: 'shovel' });

    match.queueIntent('alice', { type: 'activate' });
    match.queueIntent('alice', { type: 'activate' });
    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    if (diff?.type === 'player_diff') {
      const activates = diff.diff.events.filter((e) => e.type === 'powerup_activate');
      expect(activates).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @treasure-hunt/game test -t 'GameMatch activation'`
Expected: FAIL — `activate` intents are dropped silently.

- [ ] **Step 3: Two-pass intent drain + activation invocation**

In `services/game/src/match/GameMatch.ts`, add the import:

```ts
import { activatePowerup } from './activationSystem.js';
```

Replace the per-player intent drain (the `for (const intent of queue)` block inside `tickOnce`) with this two-pass version. The surrounding context (`const queue = ...`, `let state = player`, completion handling) stays as is:

```ts
// Pass 1: detect activate intents
let activateRequested = false;
for (const intent of queue) {
  if (intent.type === 'activate') activateRequested = true;
}

// Resolve activation before any other intent processing
if (activateRequested && state.heldPowerup !== null) {
  const result = activatePowerup({
    player: state,
    map: this.map,
    buriedItems: this.buriedItems,
    groundItems: this.groundItems,
  });
  state = result.player;
  cellsChanged.push(...result.cellsChanged);
  events.push(...result.publicEvents);
  // privateEvents handled in Task 9
}

// Pass 2: process move/stop/dig in queue order
for (const intent of queue) {
  if (intent.type === 'move') {
    state = { ...state, moveDir: intent.dir, facing: intent.dir };
  } else if (intent.type === 'stop') {
    state = { ...state, moveDir: null };
  } else if (intent.type === 'dig') {
    state = startDig(state, this.map);
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @treasure-hunt/game test -t 'GameMatch activation'`
Expected: PASS (all three).

- [ ] **Step 5: Run the full game suite to ensure nothing else regressed**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/game/src/match/GameMatch.ts services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): wire activate intent through activationSystem with two-pass drain"
```

---

### Task 7: Compass branch in activationSystem + private event routing

**Files:**
- Modify: `services/game/src/match/activationSystem.ts`
- Modify: `services/game/src/match/GameMatch.ts`
- Test: `services/game/test/match/activationSystem.test.ts`
- Test: `services/game/test/match/GameMatch.test.ts`

Implement the compass: nearest buried item by Euclidean distance with `(x,y)` lexicographic tiebreak. If treasure → `kind: 'direction'` with `Math.atan2(ty - py, tx - px)`. If nugget/powerup → `kind: 'exact'`. If no buried items → `kind: 'no_target'`. The result lands in `privateEvents` and is routed only to the activator's diff.

- [ ] **Step 1: Write the failing activationSystem tests**

Append to `services/game/test/match/activationSystem.test.ts`:

```ts
describe('activatePowerup — compass', () => {
  it('emits direction result when treasure is the only buried item', () => {
    const buried = new Map<string, ItemType>([['4,4', 'treasure']]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'compass', x: 0.5, y: 0.5 }),
      buriedItems: buried,
    });
    const res = activatePowerup(ctx);
    expect(res.player.heldPowerup).toBeNull();
    expect(res.publicEvents).toContainEqual({
      type: 'powerup_activate', playerId: 'p1', powerup: 'compass',
    });
    expect(res.privateEvents).toHaveLength(1);
    const ev = res.privateEvents[0];
    expect(ev.type).toBe('compass_result');
    if (ev.type === 'compass_result') {
      expect(ev.playerId).toBe('p1');
      expect(ev.result.kind).toBe('direction');
      if (ev.result.kind === 'direction') {
        // angle from (0.5, 0.5) to (4, 4) ≈ atan2(3.5, 3.5) = π/4
        expect(ev.result.angleRad).toBeCloseTo(Math.PI / 4, 6);
      }
    }
  });

  it('emits exact result when a nugget is closer than the treasure', () => {
    const buried = new Map<string, ItemType>([
      ['10,10', 'treasure'],
      ['3,2', 'nugget'],
    ]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'compass', x: 2.5, y: 2.5 }),
      buriedItems: buried,
    });
    const res = activatePowerup(ctx);
    const ev = res.privateEvents[0];
    if (ev?.type === 'compass_result' && ev.result.kind === 'exact') {
      expect(ev.result.x).toBe(3);
      expect(ev.result.y).toBe(2);
      expect(ev.result.itemType).toBe('nugget');
    } else {
      throw new Error('expected exact compass result');
    }
  });

  it('emits exact result when a powerup is closer than the treasure', () => {
    const buried = new Map<string, ItemType>([
      ['10,10', 'treasure'],
      ['3,3', 'bomb'],
    ]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'compass', x: 2.5, y: 2.5 }),
      buriedItems: buried,
    });
    const res = activatePowerup(ctx);
    const ev = res.privateEvents[0];
    if (ev?.type === 'compass_result' && ev.result.kind === 'exact') {
      expect(ev.result.itemType).toBe('bomb');
    } else {
      throw new Error('expected exact compass result');
    }
  });

  it('breaks ties deterministically by lowest x then lowest y', () => {
    const buried = new Map<string, ItemType>([
      ['5,3', 'nugget'], // distance from (3,3): 2
      ['3,5', 'nugget'], // distance from (3,3): 2
      ['1,3', 'nugget'], // distance from (3,3): 2
    ]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'compass', x: 3, y: 3 }),
      buriedItems: buried,
    });
    const res = activatePowerup(ctx);
    const ev = res.privateEvents[0];
    if (ev?.type === 'compass_result' && ev.result.kind === 'exact') {
      expect(ev.result.x).toBe(1);
      expect(ev.result.y).toBe(3);
    } else {
      throw new Error('expected exact compass result');
    }
  });

  it('emits no_target when buriedItems is empty', () => {
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'compass' }),
      buriedItems: new Map(),
    });
    const res = activatePowerup(ctx);
    const ev = res.privateEvents[0];
    expect(ev?.type).toBe('compass_result');
    if (ev?.type === 'compass_result') {
      expect(ev.result.kind).toBe('no_target');
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/game test -t 'activatePowerup — compass'`
Expected: FAIL — compass branch is currently a no-op.

- [ ] **Step 3: Implement the compass branch**

In `services/game/src/match/activationSystem.ts`, add this helper above `activatePowerup`:

```ts
function findNearestBuriedItem(
  px: number,
  py: number,
  buried: Map<string, ItemType>,
): { x: number; y: number; itemType: ItemType } | null {
  let best: { x: number; y: number; itemType: ItemType; d2: number } | null = null;
  for (const [key, itemType] of buried) {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    const dx = x - px;
    const dy = y - py;
    const d2 = dx * dx + dy * dy;
    if (
      best === null ||
      d2 < best.d2 ||
      (d2 === best.d2 && (x < best.x || (x === best.x && y < best.y)))
    ) {
      best = { x, y, itemType, d2 };
    }
  }
  return best ? { x: best.x, y: best.y, itemType: best.itemType } : null;
}
```

Then add a `compass` branch in `activatePowerup`, immediately after the `shovel` block and before the trailing `return noOp(player);`:

```ts
if (player.heldPowerup === 'compass') {
  const nearest = findNearestBuriedItem(player.x, player.y, ctx.buriedItems);
  let result: import('@treasure-hunt/protocol').CompassResult;
  if (nearest === null) {
    result = { kind: 'no_target' };
  } else if (nearest.itemType === 'treasure') {
    const angleRad = Math.atan2(nearest.y - player.y, nearest.x - player.x);
    result = { kind: 'direction', angleRad };
  } else {
    result = { kind: 'exact', x: nearest.x, y: nearest.y, itemType: nearest.itemType };
  }
  return {
    player: { ...player, heldPowerup: null },
    cellsChanged: [],
    publicEvents: [{ type: 'powerup_activate', playerId: player.id, powerup: 'compass' }],
    privateEvents: [{ type: 'compass_result', playerId: player.id, result }],
  };
}
```

- [ ] **Step 4: Run the activationSystem compass tests**

Run: `pnpm --filter @treasure-hunt/game test -t 'activatePowerup — compass'`
Expected: PASS (all five).

- [ ] **Step 5: Write the failing GameMatch routing test**

Append to the `describe('GameMatch activation', ...)` block in `services/game/test/match/GameMatch.test.ts`:

```ts
it('compass_result event flows only to the activator diff', () => {
  const { match, emitted } = makeTwoPlayerMatch();
  const alice = match['players'].get('alice')!;
  match['players'].set('alice', { ...alice, heldPowerup: 'compass' });

  match.queueIntent('alice', { type: 'activate' });
  match.tickOnce();

  const aliceDiff = emitted.find(
    (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
  );
  const bobDiff = emitted.find(
    (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'bob',
  );
  if (aliceDiff?.type !== 'player_diff' || bobDiff?.type !== 'player_diff') {
    throw new Error('missing diffs');
  }
  expect(aliceDiff.diff.events.some((e) => e.type === 'compass_result')).toBe(true);
  expect(bobDiff.diff.events.some((e) => e.type === 'compass_result')).toBe(false);
  // public event still in both
  expect(aliceDiff.diff.events.some((e) => e.type === 'powerup_activate')).toBe(true);
  expect(bobDiff.diff.events.some((e) => e.type === 'powerup_activate')).toBe(true);
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/game test -t 'compass_result event flows only'`
Expected: FAIL — `privateEvents` aren't routed yet.

- [ ] **Step 7: Add private event routing in GameMatch**

In `services/game/src/match/GameMatch.ts`, declare a private-events accumulator at the top of `tickOnce`, alongside `cellsChanged` and `events`:

```ts
const privateEvents = new Map<string, MatchEvent[]>();
```

Update the `MatchEvent` import at the top of the file to include both `MatchEvent` and the existing types (it should already be there — check line 4 of the imports).

In the activation invocation block (added in Task 6), append after `events.push(...result.publicEvents);`:

```ts
if (result.privateEvents.length > 0) {
  const existing = privateEvents.get(playerId) ?? [];
  existing.push(...result.privateEvents);
  privateEvents.set(playerId, existing);
}
```

In the per-player diff loop (the second `for (const [playerId, player] of this.players)`), replace the `events` field of the constructed diff:

```ts
const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
  type: 'state_diff',
  tick: this.tick,
  cellsChanged,
  players,
  detector,
  events: [...events, ...(privateEvents.get(playerId) ?? [])],
  groundItems: groundItemsArray,
};
```

- [ ] **Step 8: Run the test and confirm it passes**

Run: `pnpm --filter @treasure-hunt/game test -t 'compass_result event flows only'`
Expected: PASS.

- [ ] **Step 9: Run the full game suite**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add services/game/src/match/activationSystem.ts services/game/src/match/GameMatch.ts services/game/test/match/activationSystem.test.ts services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): compass activation with private event routing"
```

---

### Task 8: Bomb branch in activationSystem

**Files:**
- Modify: `services/game/src/match/activationSystem.ts`
- Test: `services/game/test/match/activationSystem.test.ts`

Implements the 3×3 detonation: rock cells flip walkable, items inside resolve per type (nugget auto-collect, powerup slot rule, treasure → ground item, no `match_end`). Off-map cells are skipped; already-walkable cells are no-ops; `bomb_detonate` always emits.

- [ ] **Step 1: Write the failing tests**

Append to `services/game/test/match/activationSystem.test.ts`:

```ts
describe('activatePowerup — bomb', () => {
  it('flips up to 9 rock cells in front of player to walkable, emits bomb_detonate', () => {
    const map = makeMap(7, 7);
    // player at (2,2) facing E → bomb center (3,2), 3x3 spans (2..4, 1..3)
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 2.5, y: 2.5, facing: 'E' }),
      map,
    });
    const res = activatePowerup(ctx);
    expect(res.player.heldPowerup).toBeNull();
    expect(res.cellsChanged).toHaveLength(9);
    for (const cc of res.cellsChanged) {
      expect(cc.cellType).toBe('walkable');
      expect(map.cells[cc.y]![cc.x]).toBe('walkable');
    }
    expect(res.publicEvents).toContainEqual({
      type: 'powerup_activate', playerId: 'p1', powerup: 'bomb',
    });
    const detonate = res.publicEvents.find((e) => e.type === 'bomb_detonate');
    expect(detonate).toBeDefined();
    if (detonate?.type === 'bomb_detonate') {
      expect(detonate.cells).toHaveLength(9);
    }
  });

  it('auto-collects nuggets in the radius and emits pickup', () => {
    const map = makeMap(7, 7);
    const buried = new Map<string, ItemType>([['3,2', 'nugget']]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 2.5, y: 2.5, facing: 'E' }),
      map,
      buriedItems: buried,
    });
    const res = activatePowerup(ctx);
    expect(res.player.score).toBe(10);
    expect(buried.has('3,2')).toBe(false);
    expect(res.publicEvents).toContainEqual({
      type: 'pickup', playerId: 'p1', itemType: 'nugget',
    });
  });

  it('puts a buried powerup into an empty slot and emits pickup', () => {
    const map = makeMap(7, 7);
    const buried = new Map<string, ItemType>([['3,2', 'compass']]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 2.5, y: 2.5, facing: 'E' }),
      map,
      buriedItems: buried,
    });
    const res = activatePowerup(ctx);
    expect(res.player.heldPowerup).toBe('compass');
    expect(buried.has('3,2')).toBe(false);
    expect(res.publicEvents.some((e) => e.type === 'pickup' && e.itemType === 'compass')).toBe(true);
  });

  it('drops a buried powerup to groundItems when slot is full (slot becomes null after activation)', () => {
    // After activation the bomb slot is cleared, so "full slot at the moment of impact" means
    // the slot was full BEFORE bomb resolved. Bomb clears its own slot first, so a single bomb
    // never finds a full slot. Use a non-bomb held powerup instead by putting the player into
    // the bomb branch directly: held = 'bomb', and a SECOND powerup buried in radius — slot is
    // empty by then (Bomb was just consumed). To test "slot full" you must seed a non-bomb second
    // pickup. Easier: seed a second buried powerup in the same blast.
    const map = makeMap(7, 7);
    const buried = new Map<string, ItemType>([
      ['3,2', 'compass'],   // first picked up → into slot
      ['4,2', 'shovel'],    // second → slot full → ground
    ]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 2.5, y: 2.5, facing: 'E' }),
      map,
      buriedItems: buried,
    });
    const ground = ctx.groundItems;
    const res = activatePowerup(ctx);
    expect(res.player.heldPowerup).toBe('compass');
    expect(ground.get('4,2')).toBe('shovel');
  });

  it('exposes treasure as a ground item without ending the match', () => {
    const map = makeMap(7, 7);
    const buried = new Map<string, ItemType>([['3,2', 'treasure']]);
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 2.5, y: 2.5, facing: 'E' }),
      map,
      buriedItems: buried,
    });
    const ground = ctx.groundItems;
    const res = activatePowerup(ctx);
    expect(buried.has('3,2')).toBe(false);
    expect(ground.get('3,2')).toBe('treasure');
    expect(res.publicEvents.some((e) => e.type === 'match_end')).toBe(false);
  });

  it('silently skips off-map cells when bombing the edge', () => {
    const map = makeMap(5, 5);
    // player at (3.5, 3.5) facing E → bomb center (4, 3) → 3x3 spans (3..5, 2..4); x=5 is off-map
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 3.5, y: 3.5, facing: 'E' }),
      map,
    });
    const res = activatePowerup(ctx);
    expect(res.cellsChanged).toHaveLength(6); // (3,2),(3,3),(3,4),(4,2),(4,3),(4,4)
    for (const cc of res.cellsChanged) {
      expect(cc.x).toBeLessThan(5);
      expect(cc.y).toBeLessThan(5);
    }
  });

  it('on already-walkable area: no cellsChanged, no item changes, but bomb_detonate emits', () => {
    const map = makeMap(7, 7);
    // mark the 3x3 in front as walkable
    for (let y = 1; y <= 3; y++) {
      for (let x = 2; x <= 4; x++) map.cells[y]![x] = 'walkable';
    }
    const ctx = makeCtx({
      player: makePlayer({ heldPowerup: 'bomb', x: 2.5, y: 2.5, facing: 'E' }),
      map,
    });
    const res = activatePowerup(ctx);
    expect(res.cellsChanged).toEqual([]);
    expect(res.publicEvents.some((e) => e.type === 'bomb_detonate')).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/game test -t 'activatePowerup — bomb'`
Expected: FAIL — bomb branch is currently a no-op.

- [ ] **Step 3: Implement the bomb branch**

In `services/game/src/match/activationSystem.ts`, add this helper above `activatePowerup`:

```ts
import { facingVec } from '../physics/movement.js';

function bombCenter(player: PlayerState): { x: number; y: number } {
  const { dx, dy } = facingVec(player.facing);
  return { x: Math.floor(player.x) + dx, y: Math.floor(player.y) + dy };
}
```

Add a `bomb` branch in `activatePowerup`, immediately after the `compass` block and before `return noOp(player);`:

```ts
if (player.heldPowerup === 'bomb') {
  const center = bombCenter(player);
  const cellsChanged: CellChange[] = [];
  const publicEvents: MatchEvent[] = [
    { type: 'powerup_activate', playerId: player.id, powerup: 'bomb' },
  ];
  let workingPlayer: PlayerState = { ...player, heldPowerup: null };

  for (let dy = -BOMB_RADIUS; dy <= BOMB_RADIUS; dy++) {
    for (let dx = -BOMB_RADIUS; dx <= BOMB_RADIUS; dx++) {
      const cx = center.x + dx;
      const cy = center.y + dy;
      if (cx < 0 || cy < 0 || cx >= ctx.map.width || cy >= ctx.map.height) continue;
      if (ctx.map.cells[cy]![cx] !== 'rock') continue;

      ctx.map.cells[cy]![cx] = 'walkable';
      cellsChanged.push({ x: cx, y: cy, cellType: 'walkable' });

      const key = `${cx},${cy}`;
      const buried = ctx.buriedItems.get(key);
      if (buried !== undefined) {
        ctx.buriedItems.delete(key);
        if (buried === 'nugget') {
          workingPlayer = { ...workingPlayer, score: workingPlayer.score + 10 };
          publicEvents.push({ type: 'pickup', playerId: player.id, itemType: 'nugget' });
        } else if (buried === 'treasure') {
          ctx.groundItems.set(key, 'treasure');
        } else {
          // shovel | compass | bomb
          if (workingPlayer.heldPowerup === null) {
            workingPlayer = { ...workingPlayer, heldPowerup: buried };
            publicEvents.push({ type: 'pickup', playerId: player.id, itemType: buried });
          } else {
            ctx.groundItems.set(key, buried);
          }
        }
      }
    }
  }

  publicEvents.push({
    type: 'bomb_detonate',
    playerId: player.id,
    cells: cellsChanged.map((cc) => ({ x: cc.x, y: cc.y })),
  });

  return { player: workingPlayer, cellsChanged, publicEvents, privateEvents: [] };
}
```

You will also need to add `CellChange` to the type imports at the top of `activationSystem.ts` if not already present.

- [ ] **Step 4: Run the bomb tests**

Run: `pnpm --filter @treasure-hunt/game test -t 'activatePowerup — bomb'`
Expected: PASS (all seven).

- [ ] **Step 5: Run the full game suite**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/game/src/match/activationSystem.ts services/game/test/match/activationSystem.test.ts
git commit -m "feat(game): bomb activation with 3x3 detonation and item resolution"
```

---

### Task 9: Treasure ground pickup ends the match

**Files:**
- Modify: `services/game/src/match/GameMatch.ts`
- Test: `services/game/test/match/GameMatch.test.ts`

Walking onto a `groundItems` cell holding `treasure` triggers a pickup, awards 100 points, emits `match_end`, and freezes the match.

- [ ] **Step 1: Write the failing test**

Append to the `describe('GameMatch item pickups', ...)` block in `services/game/test/match/GameMatch.test.ts`:

```ts
it('walking over a treasure ground item ends the match', () => {
  const { match, emitted } = makeTwoPlayerMatch();
  const alice = match['players'].get('alice')!;
  const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
  match['groundItems'].set(groundKey, 'treasure');

  match.tickOnce();

  const diff = [...emitted].reverse().find(
    (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
  );
  expect(diff?.type).toBe('player_diff');
  if (diff?.type === 'player_diff') {
    const player = diff.diff.players.find((p) => p.id === 'alice');
    expect(player?.score).toBe(100);
    expect(diff.diff.events).toContainEqual({
      type: 'pickup', playerId: 'alice', itemType: 'treasure',
    });
    expect(diff.diff.events.some((e) => e.type === 'match_end' && e.winnerId === 'alice')).toBe(true);
  }
  expect(match['groundItems'].has(groundKey)).toBe(false);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @treasure-hunt/game test -t 'walking over a treasure ground item'`
Expected: FAIL — current ground pickup ignores treasure.

- [ ] **Step 3: Extend the ground pickup branch**

In `services/game/src/match/GameMatch.ts`, replace the ground pickup block in `tickOnce` (it currently handles nugget and powerup):

```ts
// Ground pickup
const groundKey = `${Math.floor(state.x)},${Math.floor(state.y)}`;
const groundItem = this.groundItems.get(groundKey);
if (groundItem !== undefined) {
  if (groundItem === 'nugget') {
    state = { ...state, score: state.score + 10 };
    this.groundItems.delete(groundKey);
    events.push({ type: 'pickup', playerId, itemType: 'nugget' });
  } else if (groundItem === 'treasure') {
    state = { ...state, score: state.score + 100 };
    this.groundItems.delete(groundKey);
    events.push({ type: 'pickup', playerId, itemType: 'treasure' });
    events.push({
      type: 'match_end',
      winnerId: playerId,
      scores: { [playerId]: state.score },
    });
    this.ended = true;
  } else if (state.heldPowerup === null) {
    // groundItem is shovel | compass | bomb and slot empty
    state = { ...state, heldPowerup: groundItem };
    this.groundItems.delete(groundKey);
    events.push({ type: 'pickup', playerId, itemType: groundItem });
  }
  // else: full slot — leave item in groundItems
}
```

(This restructures the `isPowerup` check into a simple `else if` since after `nugget` and `treasure` the only remaining `ItemType` values are powerups. The `isPowerup` helper at the top of the file is no longer used by this block, but it remains used elsewhere — leave it alone.)

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm --filter @treasure-hunt/game test -t 'walking over a treasure ground item'`
Expected: PASS.

- [ ] **Step 5: Run the full game suite**

Run: `pnpm --filter @treasure-hunt/game test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/game/src/match/GameMatch.ts services/game/test/match/GameMatch.test.ts
git commit -m "feat(game): treasure ground item ends match on walk-over"
```

---

### Task 10: Frontend store — buffs and compassResult

**Files:**
- Modify: `web/src/state/gameStore.ts`
- Test: `web/test/state/gameStore.test.ts`

Adds `buffs` and `compassResult` to `GameState`, populates them in `applyDiff`, and exposes an `expireCompassResult` action. Existing fields are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('gameStore', ...)` block in `web/test/state/gameStore.test.ts`:

```ts
it('reads buffs from own PlayerSnapshot', () => {
  initFromServerMsg(initMsg);

  const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
    type: 'state_diff',
    tick: 7,
    cellsChanged: [],
    players: [{
      id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0,
      heldPowerup: null, buffs: { fasterShovelTicksRemaining: 250 },
    }],
    detector: 0,
    events: [],
    groundItems: [],
  };
  applyDiff(diff, 'alice');

  expect(useGameStore.getState().buffs).toEqual({ fasterShovelTicksRemaining: 250 });
});

it('sets compassResult with expiresAtMs on compass_result kind:exact for me', () => {
  initFromServerMsg(initMsg);
  const before = Date.now();

  const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
    type: 'state_diff',
    tick: 8,
    cellsChanged: [],
    players: [{
      id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0,
      heldPowerup: null, buffs: { fasterShovelTicksRemaining: 0 },
    }],
    detector: 0,
    events: [{
      type: 'compass_result',
      playerId: 'alice',
      result: { kind: 'exact', x: 7, y: 8, itemType: 'nugget' },
    }],
    groundItems: [],
  };
  applyDiff(diff, 'alice');

  const cr = useGameStore.getState().compassResult;
  expect(cr).not.toBeNull();
  if (cr && cr.kind === 'exact') {
    expect(cr.x).toBe(7);
    expect(cr.y).toBe(8);
    expect(cr.itemType).toBe('nugget');
    expect(cr.expiresAtMs).toBeGreaterThanOrEqual(before + 5000);
    expect(cr.expiresAtMs).toBeLessThanOrEqual(Date.now() + 5000);
  }
});

it('sets compassResult on compass_result kind:direction for me', () => {
  initFromServerMsg(initMsg);

  const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
    type: 'state_diff',
    tick: 9,
    cellsChanged: [],
    players: [{
      id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0,
      heldPowerup: null, buffs: { fasterShovelTicksRemaining: 0 },
    }],
    detector: 0,
    events: [{
      type: 'compass_result',
      playerId: 'alice',
      result: { kind: 'direction', angleRad: 0.7853981633974483 },
    }],
    groundItems: [],
  };
  applyDiff(diff, 'alice');

  const cr = useGameStore.getState().compassResult;
  expect(cr?.kind).toBe('direction');
  if (cr && cr.kind === 'direction') {
    expect(cr.angleRad).toBeCloseTo(Math.PI / 4, 6);
  }
});

it('does not set compassResult on kind:no_target', () => {
  initFromServerMsg(initMsg);

  const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
    type: 'state_diff',
    tick: 10,
    cellsChanged: [],
    players: [{
      id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0,
      heldPowerup: null, buffs: { fasterShovelTicksRemaining: 0 },
    }],
    detector: 0,
    events: [{
      type: 'compass_result',
      playerId: 'alice',
      result: { kind: 'no_target' },
    }],
    groundItems: [],
  };
  applyDiff(diff, 'alice');

  expect(useGameStore.getState().compassResult).toBeNull();
});

it('ignores compass_result for the other player', () => {
  initFromServerMsg(initMsg);

  const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
    type: 'state_diff',
    tick: 11,
    cellsChanged: [],
    players: [{
      id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0,
      heldPowerup: null, buffs: { fasterShovelTicksRemaining: 0 },
    }],
    detector: 0,
    events: [{
      type: 'compass_result',
      playerId: 'bob',
      result: { kind: 'exact', x: 1, y: 1, itemType: 'nugget' },
    }],
    groundItems: [],
  };
  applyDiff(diff, 'alice');

  expect(useGameStore.getState().compassResult).toBeNull();
});

it('expireCompassResult clears the field', () => {
  initFromServerMsg(initMsg);
  useGameStore.setState({
    compassResult: {
      kind: 'direction',
      angleRad: 0,
      expiresAtMs: Date.now() + 5000,
    },
  });
  expireCompassResult();
  expect(useGameStore.getState().compassResult).toBeNull();
});
```

Add `expireCompassResult` to the imports:

```ts
import { useGameStore, initFromServerMsg, applyDiff, expireCompassResult } from '../../src/state/gameStore.js';
```

Also update the `beforeEach` reset to seed the new fields. Replace the existing `useGameStore.setState({ ... })` block in `beforeEach` with:

```ts
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
  buffs: { fasterShovelTicksRemaining: 0 },
  compassResult: null,
});
```

Also: every existing player snapshot in this file has `heldPowerup` but no `buffs`. Add `buffs: { fasterShovelTicksRemaining: 0 }` to each existing inline `players: [{ ... }]` literal in the existing tests. There are five such literals — search the file for `digProgress: -1, score:` and add the buffs field to each.

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/web test -t 'gameStore'`
Expected: FAIL — buffs/compassResult/expireCompassResult don't exist yet.

- [ ] **Step 3: Update the store**

In `web/src/state/gameStore.ts`, replace the file contents:

```ts
import { create } from 'zustand';
import type {
  CellType,
  ServerMessage,
  PlayerSnapshot,
  ItemType,
  PlayerBuffs,
} from '@treasure-hunt/protocol';

interface CompassResultExact {
  kind: 'exact';
  x: number;
  y: number;
  itemType: ItemType;
  expiresAtMs: number;
}
interface CompassResultDirection {
  kind: 'direction';
  angleRad: number;
  expiresAtMs: number;
}
type StoredCompassResult = CompassResultExact | CompassResultDirection;

interface GameState {
  matchId: string | null;
  playerId: string | null;
  mapWidth: number;
  mapHeight: number;
  cells: Map<string, CellType>;
  players: PlayerSnapshot[];
  detector: number;
  score: number;
  matchEnded: boolean;
  winnerId: string | null;
  groundItems: Array<{ x: number; y: number; item: ItemType }>;
  heldPowerup: PlayerSnapshot['heldPowerup'];
  buffs: PlayerBuffs;
  compassResult: StoredCompassResult | null;
}

const COMPASS_DISPLAY_MS = 5000;

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
  buffs: { fasterShovelTicksRemaining: 0 },
  compassResult: null,
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
    buffs: { fasterShovelTicksRemaining: 0 },
    compassResult: null,
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
    let compassResult = prev.compassResult;

    const myPlayer = diff.players.find((p: PlayerSnapshot) => p.id === myPlayerId);
    const score = myPlayer?.score ?? prev.score;
    const heldPowerup = myPlayer ? myPlayer.heldPowerup : prev.heldPowerup;
    const buffs = myPlayer ? myPlayer.buffs : prev.buffs;

    for (const event of diff.events) {
      if (event.type === 'match_end') {
        matchEnded = true;
        winnerId = event.winnerId;
      } else if (event.type === 'compass_result' && event.playerId === myPlayerId) {
        if (event.result.kind === 'exact') {
          compassResult = {
            kind: 'exact',
            x: event.result.x,
            y: event.result.y,
            itemType: event.result.itemType,
            expiresAtMs: Date.now() + COMPASS_DISPLAY_MS,
          };
        } else if (event.result.kind === 'direction') {
          compassResult = {
            kind: 'direction',
            angleRad: event.result.angleRad,
            expiresAtMs: Date.now() + COMPASS_DISPLAY_MS,
          };
        }
        // kind: 'no_target' — leave compassResult unchanged
      }
    }

    return {
      cells,
      players: diff.players,
      detector: diff.detector,
      score,
      matchEnded,
      winnerId,
      groundItems: diff.groundItems ?? prev.groundItems,
      heldPowerup,
      buffs,
      compassResult,
    };
  });
}

export function expireCompassResult(): void {
  useGameStore.setState({ compassResult: null });
}
```

- [ ] **Step 4: Run the store tests and confirm they pass**

Run: `pnpm --filter @treasure-hunt/web test -t 'gameStore'`
Expected: PASS.

- [ ] **Step 5: Run the full web suite**

Run: `pnpm --filter @treasure-hunt/web test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/state/gameStore.ts web/test/state/gameStore.test.ts
git commit -m "feat(web): store carries buffs and compassResult, applyDiff reads compass_result events"
```

---

### Task 11: Spacebar input + Match wires `onActivate`

**Files:**
- Modify: `web/src/hooks/useInput.ts`
- Modify: `web/src/screens/Match.tsx`
- Test: `web/test/hooks/useInput.test.ts`

Spacebar → one-shot `onActivate` callback. `Match.tsx` sends `{ type: 'activate' }` on the wire.

- [ ] **Step 1: Write the failing test**

Append to `web/test/hooks/useInput.test.ts`:

```ts
it('calls onActivate once on Space keydown', () => {
  const onMove = vi.fn();
  const onStop = vi.fn();
  const onDig = vi.fn();
  const onActivate = vi.fn();
  renderHook(() => useInput({ onMove, onStop, onDig, onActivate }));

  fireEvent.keyDown(window, { key: ' ' });
  expect(onActivate).toHaveBeenCalledTimes(1);
});

it('does not call onActivate on Space repeat', () => {
  const onMove = vi.fn();
  const onStop = vi.fn();
  const onDig = vi.fn();
  const onActivate = vi.fn();
  renderHook(() => useInput({ onMove, onStop, onDig, onActivate }));

  fireEvent.keyDown(window, { key: ' ', repeat: true });
  expect(onActivate).not.toHaveBeenCalled();
});
```

If the test file does not already import `vi` and `fireEvent`/`renderHook`, ensure these imports exist near the top:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useInput } from '../../src/hooks/useInput.js';
```

(Adjust to match the existing pattern in the file — do not duplicate imports.)

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/web test -t 'onActivate'`
Expected: FAIL — `useInput` does not accept `onActivate`.

- [ ] **Step 3: Add Spacebar to `useInput`**

Replace `web/src/hooks/useInput.ts` with:

```ts
import { useEffect, useRef } from 'react';
import type { Facing } from '@treasure-hunt/protocol';

interface UseInputCallbacks {
  onMove: (dir: Facing) => void;
  onStop: () => void;
  onDig: () => void;
  onActivate: () => void;
}

const KEY_TO_DIR: Record<string, Facing> = {
  ArrowUp: 'N', w: 'N', W: 'N',
  ArrowDown: 'S', s: 'S', S: 'S',
  ArrowLeft: 'W', a: 'W', A: 'W',
  ArrowRight: 'E', d: 'E', D: 'E',
};

const DIG_KEYS = new Set(['j', 'J']);
const ACTIVATE_KEYS = new Set([' ', 'Space', 'Spacebar']);

export function useInput({ onMove, onStop, onDig, onActivate }: UseInputCallbacks): void {
  const heldKey = useRef<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.repeat) return;

      if (ACTIVATE_KEYS.has(e.key)) {
        e.preventDefault();
        onActivate();
        return;
      }

      if (DIG_KEYS.has(e.key)) {
        e.preventDefault();
        onDig();
        return;
      }

      const dir = KEY_TO_DIR[e.key];
      if (dir) {
        e.preventDefault();
        heldKey.current = e.key;
        onMove(dir);
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      if (heldKey.current === e.key) {
        heldKey.current = null;
        onStop();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onMove, onStop, onDig, onActivate]);
}
```

- [ ] **Step 4: Wire `onActivate` in `Match.tsx`**

Replace the `onMove`/`onStop`/`onDig` block in `web/src/screens/Match.tsx` with:

```tsx
const onMove = useCallback(
  (dir: Facing) => sendIntent({ type: 'move', dir }),
  [],
);
const onStop = useCallback(() => sendIntent({ type: 'stop' }), []);
const onDig = useCallback(() => sendIntent({ type: 'dig' }), []);
const onActivate = useCallback(() => sendIntent({ type: 'activate' }), []);

useInput({ onMove, onStop, onDig, onActivate });
```

- [ ] **Step 5: Run the input tests and confirm they pass**

Run: `pnpm --filter @treasure-hunt/web test -t 'onActivate'`
Expected: PASS.

- [ ] **Step 6: Run the full web suite**

Run: `pnpm --filter @treasure-hunt/web test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/hooks/useInput.ts web/src/screens/Match.tsx web/test/hooks/useInput.test.ts
git commit -m "feat(web): Spacebar fires activate intent"
```

---

### Task 12: PowerupSlot disabled prop

**Files:**
- Modify: `web/src/hud/PowerupSlot.tsx`
- Test: `web/test/hud/PowerupSlot.test.tsx`

Adds an optional `disabled?: boolean` prop. When `true`, the component renders dimmed and appends "(active)" to the label. The Match screen passes `disabled` when the buff is running and the slot still holds a shovel — visualizing the "blocked re-activation" rule.

- [ ] **Step 1: Write the failing test**

Append to `web/test/hud/PowerupSlot.test.tsx`:

```ts
it('renders dimmed with "(active)" suffix when disabled and held shovel', () => {
  render(<PowerupSlot heldPowerup="shovel" disabled />);
  const label = screen.getByText(/SHOVEL/);
  expect(label.textContent).toContain('(active)');
  // dimmed: parent or self has opacity < 1
  const root = label.closest('div')!;
  const opacity = root.style.opacity;
  expect(parseFloat(opacity)).toBeLessThan(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/web test -t 'PowerupSlot' -t 'disabled'`
Expected: FAIL — prop doesn't exist.

- [ ] **Step 3: Add the prop**

Replace `web/src/hud/PowerupSlot.tsx`:

```tsx
interface Props {
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
  disabled?: boolean;
}

const POWERUP_COLORS: Record<'shovel' | 'compass' | 'bomb', string> = {
  shovel: '#88aaff',
  compass: '#88ffaa',
  bomb: '#ff8888',
};

export default function PowerupSlot({ heldPowerup, disabled = false }: Props) {
  const isEmpty = heldPowerup === null;
  const color = isEmpty ? undefined : POWERUP_COLORS[heldPowerup];
  const label = isEmpty ? '—' : `${heldPowerup.toUpperCase()}${disabled ? ' (active)' : ''}`;
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
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{ fontWeight: 'bold' }}>POWERUP:</span>
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Wire `disabled` from the store in `Match.tsx`**

In `web/src/screens/Match.tsx`, add a buffs selector and pass the flag:

```tsx
const buffs = useGameStore((s) => s.buffs);
// ...
<PowerupSlot
  heldPowerup={heldPowerup}
  disabled={heldPowerup === 'shovel' && buffs.fasterShovelTicksRemaining > 0}
/>
```

- [ ] **Step 5: Run the slot tests**

Run: `pnpm --filter @treasure-hunt/web test -t 'PowerupSlot'`
Expected: PASS (existing four + new one).

- [ ] **Step 6: Commit**

```bash
git add web/src/hud/PowerupSlot.tsx web/src/screens/Match.tsx web/test/hud/PowerupSlot.test.tsx
git commit -m "feat(web): PowerupSlot disabled state, wired to active Faster Shovel buff"
```

---

### Task 13: BuffBar component

**Files:**
- Create: `web/src/hud/BuffBar.tsx`
- Create: `web/test/hud/BuffBar.test.tsx`
- Modify: `web/src/screens/Match.tsx`

A small horizontal bar + label showing the remaining Faster Shovel buff seconds. Renders nothing when the buff is at 0.

- [ ] **Step 1: Write the failing tests**

Create `web/test/hud/BuffBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BuffBar from '../../src/hud/BuffBar.js';

describe('BuffBar', () => {
  it('renders nothing when fasterShovelTicksRemaining is 0', () => {
    const { container } = render(<BuffBar fasterShovelTicksRemaining={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "FASTER SHOVEL 15s" with full bar at 450 ticks', () => {
    render(<BuffBar fasterShovelTicksRemaining={450} />);
    expect(screen.getByText(/FASTER SHOVEL 15s/)).toBeInTheDocument();
    const fill = document.querySelector('[data-testid="buffbar-fill"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('100%');
  });

  it('renders "FASTER SHOVEL 1s" at 1 tick (ceil)', () => {
    render(<BuffBar fasterShovelTicksRemaining={1} />);
    expect(screen.getByText(/FASTER SHOVEL 1s/)).toBeInTheDocument();
  });

  it('renders "FASTER SHOVEL 5s" at 150 ticks', () => {
    render(<BuffBar fasterShovelTicksRemaining={150} />);
    expect(screen.getByText(/FASTER SHOVEL 5s/)).toBeInTheDocument();
    const fill = document.querySelector('[data-testid="buffbar-fill"]') as HTMLElement;
    // 150 / 450 = 33.33%
    expect(fill.style.width).toMatch(/^33\./);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @treasure-hunt/web test -t 'BuffBar'`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the component**

```tsx
// web/src/hud/BuffBar.tsx
interface Props {
  fasterShovelTicksRemaining: number;
}

const FASTER_SHOVEL_TICKS = 450;

export default function BuffBar({ fasterShovelTicksRemaining }: Props) {
  if (fasterShovelTicksRemaining <= 0) return null;
  const seconds = Math.ceil(fasterShovelTicksRemaining / 30);
  const widthPct = (fasterShovelTicksRemaining / FASTER_SHOVEL_TICKS) * 100;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.3rem 0.6rem',
        border: '2px solid #88aaff',
        borderRadius: '4px',
        background: '#88aaff22',
        color: '#eee',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
      }}
    >
      <span style={{ fontWeight: 'bold' }}>{`FASTER SHOVEL ${seconds}s`}</span>
      <div
        style={{
          flex: 1,
          height: '6px',
          background: '#222',
          borderRadius: '3px',
          overflow: 'hidden',
          minWidth: '60px',
        }}
      >
        <div
          data-testid="buffbar-fill"
          style={{
            width: `${widthPct}%`,
            height: '100%',
            background: '#88aaff',
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the BuffBar tests**

Run: `pnpm --filter @treasure-hunt/web test -t 'BuffBar'`
Expected: PASS.

- [ ] **Step 5: Wire `BuffBar` into `Match.tsx`**

In `web/src/screens/Match.tsx`, add the import:

```tsx
import BuffBar from '../hud/BuffBar.js';
```

And add it next to `PowerupSlot` in the same row. Replace the section:

```tsx
<div style={{ width: '640px' }}>
  <PowerupSlot heldPowerup={heldPowerup} />
</div>
```

with:

```tsx
<div style={{ width: '640px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
  <PowerupSlot
    heldPowerup={heldPowerup}
    disabled={heldPowerup === 'shovel' && buffs.fasterShovelTicksRemaining > 0}
  />
  <BuffBar fasterShovelTicksRemaining={buffs.fasterShovelTicksRemaining} />
</div>
```

- [ ] **Step 6: Run the full web suite**

Run: `pnpm --filter @treasure-hunt/web test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/hud/BuffBar.tsx web/src/screens/Match.tsx web/test/hud/BuffBar.test.tsx
git commit -m "feat(web): BuffBar component for Faster Shovel countdown"
```

---

### Task 14: Pixi compass marker rendering

**Files:**
- Modify: `web/src/pixi/renderers/MapRenderer.ts`
- Modify: `web/src/pixi/PixiCanvas.tsx`

Adds a `updateCompassMarker(result, playerSnapshot)` method on `MapRenderer` that draws either a pulsing ring on the target cell or a fixed-rotation arrow next to the local player's sprite. `PixiCanvas` subscribes to the store, calls the renderer, and clears expired results via a ticker.

This task has no unit tests — Pixi rendering is verified manually in the browser. The done criterion is the visual effect described in the spec.

The current `MapRenderer` (see file at this branch) uses module-level constant `CELL_SIZE = 16` and adds layered `Container` instances directly to `app.stage` in the constructor. Follow that pattern.

- [ ] **Step 1: Add the compass container and method to MapRenderer**

In `web/src/pixi/renderers/MapRenderer.ts`:

1. Add a private field and instantiate it in the constructor between the ground container and "player layer would go above"). The `MapRenderer` doesn't own the player container — `PlayerRenderer` does — so the new `compassContainer` is added to `app.stage` after `groundContainer`. `PlayerRenderer` is also added after that, in `PixiCanvas`'s effect, so the layering ends up: cells (back) → ground items → compass marker → players (front).

Replace the constructor:

```ts
constructor(app: Application) {
  this.container = new Container();
  app.stage.addChild(this.container);
  this.groundContainer = new Container();
  app.stage.addChild(this.groundContainer);
  this.compassContainer = new Container();
  app.stage.addChild(this.compassContainer);
}
```

Add the field declaration alongside the other private fields:

```ts
private compassContainer: Container;
private compassGfx: Graphics | null = null;
private compassResultKind: 'exact' | 'direction' | null = null;
private compassPulseStartMs = 0;
```

2. Append a public method to the class. Place it after `updateGroundItems`:

```ts
updateCompassMarker(
  result:
    | { kind: 'exact'; x: number; y: number }
    | { kind: 'direction'; angleRad: number }
    | null,
  player: { x: number; y: number } | null,
): void {
  // Tear down if cleared or kind changed
  if (result === null || this.compassResultKind !== result.kind) {
    if (this.compassGfx) {
      this.compassGfx.destroy();
      this.compassContainer.removeChildren();
      this.compassGfx = null;
    }
    this.compassResultKind = result?.kind ?? null;
  }
  if (result === null) return;

  if (result.kind === 'exact') {
    if (!this.compassGfx) {
      this.compassGfx = new Graphics();
      this.compassContainer.addChild(this.compassGfx);
      this.compassPulseStartMs = performance.now();
    }
    const t = (performance.now() - this.compassPulseStartMs) / 1000;
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    this.compassGfx.clear();
    this.compassGfx
      .circle(0, 0, 8)
      .stroke({ color: 0xffffff, width: 2, alpha: pulse });
    this.compassGfx.position.set(
      (result.x + 0.5) * CELL_SIZE,
      (result.y + 0.5) * CELL_SIZE,
    );
  } else {
    if (!this.compassGfx) {
      this.compassGfx = new Graphics();
      this.compassContainer.addChild(this.compassGfx);
      this.compassGfx
        .moveTo(0, 0).lineTo(12, 0)
        .moveTo(12, 0).lineTo(8, -3)
        .moveTo(12, 0).lineTo(8, 3)
        .stroke({ color: 0xffffff, width: 2 });
      this.compassGfx.rotation = result.angleRad;
    }
    if (player) {
      this.compassGfx.position.set(
        (player.x + 0.5) * CELL_SIZE,
        (player.y + 0.5) * CELL_SIZE,
      );
    }
  }
}
```

- [ ] **Step 2: Subscribe in `PixiCanvas.tsx`**

In `web/src/pixi/PixiCanvas.tsx`, change the import line:

```tsx
import { useGameStore } from '../state/gameStore.js';
```

to:

```tsx
import { useGameStore, expireCompassResult } from '../state/gameStore.js';
```

Then update the subscriber effect. Replace the existing subscriber:

```tsx
useEffect(() => {
  const unsub = useGameStore.subscribe((state) => {
    playerRendRef.current?.update(state.players);
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

with:

```tsx
useEffect(() => {
  const unsub = useGameStore.subscribe((state) => {
    playerRendRef.current?.update(state.players);
    const changed = new Map<string, CellType>();
    for (const [k, v] of state.cells) {
      changed.set(k, v);
    }
    mapRendRef.current?.updateCells(changed);
    mapRendRef.current?.updateGroundItems(state.groundItems);

    const me = state.players.find((p) => p.id === state.playerId) ?? null;
    mapRendRef.current?.updateCompassMarker(
      state.compassResult,
      me ? { x: me.x, y: me.y } : null,
    );
  });
  return unsub;
}, []);
```

Then add a new effect after that one to handle the 5s expiry. Place it right before the `return <div ref={containerRef} ... />` line:

```tsx
useEffect(() => {
  const id = setInterval(() => {
    const cr = useGameStore.getState().compassResult;
    if (cr && cr.expiresAtMs <= Date.now()) {
      expireCompassResult();
    }
  }, 100);
  return () => clearInterval(id);
}, []);
```

(A 100 ms interval is fine — it's a one-shot 5s timer with low precision needs.)

- [ ] **Step 3: Manual verification in the browser**

Run: `pnpm --filter @treasure-hunt/web dev` and bring up the gateway/game/lobby per the existing dev workflow. Open two browsers, create and join a match. Then exercise:
- Pick up a compass, press Space when the treasure is closest buried → small white arrow appears next to your sprite. Move; the arrow's rotation does NOT change, only its position.
- Pick up a compass, press Space when a nugget/powerup is closest → pulsing white ring on the cell for ~5 s.
- After ~5 s the marker disappears.
- The opponent's compass activations should not affect your display.

- [ ] **Step 4: Commit**

```bash
git add web/src/pixi/renderers/MapRenderer.ts web/src/pixi/PixiCanvas.tsx
git commit -m "feat(web): Pixi compass marker rendering with 5s decay"
```

---

### Task 15: Final integration verification

**Files:** none modified.

- [ ] **Step 1: Run all tests across the workspace**

Run: `pnpm test`
Expected: all pass — the Phase 2c additions plus all pre-existing 82 tests, totaling roughly 100+.

- [ ] **Step 2: Build all packages**

Run: `pnpm build`
Expected: clean build across `protocol`, `game`, `gateway`, `lobby`, `web`.

- [ ] **Step 3: Lint**

Run: `pnpm lint` (or `pnpm -r lint` if the workspace has it)
Expected: no errors.

- [ ] **Step 4: Manual playthrough**

`pnpm dev`, open two browsers, run a complete match exercising:
1. Pick up a shovel, press Space → buff bar appears, dig speed visibly faster, slot dims to "(active)" while buff is full and slot reholds shovel; second shovel pickup blocks Space → no event, no buff change.
2. Pick up a compass, press Space with treasure-nearest → arrow next to sprite for 5 s.
3. Pick up a compass, press Space with nugget-nearest → pulsing ring on cell for 5 s.
4. Pick up a bomb, press Space → 3×3 chunk in front becomes walkable, items resolve correctly. If treasure is in radius, it appears as a ground item that either player can walk over to win.
