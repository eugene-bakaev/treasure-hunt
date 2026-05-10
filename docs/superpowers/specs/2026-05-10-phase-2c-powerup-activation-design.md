# Phase 2c — Powerup Activation Design

**Goal:** Make the three powerups (shovel, compass, bomb) actually do something when the player presses Spacebar. Phase 2b put them in the player's slot; this phase wires up effects, anti-cheat-safe results, and the buff/feedback HUD.

**Scope:** `activate` intent, server-side resolution per powerup, buff timer for Faster Shovel, bomb 3×3 cell destruction with item collection rules, compass single-step nearest-item snapshot result with 5s client-side decay. No bomb explosion animation or audio in this phase — those belong to Phase 4 polish.

This phase finishes Phase 2 of the original `2026-05-09-treasure-hunt-design.md`. After this, the game is end-to-end playable for Phase 2 acceptance.

---

## 1. Powerups

### Shovel — Faster Shovel buff

- **Activation:** Spacebar with `heldPowerup === 'shovel'` AND `fasterShovelTicksRemaining === 0`.
- **Effect:** Sets `fasterShovelTicksRemaining = 450` (15 s × 30 Hz). Slot is cleared. Future digs started while the buff is active complete in `Math.ceil(DIG_TICKS / 2)` ticks (400 ms instead of 800 ms). Buff continues to decrement once per tick regardless of slot state.
- **Re-activation while buff active:** Blocked. The press is a no-op; the shovel stays in the slot, no event is emitted, the buff is not refreshed.
- **HUD feedback:** While the buff is running, the `PowerupSlot` (if it holds a shovel) renders dimmed and a `BuffBar` next to it shows a draining horizontal bar with the label `FASTER SHOVEL Xs`, where `X = Math.ceil(ticksRemaining / 30)`. The bar disappears at 0 ticks.

### Compass — Nearest-item snapshot

- **Activation:** Spacebar with `heldPowerup === 'compass'`. Single step, no mode prompt.
- **Effect:** Server scans currently-buried items, finds the nearest one to the activating player by Euclidean distance (tiebreak: lowest `x`, then lowest `y`), then emits a `compass_result` event scoped to the activator's diff only.
  - Nearest is **treasure** → `{ kind: 'direction'; angleRad: number }` where `angleRad = Math.atan2(targetY - playerY, targetX - playerX)` evaluated at the moment of activation.
  - Nearest is **nugget / shovel / compass / bomb** → `{ kind: 'exact'; x: number; y: number; itemType: ItemType }`.
  - No buried items at all (degenerate; treasure is always buried until match end) → `{ kind: 'no_target' }`.
  - Slot is cleared. `powerup_activate` is emitted (broadcast).
- **Lifetime:** The server retains nothing after emitting. The client renders the result for 5 s, then clears it via a local timer. Only buried items are candidates; ground items are excluded (mirrors detector rules).
- **HUD/visual feedback:**
  - `kind: 'exact'` → a pulsing 16×16 ring on the cell. Position is fixed in world space.
  - `kind: 'direction'` → a small arrow rendered next to the local player's sprite. The arrow's **rotation is fixed** at `angleRad` (snapshot — does not recompute as the player moves). The arrow's **screen position tracks the player's sprite** every frame.
  - `kind: 'no_target'` → no visual.

### Bomb — 3×3 detonation in front

- **Activation:** Spacebar with `heldPowerup === 'bomb'`.
- **Effect:** Resolved server-side, instant (single tick).
  - Determine center cell: `(floor(player.x) + dx, floor(player.y) + dy)` where `(dx, dy) = facingVec(player.facing)`.
  - For each of the 9 cells in the 3×3 region (`BOMB_RADIUS = 1`) centered there:
    - Skip if off-map.
    - If the cell is `rock`: flip to `walkable`, push to `cellsChanged`. Resolve any buried item in that cell:
      - `nugget` → bomber gets `+10` score; `pickup` event emitted; remove from `buriedItems`.
      - `shovel` / `compass` / `bomb` → slot rule: if bomber's slot is empty, set `heldPowerup` to that powerup and emit `pickup`; otherwise `groundItems.set(key, item)`.
      - `treasure` → set `groundItems.set(key, 'treasure')`. Do **not** auto-collect; do **not** end the match. Either player can subsequently walk over the cell to collect it (see §3.4).
    - If the cell is already `walkable`: skip; do not modify any ground items already there.
  - Emit `bomb_detonate { playerId, cells: [<every rock cell that was flipped>] }` (broadcast).
  - Emit `powerup_activate { playerId, powerup: 'bomb' }` (broadcast).
  - Slot is cleared.
- **Visual feedback in this phase:** Cells flip to walkable instantly; new ground items appear; the `bomb_detonate` event flows through to the store but the client renders no animation. (Phase 4 turns this into an animated explosion.)

---

## 2. Protocol (`packages/protocol/src/messages.ts`)

### `ClientMessage`

```ts
export type ClientMessage =
  | { type: 'move'; dir: Facing }
  | { type: 'stop' }
  | { type: 'dig' }
  | { type: 'activate' };
```

### `PlayerBuffs` and `PlayerSnapshot`

```ts
export interface PlayerBuffs {
  fasterShovelTicksRemaining: number; // 0 = no buff
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
```

### `MatchEvent` — three new variants

```ts
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

### Routing

`compass_result` is delivered only to the activating player's `state_diff.events`. `powerup_activate`, `bomb_detonate`, `pickup`, and `match_end` are broadcast (in every player's diff). The diff builder routes events accordingly; the public/private split mirrors how `detector` is computed per-player today.

---

## 3. Game Server

### 3.1 `PlayerState` (`services/game/src/physics/movement.ts`)

```ts
export interface PlayerState {
  // ...existing fields
  fasterShovelTicksRemaining: number; // 0 = no buff
}
```

Initialized to `0` in `GameMatch.addPlayer`.

### 3.2 New module `services/game/src/match/activationSystem.ts`

Owns powerup resolution to keep `tickOnce` focused on flow control.

```ts
export const FASTER_SHOVEL_TICKS = 450;  // 15 s × 30 Hz
export const BOMB_RADIUS = 1;            // 3×3 around center

export interface ActivationContext {
  player: PlayerState;
  map: MapGrid;
  buriedItems: Map<string, ItemType>;
  groundItems: Map<string, ItemType>;
}

export interface ActivationResult {
  player: PlayerState;
  cellsChanged: CellChange[];
  publicEvents: MatchEvent[];                    // broadcast to all players
  privateEvents: MatchEvent[];                   // events for the activator only (compass_result)
}

export function activatePowerup(ctx: ActivationContext): ActivationResult;
```

The function dispatches on `ctx.player.heldPowerup`:

- `null` → no-op (returns `player` unchanged, no events). Calling code only invokes `activatePowerup` when an `activate` intent was queued AND `heldPowerup !== null`.
- `'shovel'` → if `ctx.player.fasterShovelTicksRemaining > 0`, no-op. Else: set `fasterShovelTicksRemaining = FASTER_SHOVEL_TICKS`, clear `heldPowerup`, push `powerup_activate` to `publicEvents`.
- `'compass'` → clear `heldPowerup`, push `powerup_activate`. Compute nearest buried item (Euclidean, then `x` ascending, then `y` ascending). If none → push `compass_result { kind: 'no_target' }` to `privateEvents`. If treasure → push `compass_result { kind: 'direction', angleRad }`. Else → push `compass_result { kind: 'exact', x, y, itemType }`.
- `'bomb'` → clear `heldPowerup`, push `powerup_activate`. Compute center via `facingVec`. Iterate 3×3, applying the rules in §1. Mutates `buriedItems`, `groundItems`, and `map.cells`. Returned `player` reflects score deltas, slot deltas. `cellsChanged` lists every flipped rock cell. Push `bomb_detonate` to `publicEvents` (always, even if zero rock cells flipped — the activation happened).

### 3.3 `services/game/src/match/digSystem.ts`

`startDig` accepts the player's buff state and halves the duration when buffed:

```ts
export function startDig(state: PlayerState, map: MapGrid): PlayerState {
  // ...existing rock-cell-in-front check
  const ticks = state.fasterShovelTicksRemaining > 0
    ? Math.ceil(DIG_TICKS / 2)
    : DIG_TICKS;
  return { ...state, digTarget, digTicksRemaining: ticks };
}
```

No other dig logic changes.

### 3.4 `GameMatch.tickOnce` integration

Per-player intent loop, in order:

1. Drain intents. Existing `move`/`stop`/`dig` handling unchanged. New: when `activate` is encountered, mark a flag (`activateRequested = true`). Multiple `activate` intents in one tick collapse to one (extras ignored).
2. **Resolve activation** (after intents drained, before dig advance / movement):
   - If `activateRequested && state.heldPowerup !== null`, call `activatePowerup({ player: state, map, buriedItems, groundItems })`. Merge the result: `state = result.player`; collect `result.cellsChanged` into the per-tick `cellsChanged`; collect `result.publicEvents` into the per-tick public `events`; stash `result.privateEvents` in a `Map<playerId, MatchEvent[]>`.
   - If activation requested but slot empty, no-op.
3. Advance dig timer. Existing logic.
4. Resolve completed dig. Existing logic, unchanged.
5. Apply movement. Existing logic.
6. **Buff decrement:** `state.fasterShovelTicksRemaining = Math.max(0, state.fasterShovelTicksRemaining - 1)`.
7. **Ground pickup** — extend the existing handler with treasure:
   - `nugget` → existing: +10 score, emit `pickup`.
   - powerup with empty slot → existing: into slot, emit `pickup`.
   - powerup with full slot → existing: leave on ground.
   - `treasure` → score += 100, emit `pickup`, emit `match_end { winnerId: state.id, scores: {...} }`, set `this.ended = true`. Remove from `groundItems`.

When building each player's `state_diff` at the end of the tick:

```ts
const events: MatchEvent[] = [
  ...publicEventsThisTick,
  ...(privateEventsByPlayer.get(playerId) ?? []),
];
```

`PlayerSnapshot.buffs` is mapped from `state.fasterShovelTicksRemaining`.

### 3.5 Anti-cheat invariants

1. The treasure coordinate never appears in any client-bound message. Compass `kind: 'direction'` carries only `angleRad`. Bomb-revealed treasure becomes a `groundItem` whose location is already public (the cell is now walkable and visibly contains an item).
2. Compass `kind: 'exact'` carries the cell coord, but only flows to the activator's diff. Server retains nothing post-emit.
3. The 5 s display window for compass is enforced client-side (server has nothing to enforce). Client decays via local `Date.now()` comparison; the data never re-leaks.
4. `activate` is server-confirmed only — same as `dig`. The client cannot force any side effect; it only signals intent.

---

## 4. Frontend

### 4.1 Store (`web/src/state/gameStore.ts`)

New fields:

```ts
buffs: { fasterShovelTicksRemaining: number };
compassResult:
  | { kind: 'exact'; x: number; y: number; itemType: ItemType; expiresAtMs: number }
  | { kind: 'direction'; angleRad: number; expiresAtMs: number }
  | null;
```

Initial state: `buffs: { fasterShovelTicksRemaining: 0 }`, `compassResult: null`.

`applyDiff` updates:
- `buffs` from `myPlayer.buffs` (ternary, not `??`, to allow zeroing).
- For each event in `diff.events`:
  - `compass_result` where `playerId === playerId` (mine) AND `result.kind !== 'no_target'` → set `compassResult` with `expiresAtMs = Date.now() + 5000`.
  - `compass_result` with `kind: 'no_target'` → leave `compassResult` untouched (and the renderer shows nothing for null).
  - `bomb_detonate` → no store change in this phase. (Reserved for Phase 4.)
  - `powerup_activate` → no store change. HUD reflects activation indirectly via `heldPowerup` clearing and `buffs` updating.

New action `expireCompassResult()` sets `compassResult = null`.

### 4.2 Input (`web/src/hooks/useInput.ts`)

```ts
const ACTIVATE_KEYS = new Set([' ', 'Space', 'Spacebar']);
```

`UseInputCallbacks` gains `onActivate: () => void`. `handleKeyDown` checks `ACTIVATE_KEYS` and calls `onActivate()` on a single press (`e.repeat` guard, `e.preventDefault()`).

### 4.3 `Match.tsx`

Add:

```ts
const buffs = useGameStore((s) => s.buffs);
const onActivate = useCallback(() => sendIntent({ type: 'activate' }), []);
useInput({ onMove, onStop, onDig, onActivate });
```

Render the new `<BuffBar />` next to `<PowerupSlot />` in the same 640px row. `PowerupSlot` receives the new `disabled` prop (true when `heldPowerup === 'shovel' && buffs.fasterShovelTicksRemaining > 0`).

### 4.4 HUD components

**`PowerupSlot.tsx`** — extend props:

```ts
interface PowerupSlotProps {
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
  disabled?: boolean;
}
```

When `disabled === true`, render with `opacity: 0.4` and a small "(active)" suffix.

**`BuffBar.tsx`** (new) — shows nothing when buff is 0. Otherwise:

```tsx
const seconds = Math.ceil(ticksRemaining / 30);
const widthPct = (ticksRemaining / 450) * 100;
// Renders: label "FASTER SHOVEL {seconds}s" + a div with width:`${widthPct}%`
```

### 4.5 Pixi rendering (`web/src/pixi/`)

**`MapRenderer`** gains:

- `updateCompassMarker(result: CompassResult | null, playerSnapshot: PlayerSnapshot | null)`:
  - `null` or `kind: 'no_target'` → clear marker container.
  - `kind: 'exact'` → render/update a pulsing ring `Graphics` at the cell's center (16×16 box, alpha animated by a `Ticker` callback using a sine wave). Rendered above ground items, below players.
  - `kind: 'direction'` → render/update a small arrow `Graphics` placed at the local player's sprite position with a fixed offset of `~12 px` along the bearing. Arrow's `rotation = angleRad`. Arrow position is updated each frame from the latest player snapshot; rotation never changes for the lifetime of the result.
- The new marker is hosted in a dedicated `Container` between the ground-items layer and the player layer.

**`PixiCanvas.tsx`** subscribes to `compassResult` and the local player's snapshot in the store, calls `updateCompassMarker` whenever either changes. A separate `Ticker` callback checks `compassResult.expiresAtMs <= Date.now()` and calls `expireCompassResult()` to clear.

Existing `Graphics` cleanup pattern (destroy before remove) from Phase 2b applies here too — the ring and arrow Graphics must be destroyed when cleared.

---

## 5. Testing

### 5.1 Protocol

- `ClientMessage` accepts `{ type: 'activate' }`.
- `PlayerSnapshot` carries `buffs.fasterShovelTicksRemaining`.
- `MatchEvent` discriminated union matches all three new variants and their full shapes (including the `CompassResult` union).

### 5.2 Game server (`services/game/test/match/`)

**`activationSystem`:**
- Activate shovel from `fasterShovelTicksRemaining: 0` → buff set to 450, slot cleared, `powerup_activate` in publicEvents, no privateEvents.
- Activate shovel while `fasterShovelTicksRemaining: 100` → returns unchanged player, empty events.
- Activate compass with treasure as nearest buried item → `kind: 'direction'` with `angleRad ≈ atan2(...)` (within `1e-6`).
- Activate compass with a nugget closer than the treasure → `kind: 'exact'` with the nugget's coord and `itemType: 'nugget'`.
- Activate compass with a powerup closer than nugget and treasure → `kind: 'exact'` with the powerup's coord and `itemType`.
- Activate compass with two equidistant items → tiebreak picks lowest `x`, then lowest `y`.
- Activate compass with all items dug except treasure → `kind: 'direction'` (since treasure is the only buried item).
- Activate compass with empty `buriedItems` (degenerate) → `kind: 'no_target'`.
- Activate bomb in open rock → up to 9 cells flipped, `cellsChanged` lists them, `bomb_detonate.cells` matches, no pickups.
- Activate bomb with a nugget in radius → bomber +10, `pickup` event, nugget removed from `buriedItems`.
- Activate bomb with a powerup in radius (slot empty) → goes into slot, `pickup` event, removed from `buriedItems`.
- Activate bomb with a powerup in radius (slot full) → appears in `groundItems`.
- Activate bomb with treasure in radius → cell flipped to walkable, treasure appears in `groundItems`, **no `match_end`**.
- Activate bomb at map edge → off-map cells silently skipped, on-map cells processed normally.
- Activate bomb on already-walkable area → no `cellsChanged`, no item changes, but `bomb_detonate` still emitted.

**`digSystem`:**
- `startDig` with `fasterShovelTicksRemaining: 0` → `digTicksRemaining = DIG_TICKS`.
- `startDig` with `fasterShovelTicksRemaining: 100` → `digTicksRemaining = Math.ceil(DIG_TICKS / 2)`.

**`GameMatch` integration:**
- Activate intent with empty slot → no-op (no event, no state delta).
- Activate intent with full slot → `activatePowerup` invoked exactly once even with multiple `activate` intents queued in the same tick.
- Buff timer decrements monotonically: ticks 1..450 yield values 449..0; further ticks stay at 0.
- Walking onto a `groundItems` treasure cell → `pickup` + `match_end`, match `ended` flag set.
- `compass_result` event appears only in the activator's `player_diff.diff.events`; opponent's diff has no `compass_result`.
- `bomb_detonate` and `powerup_activate` appear in both players' diffs.

### 5.3 Web (`web/test/`)

**`gameStore`:**
- `applyDiff` populates `buffs` from `myPlayer.buffs`.
- `applyDiff` with `compass_result` for me, `kind: 'exact'` → `compassResult` set with `expiresAtMs ≈ Date.now() + 5000` (within 50 ms tolerance).
- `applyDiff` with `compass_result` for me, `kind: 'direction'` → `compassResult` set with `angleRad`.
- `applyDiff` with `compass_result` for me, `kind: 'no_target'` → `compassResult` stays `null`.
- `applyDiff` with `compass_result` for the other player → `compassResult` stays whatever it was (defensive — shouldn't be in the diff at all).
- `expireCompassResult()` clears the field.

**`PowerupSlot`:**
- Existing tests still pass.
- New: `disabled` prop with `heldPowerup: 'shovel'` → renders dimmed (opacity assertion or class assertion).

**`BuffBar`:**
- `fasterShovelTicksRemaining: 0` → renders nothing.
- `fasterShovelTicksRemaining: 450` → label "FASTER SHOVEL 15s", width 100%.
- `fasterShovelTicksRemaining: 1` → label "FASTER SHOVEL 1s" (ceil), width ~0.22%.

**`useInput`:**
- Spacebar keydown → `onActivate` called once.
- Spacebar held (`e.repeat: true`) → `onActivate` not called again.

### 5.4 Out of scope

- Pixi visual regression for the compass marker, arrow direction, and bomb. The renderer code is plain Pixi; we follow the existing Phase 2b pattern of unit-testing the data path and verifying visuals manually.
- Audio (Phase 4 polish).

---

## 6. Done criteria

Phase 2c is complete when:

1. Pressing Spacebar while holding a shovel sets a 15 s buff; HUD shows the countdown; subsequent digs visibly complete in ~400 ms; pressing Space again while the buff is active does nothing and keeps the shovel.
2. Pressing Spacebar while holding a compass with the treasure being the closest buried item shows a fixed-rotation arrow next to the player for 5 s, then it disappears; the arrow's rotation does not change as the player moves.
3. Pressing Spacebar while holding a compass with a nugget or powerup as the closest buried item shows a pulsing ring on that cell for 5 s.
4. Pressing Spacebar while holding a bomb instantly flips up to 9 rock cells in front of the player to walkable, auto-collects nuggets, slot-or-drops powerups, and exposes any treasure in the radius as a ground item that either player can collect by walking onto it.
5. The `compass_result` event is delivered only to the activator's diff; opponent diffs never carry it.
6. All unit tests pass; `pnpm build` and `pnpm test` succeed across all workspaces.
