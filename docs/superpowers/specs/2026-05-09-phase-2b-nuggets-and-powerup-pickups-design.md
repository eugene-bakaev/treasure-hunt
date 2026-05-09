# Phase 2b — Nuggets and Powerup Pickups Design

**Goal:** Add item diversity to the map — nuggets score points when dug, powerups go into a per-player slot, dropped powerups land on the ground and are picked up by walking over them. Activation mechanics (what powerups do) are Phase 2c.

**Scope:** Item placement, pickup mechanics (buried and ground), slot system, ground item rendering, powerup slot HUD. No powerup activation in this phase.

---

## 1. Items

### Types

```ts
export type ItemType = 'treasure' | 'nugget' | 'shovel' | 'compass' | 'bomb';
```

### Counts per match

| Item | Count | Points | Notes |
|------|-------|--------|-------|
| treasure | 1 | 100 | existing; ≥15 cells from both spawns |
| nugget | 6 | 10 each | new |
| shovel | 2 | — | new powerup |
| compass | 2 | — | new powerup |
| bomb | 2 | — | new powerup |

### Placement rules

- Treasure: rock cell ≥15 cells from both spawn centers (existing rule).
- All other items: rock cell ≥5 cells from both spawn centers, not already occupied by another item.
- Placement is seeded and deterministic (uses the existing PRNG).

### Scoring

Final score = 100 (if found treasure) + 10 × nuggets collected. Server tracks cumulative score in `PlayerState.score` and includes it in every `PlayerSnapshot`. No client-side score calculation.

---

## 2. Protocol (`packages/protocol/src/messages.ts`)

### `ItemType` export

```ts
export type ItemType = 'treasure' | 'nugget' | 'shovel' | 'compass' | 'bomb';
```

### `PlayerSnapshot` — add `heldPowerup`

```ts
export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  digProgress: number;
  score: number;
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
}
```

### `state_diff` — add `groundItems`

```ts
| {
    type: 'state_diff';
    tick: number;
    cellsChanged: CellChange[];
    players: PlayerSnapshot[];
    detector: number;
    events: MatchEvent[];
    groundItems: Array<{ x: number; y: number; item: ItemType }>;
  }
```

`groundItems` is the full list of ground items each tick (not a diff). Small enough — at most 13 items total in a match.

### `MatchEvent` — expand pickup

```ts
export type MatchEvent =
  | { type: 'match_end'; winnerId: string; scores: Record<string, number> }
  | { type: 'pickup'; playerId: string; itemType: ItemType };
```

---

## 3. Game Server

### `MapGrid` (`services/game/src/map/types.ts`)

Add `items` field so `GameMatch` loads placement without re-running generation:

```ts
export interface MapGrid {
  width: number;
  height: number;
  cells: CellType[][];
  treasurePos: { x: number; y: number };  // kept for backwards compat
  items: Array<{ x: number; y: number; item: ItemType }>;
  seed: string;
}
```

### `MapGenerator` (`services/game/src/map/MapGenerator.ts`)

After placing the treasure, place remaining items using the same PRNG. Each candidate must:
1. Be a rock cell.
2. Be ≥5 cells (Euclidean) from both spawn centers.
3. Not already occupied by another item.

Place in order: 6 nuggets, 2 shovels, 2 compasses, 2 bombs.

### `GameMatch` (`services/game/src/match/GameMatch.ts`)

Replace the old `buriedItems: BuriedItem[]` with two Maps:

```ts
private buriedItems = new Map<string, ItemType>();  // "x,y" → item
private groundItems = new Map<string, ItemType>();  // "x,y" → item
```

Populated at construction from `this.map.items`.

**`PlayerState`** (`services/game/src/physics/movement.ts`) gains `heldPowerup: 'shovel' | 'compass' | 'bomb' | null`.

#### Dig completion logic

When a cell finishes being dug (existing `isDugComplete` path):

```
buried = buriedItems.get("x,y")
if buried:
  remove from buriedItems
  if treasure  → match_end (existing logic), +100 pts
  if nugget    → player.score += 10, emit pickup event
  if powerup:
    if player.heldPowerup === null → player.heldPowerup = powerup, emit pickup event
    else → groundItems.set("x,y", powerup)   // drop to ground
```

#### Ground pickup (each tick, after movement)

```
ground = groundItems.get(playerPos)
if ground:
  if nugget → always collect: player.score += 10, remove from groundItems, emit pickup
  if powerup:
    if player.heldPowerup === null → player.heldPowerup = powerup, remove from groundItems, emit pickup
    else → leave in groundItems (player walks through, item stays)
```

#### `state_diff` emission

Include `groundItems` as a full array each tick:

```ts
groundItems: [...this.groundItems.entries()].map(([key, item]) => {
  const [x, y] = key.split(',').map(Number);
  return { x, y, item };
})
```

#### Detector

No change needed — `computeDetector` already takes `buriedItems` as a generic list. Pass `[...this.buriedItems.entries()]` as `{ x, y }` pairs. Ground items are not detected.

---

## 4. Frontend

### Store (`web/src/state/gameStore.ts`)

Add two fields:

```ts
groundItems: Array<{ x: number; y: number; item: ItemType }>;
heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
```

`applyDiff` updates `groundItems` from `diff.groundItems` and reads `heldPowerup` from the player's own `PlayerSnapshot`.

### Ground item rendering

`MapRenderer` gains an `updateGroundItems` method. Called from the store subscriber in `PixiCanvas`. Renders each ground item as a small 8×8 colored square centered in its cell:

| Item | Color |
|------|-------|
| nugget | `#ffd700` (gold) |
| shovel | `#88aaff` (blue) |
| compass | `#88ffaa` (green) |
| bomb | `#ff8888` (red) |

Ground items are drawn on a dedicated PIXI container above the map layer but below the player layer.

### `PowerupSlot` component (`web/src/hud/PowerupSlot.tsx`)

```tsx
interface PowerupSlotProps {
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
}
```

Displays a labeled box:
- Empty: dim outline, "—" label
- Held: colored background matching the item color above, powerup name in caps

Placed in `Match.tsx` between Scoreboard and PixiCanvas (or below DetectorGauge — wherever fits the layout).

### `Match.tsx`

Add `<PowerupSlot heldPowerup={heldPowerup} />`. Read `heldPowerup` from store via `useGameStore((s) => s.heldPowerup)`.

---

## 5. Testing

### Protocol

- `ItemType` union includes all 5 types.
- `PlayerSnapshot` includes `heldPowerup`.
- `state_diff` includes `groundItems`.

### MapGenerator

- 6 nuggets placed, each ≥5 cells from both spawns.
- 2 shovels, 2 compasses, 2 bombs placed with same constraint.
- No two items share the same cell.
- Treasure still ≥15 cells from both spawns.
- Total items = 13.

### GameMatch

- Dig a nugget cell → +10 pts, `pickup` event emitted, removed from `buriedItems`.
- Dig a powerup cell with empty slot → `heldPowerup` set, `pickup` event, removed from `buriedItems`.
- Dig a powerup cell with full slot → item appears in `groundItems`.
- Walk over nugget ground item → +10 pts, removed from `groundItems`.
- Walk over powerup ground item with empty slot → `heldPowerup` set, removed from `groundItems`.
- Walk over powerup ground item with full slot → item stays in `groundItems`.
- `state_diff` includes correct `groundItems` and `heldPowerup` in `PlayerSnapshot`.

### Frontend

- `PowerupSlot` renders "—" when `heldPowerup` is null.
- `PowerupSlot` renders powerup name when held.
- Store `applyDiff` updates `groundItems` and `heldPowerup` correctly.

---

## 6. Done criteria

Phase 2b is complete when:

1. 13 items appear on the map (verified via detector signal from spawn — detector should ping immediately since items are all over the map).
2. Digging a nugget adds 10 pts to the score display.
3. Digging a powerup fills the slot shown in the HUD.
4. Digging a powerup with a full slot drops it visually on the cell.
5. Walking over a dropped powerup picks it up (slot fills).
6. All unit tests pass; `pnpm build` succeeds.
