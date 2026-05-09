# Treasure Hunt — Design

**Status:** draft
**Author:** Eugene Bakaev
**Date:** 2026-05-09

## 1. Goal

A two-player, real-time, web-based treasure-hunt game intended as a **portfolio piece**. Both gameplay quality and architectural craft matter; the design favors production-flavored patterns (server-authoritative simulation, decoupled services, message broker, GraphQL) where they earn their place, and avoids them where they don't.

The full system runs locally on a single machine via Docker Compose. The architecture is shaped so that a future scale-out (multi-instance Game Server, real auth, replays) is a straight extension rather than a rewrite, but none of those are in MVP scope.

## 2. Gameplay summary

### 2.1 The match

- Two players, one map, real-time.
- Each match starts with both players in small spawn pockets carved into a solid rock map.
- The map is **40 × 40 cells** (tunable). All cells start as rock except spawn pockets.
- The map contains:
  - One **main treasure** worth **100 points**.
  - **Six nuggets** worth **10 points each**.
  - Several buried **powerups** (target ~6 per match — tunable).
- All scoreable items and all powerups are buried in random rock cells. The map seed is generated server-side and recorded for the match record.

### 2.2 Movement and digging

- Continuous real-time movement using WASD or arrow keys; movement speed 4 cells/sec (tunable).
- Player has a position (fractional cell coordinates) and a 4-way facing direction (N/E/S/W).
- Digging snaps to the cell directly in front of the player and takes a fixed dig time of **800 ms** (halved while *Faster Shovel* is active).
- Digging removes one rock cell. If the cell contained a scoreable item, it is auto-collected by the digger. If it contained a powerup, see slot rules in §2.4.

### 2.3 The metal detector

- Always on. Renders as a 0–100% gauge plus a beep whose frequency tracks the gauge value.
- The gauge fires for any **buried** detectable: main treasure, nuggets, or powerups. Buried items are indistinguishable on the gauge.
- Once an item is dug up — collected, picked up, or visible on the ground — the detector no longer pings for it. The detector is strictly an X-ray for things still buried.
- The signal is computed entirely on the server; the client receives only the gauge value.

#### Detector formula

For each player, each tick, the server picks the strongest signal among all currently-buried items:

```
For each buried item I:
  d                = euclidean distance from player to I, in cells
  bearing          = angle from player.facing to I (0 = directly ahead, π = behind)
  range            = 12 cells (max effective)

  distance_factor  = max(0, 1 - d / range)         # 1 close, 0 far
  direction_factor = max(0, cos(bearing))          # 1 ahead, 0 sideways or behind
  signal           = 100 * distance_factor * direction_factor

signal_for_player  = max over all items
```

Beep frequency on the client is a function of the gauge value (e.g., `beepHz = 1 + gauge / 10`). The detector range of 12 cells is ~30% of map width, so the gauge is often 0 in the early game — feels like searching.

### 2.4 Powerups

Three powerups, all buried, all detectable while buried, all single-instance pickups.

| Powerup | Effect | Activation |
|---|---|---|
| **Faster Shovel** | Halves dig time for **15 s** | One-shot consume; buff continues after slot empties |
| **Treasure Compass** | Two-step: on activate, prompt asks the player to pick **(a) reveal exact location of nearest powerup**, or **(b) reveal direction-only arrow toward main treasure**. Result is shown for **5 s**, then purged from server-held client data. | One-shot consume |
| **Bomb** | Destroys a **3 × 3 chunk** of rock cells in front of the player. Items inside are revealed/auto-collected (not destroyed). | One-shot consume |

#### Powerup slot rules

- Each player has **one** powerup slot.
- When a player digs up a cell containing a powerup:
  - If the slot is empty → powerup goes into the slot.
  - If the slot is full → powerup remains visible on the ground in that cell. Anyone with an empty slot can pick it up by walking over it.
- Activation is a button press (Spacebar). On activation the slot becomes empty; ongoing buffs (e.g., Faster Shovel duration) continue independently.
- Detector does **not** ping for powerups visible on the ground — only buried.

### 2.5 End condition

- Match ends the moment someone digs up the **main treasure**.
- Final score for each player = (100 if they dug up the main treasure, else 0) + (10 × nuggets they collected).
- Higher score wins. Ties are theoretically possible but rare given the 100-pt main treasure dominates; if scores tie exactly, the player who found the main treasure wins.

### 2.6 Lobby and matchmaking

Two ways into a match:

- **Public lobby** — players see a list of open public matches and join one. They can also create a new public match from the lobby.
- **Private invite link** — player creates a private match, gets a shareable URL, sends to a friend.

No quick-match queue for MVP.

### 2.7 Identity

- **Nickname only.** No password, no OAuth.
- A nickname is just a display name. Stats and leaderboard rows attach to whatever nickname was used. **Open to impersonation by design** — accepted as an MVP tradeoff. A real-identity layer can be added later without changing the gameplay or service architecture.
- The Gateway issues a short-lived JWT carrying the nickname when a session starts. The token is used on both WebSocket and GraphQL so the Game Server can verify a WS message belongs to a real connected player.

## 3. Architecture

### 3.1 Service topology

Five processes, communicating over WebSocket (real-time client traffic), HTTP (GraphQL/REST), and AMQP (RabbitMQ events).

```
                        ┌──────────────┐
   Browser  ◄──── WS ──►│   Gateway    │ ◄── HTTP (GraphQL/REST) ──► Browser
                        │ (per-conn    │
                        │  sockets)    │
                        └──┬─────────┬─┘
                           │         │
           ┌───────────────▼─┐    ┌──▼──────────────┐
           │ Lobby Service   │    │ Game Server     │
           │ (rooms, invites,│    │ (one process    │
           │ matchmaking)    │    │ runs many       │
           └────────┬────────┘    │ matches; ticks  │
                    │             │ at 30 Hz)       │
                    │             └────────┬────────┘
                    │                      │
                    ▼                      ▼
                 ┌─────────────┐                  ┌──────────────┐
                 │  RabbitMQ   │ ─── results ───► │ Stats        │
                 │  (broker)   │                  │ Consumer     │
                 └─────────────┘                  └──────┬───────┘
                                                         │
                                                  ┌──────▼───────┐
                                                  │  Postgres    │
                                                  │  (leaderboard│
                                                  │  / stats /   │
                                                  │  match log)  │
                                                  └──────────────┘
```

### 3.2 Service responsibilities

- **Gateway.** Single externally-visible entry point. Holds WebSocket connections (one per client). Serves GraphQL/REST over HTTP. Terminates auth (issues and verifies nickname JWTs). Owns no game state — proxies WS traffic to the right Game Server, proxies lobby actions to the Lobby Service, serves leaderboard/stats reads from Postgres via GraphQL.
- **Lobby Service.** Holds the list of open public rooms and pending private invites in memory. Pairs players or accepts invite-link joins, then asks the Game Server to spin up a match and tells the Gateway where to route those players' WS messages.
- **Game Server.** Runs match instances in-process. Each match has its own state: map grid, player positions/facings, item locations, powerup slots, scores. Ticks at 30 Hz: applies inputs, advances dig timers, computes per-player detector signals, broadcasts state diffs back through the Gateway. On match end, publishes a `match.finished` event to RabbitMQ. **One Game Server process can host many matches concurrently**; scale-out is by running multiple instances.
- **RabbitMQ (broker).** Two main topics: `match.lifecycle` (created / started / finished) and `match.results` (final scores, used by the Stats Consumer). Lobby Service and Game Server publish; Stats Consumer subscribes.
- **Stats Consumer.** Subscribes to `match.results`, writes match record to Postgres, updates per-nickname aggregates inside a single transaction. Idempotent on `match_id` so duplicate broker deliveries are safe.
- **Postgres.** Persistent store for match log and per-nickname aggregates. Schema in §5.

### 3.3 Cross-cutting decisions

1. **Server-authoritative simulation.** Client sends *intent* (move direction, dig request, powerup activate); the server resolves and broadcasts state diffs. Client predicts movement locally and reconciles when server diffs arrive (snap if drift > 1 cell). **Digging and pickups are server-confirmed only — no client-side prediction for those.**
2. **Detector privacy invariant.** Item coordinates never leave the Game Server, except as a *result* of digging the cell containing them, or as a Compass result for the activating player during its 5 s display window (after which the server purges the data).
3. **Tick rate 30 Hz.** Both simulation and broadcast tick at 30 Hz. Broadcasts contain only the state diff since the previous tick.
4. **Gateway-to-GameServer link.** Internal RPC over a persistent connection (HTTP/2 or internal WS), not via the broker. The broker is for events, not for hot-path real-time traffic.
5. **Browser ↔ Gateway is the only externally-visible surface.** All other services are private and internal-network only.
6. **No service mesh, no Consul, no Kubernetes for MVP.** Service discovery is Docker Compose DNS only; configuration is via env vars (`POSTGRES_URL`, `RABBITMQ_URL`, `GATEWAY_URL`, etc.).

### 3.4 Game-loop flow (per match, per tick)

```
For each match, every 33 ms (30 Hz):
  1. Drain input queue   — apply pending move/dig/activate intents from each player
  2. Advance timers      — dig progress, faster-shovel duration, compass effect timer
  3. Resolve actions     — completed digs remove blocks, reveal items, trigger pickups
  4. Compute detectors   — per player: signal = f(position, facing, buried items)
  5. Build state diffs   — per player (only the detector field differs)
  6. Broadcast           — send diff over WS to each player
  7. Match-end check     — if main treasure was dug, freeze, publish results to MQ
```

### 3.5 Action mechanics

- **Movement.** Holding a movement key sends a stream of `intent: {move: 'N'}` messages; server applies them at fixed speed. Client predicts movement; server diffs reconcile.
- **Digging.** Player presses dig → server checks for a rock cell directly in facing direction → starts an 800 ms timer (or 400 ms with Faster Shovel). On completion: cell becomes walkable; if it contained an item, the item is revealed/picked up per §2.4. Dig is server-confirmed only.
- **Powerup activation.**
  - *Faster Shovel:* set buff timer to 15 s on this player.
  - *Bomb:* destroy a 3 × 3 chunk of rock cells in front of the player. Items in those cells are not destroyed: nuggets are auto-collected by the bombing player; powerups follow the same slot rule as digging (slot empty → into slot; slot full → drop on ground).
  - *Compass:* server emits `compass.choose` to the activating client; client replies with `'powerup'` or `'treasure'`; server sends a one-time `compass.result` event with the location/direction info and a 5 s display window. After the window the data is purged.

### 3.6 State-diff payload (per tick, broadcast to each client)

```ts
{
  tick: number,
  cells_changed: [{x, y, type: 'walkable'|'rock'|'powerup_visible:bomb'|...}, ...],
  players: [{id, x, y, facing, dig_progress, slot, score, buffs}, ...],
  detector: number,           // private, this player's gauge 0–100
  events: [{type: 'pickup'|'powerup_drop'|'compass_result'|'match_end'|..., ...}, ...]
}
```

The `detector` field is the only per-recipient piece — everything else is identical for both players.

### 3.7 Reconnection

If a WS connection drops mid-match, the Game Server holds the seat for **10 s**. Client auto-reconnects with the same JWT ticket. After 10 s, the still-connected opponent is awarded the win and the match is published as ended.

## 4. Anti-cheat invariants

Stated explicitly so they can be tested:

1. Item coordinates never appear in any client message except as a result of digging the cell containing them (or as a 5-second Compass result for the activating player).
2. Compass result data is purged server-side after the 5 s window expires.
3. Dig success is decided server-side. The client cannot fabricate a "I dug here" message that resolves into anything.
4. Players send only intents, never positions. The server is the source of truth for player positions.
5. Detector values are computed from server-held item coordinates, never from any client-supplied data.

## 5. Persistence

### 5.1 Postgres schema

```sql
matches (
  id              uuid primary key,
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  duration_sec    int not null,
  map_seed        text not null,            -- for reproducibility / future replay
  winner_nick     text not null,            -- denormalized for leaderboard reads
  player_a_nick   text not null,
  player_a_score  int not null,
  player_b_nick   text not null,
  player_b_score  int not null,
  end_reason      text not null             -- 'main_treasure' | 'opponent_disconnect'
);
create index on matches (ended_at desc);
create index on matches (winner_nick);
create index on matches (player_a_nick);
create index on matches (player_b_nick);

player_stats (                               -- aggregated; updated by Stats Consumer
  nickname        text primary key,
  matches_played  int not null default 0,
  matches_won     int not null default 0,
  total_score     bigint not null default 0,
  best_score      int not null default 0,
  last_played_at  timestamptz
);
```

The Stats Consumer is the only writer for `player_stats`. It reads `match.results` events from RabbitMQ and does an upsert for each of the two players (`player_a_nick` and `player_b_nick`) inside a single transaction with the `matches` insert. The transaction is idempotent on `matches.id` (insert-or-ignore), so duplicate broker deliveries are safe.

### 5.2 GraphQL schema

GraphQL is read-only. Mutations stay on REST/WebSocket for clarity (real-time gameplay is not a GraphQL fit; lobby actions are simple enough that REST is cleaner).

```graphql
type Query {
  leaderboard(limit: Int = 20, sortBy: LeaderboardSort = TOTAL_SCORE): [PlayerStats!]!
  player(nickname: String!): PlayerStats
  recentMatches(nickname: String, limit: Int = 20): [Match!]!
}

enum LeaderboardSort { TOTAL_SCORE WINS BEST_SCORE }

type PlayerStats {
  nickname: String!
  matchesPlayed: Int!
  matchesWon: Int!
  winRate: Float!                              # computed
  totalScore: Int!
  bestScore: Int!
  lastPlayedAt: DateTime
  recentMatches(limit: Int = 5): [Match!]!     # nested resolver — GraphQL earns its place here
}

type Match {
  id: ID!
  startedAt: DateTime!
  endedAt: DateTime!
  durationSec: Int!
  winnerNick: String!
  playerA: MatchPlayer!
  playerB: MatchPlayer!
  endReason: String!
}

type MatchPlayer { nickname: String!  score: Int!  won: Boolean! }
```

### 5.3 What lives where

| Concern                       | Where                                     |
|-------------------------------|-------------------------------------------|
| Live game state               | Game Server in-memory (per match)         |
| Match history (final records) | Postgres `matches`                        |
| Per-player aggregates         | Postgres `player_stats`                   |
| Leaderboard reads             | GraphQL → Postgres                        |
| Lobby state (open rooms)      | Lobby Service in-memory (single instance for MVP) |
| Sessions (nickname JWTs)      | Issued by Gateway, stateless (signed)     |

### 5.4 Explicitly NOT persisted (YAGNI)

- Per-tick game state. Not worth the volume; if replays are added later, `map_seed` plus a recorded input log is far smaller.
- Powerup activation history, dig counts, "favorite map seed," etc.
- Anything per-player beyond the aggregate row.

## 6. Frontend

### 6.1 Stack

- **Vite + React + TypeScript.**
- **PixiJS** for the play area only (WebGL-accelerated 2D tile/sprite rendering).
- **Zustand** for live match state.
- **Apollo Client** for GraphQL reads (leaderboard, profile, recent matches).
- **graphql-codegen** for typed GraphQL hooks.

### 6.2 Routes

```
/             — Home: nickname entry, "Find match" / "Create private" / "Browse lobby" / leaderboard
/lobby        — Public lobby browser (open rooms, "Create" button)
/match/:id    — In-match screen
```

### 6.3 Match-screen layout

React owns everything outside the play area; PixiJS owns the play area only.

```
┌──────────────────────────────────────────────────────┐
│  Player A: WhiteFox    100  │  Player B: Lava   30   │   ← React HUD (scores, names)
├──────────────────────────────────────────────────────┤
│                                                      │
│              [ PixiJS canvas — the map,              │
│                tunnels, players, items,              │
│                dig progress overlays ]               │
│                                                      │
├──────────────────────────────────────────────────────┤
│  Detector: ████████░░  72%       Slot: [ Bomb ]      │   ← React HUD (gauge, slot)
│  beep…beep…beep…                                     │
└──────────────────────────────────────────────────────┘
```

HUD in React (not Pixi) keeps text/buttons accessible, easy to style, easy to test. PixiJS handles only the parts that benefit from WebGL: the tile grid, sprites, and particle effects on dig/bomb.

### 6.4 State management

Two stores, deliberately separate:

- **`gameStore` (Zustand)** — live match state from WebSocket. Map cells, both players' positions/facings, my detector value, my slot, scores, current event log. Updated 30 times/sec. Components subscribe to slices (HUD subscribes to scores/slot/detector; Pixi rendering reads cells/players directly each frame).
- **Apollo Client cache** — leaderboard, player profile, recent matches. Used only on home / lobby / post-match screens, never during a live match.

The stores have totally different update profiles (high-frequency ephemeral state vs. request-response cached reads). Forcing both through Apollo would either over-cache the game state or under-use Apollo's strengths.

### 6.5 WebSocket lifecycle

```
home → click Find Match → POST /api/match/find    → returns matchId + WS ticket (JWT)
                                                  └→ open WS to gateway with ticket
                                                  └→ navigate to /match/:id
in match → WS sends intents on input
         → WS receives state diffs at 30 Hz
         → on match_end event, store final scores, show post-match modal
         → close WS, navigate home
```

### 6.6 Input

A `useInput` hook captures held-down keys:

| Key(s)            | Intent              |
|-------------------|---------------------|
| WASD or arrows    | Movement direction  |
| J or click        | Dig                 |
| Spacebar          | Activate slot       |
| Q / E             | Compass mode prompt (powerup vs treasure) |

Movement intents are sent on every tick boundary while a key is held; dig and activate are one-shots.

### 6.7 Rendering loop

PixiJS app drives a `requestAnimationFrame` loop. Each frame:

1. Read current state from `gameStore`.
2. Reconcile dirty tiles (only redraw cells that changed since last render).
3. Interpolate player positions: render at the position predicted by client-side movement, snapping if server diff drift > 1 cell.
4. Render dig-progress arc on the cell being dug.
5. Animate transient effects from `events` (bomb explosion, pickup sparkle, then drop the event).

### 6.8 Web project layout

```
web/
  src/
    app/                # routing, providers
    screens/
      Home.tsx
      Lobby.tsx
      Match.tsx         # composes HUD + PixiCanvas
    hud/
      Scoreboard.tsx
      DetectorGauge.tsx
      PowerupSlot.tsx
      CompassPrompt.tsx
    pixi/
      PixiCanvas.tsx    # mount point, lifecycle
      renderers/
        MapRenderer.ts
        PlayerRenderer.ts
        EffectsRenderer.ts
    net/
      socket.ts         # WS connection, reconnect, message dispatch
      graphql.ts        # Apollo client setup
    state/
      gameStore.ts      # Zustand
    hooks/
      useInput.ts
      useGameSubscription.ts
```

### 6.9 Shared types

Server and client share a `@treasure-hunt/protocol` workspace package with TypeScript types for WebSocket messages and the GraphQL schema (codegen via `graphql-codegen`). One source of truth, no drift.

## 7. Local deployment (Docker Compose)

Single-machine via Docker Compose for both development and "production demo" runs.

```yaml
# docker-compose.yml — sketch
services:
  postgres:    # postgres:16-alpine
  rabbitmq:    # rabbitmq:3-management (UI on :15672 helps debugging)
  gateway:     # build ./services/gateway,    ports: 3000:3000
  lobby:       # build ./services/lobby
  game:        # build ./services/game
  stats:       # build ./services/stats
  web:         # build ./web (Vite static build, served by gateway in prod, dev server otherwise)
```

Implications:

- **Service discovery via Docker DNS only.** No Consul, no service registry. Each service reads connection URLs from env vars (`POSTGRES_URL`, `RABBITMQ_URL`, `GATEWAY_URL`, etc.). In Compose, `postgres`, `rabbitmq`, etc. resolve by service name.
- **No infrastructure that's painful on a laptop.** No Kubernetes, no service mesh, no distributed tracing for MVP.
- **Dev experience.** `docker compose up` brings the whole stack up. Services run with `tsx watch` inside their containers, code is bind-mounted so saves trigger reload without rebuilding the image. The web frontend runs via Vite dev server (HMR) outside Compose during day-to-day development for the best DX, and inside Compose for the "production demo" build.

## 8. Testing

Three testing surfaces, each with its own style.

### 8.1 Unit tests (Vitest, server and client)

- Pure functions: detector formula, dig resolution, bomb chunk computation, scoring. Logic that's easy to get wrong and easy to verify exhaustively.
- Property-based tests on the detector (gauge is 0 when player faces away; gauge decreases monotonically with distance from a single item; gauge is the max over multiple items).
- State-diff builders.
- GraphQL resolvers (mocked DB).

### 8.2 Integration tests (per service)

- **Stats Consumer.** Postgres + RabbitMQ via testcontainers. Publish a `match.results` event, assert rows appear in `matches` and `player_stats`. Test idempotency by publishing the same event twice.
- **Gateway.** HTTP + WebSocket together: open WS, send intent, assert response.

### 8.3 End-to-end tests (Playwright)

A small set covering golden paths against the full Compose stack:

- Nickname entry → create private match → second browser joins via invite → both move/dig → main treasure dug → match ends → post-match score visible → leaderboard reflects result.
- Disconnect mid-match → reconnect within 10 s → continue match.
- Disconnect mid-match → fail to reconnect → opponent awarded win.

E2E runs are slow (~30 s each), so the suite stays small (~5 tests, picked carefully).

### 8.4 Game-server simulation harness

A non-browser test mode where the Game Server is driven by scripted inputs. Used to:

- Run deterministic match scenarios with a fixed `map_seed` (player A's inputs and player B's inputs are scripted; assert final state).
- Run "ghost" sims for performance — many simulated matches in parallel to verify per-tick budget stays under 33 ms.
- (Future) Replay a stored input sequence.

The harness reuses the real Game Server code, just bypasses the WebSocket. It's the cheapest way to exercise gameplay logic at integration level without browser overhead.

### 8.5 Coverage philosophy

Heavy on unit tests for the logic-dense pieces (detector, scoring, dig resolution). Thin on integration tests because they're slower and more fragile. Five-to-eight E2E tests as smoke checks on the wired-together system.

## 9. Phasing

Five phases. Each is independently shippable — the system is in a working, demonstrable state at the end of each.

### Phase 0 — Repo skeleton & infrastructure

- Monorepo with TypeScript workspaces: `services/{gateway,lobby,game,stats}`, `web/`, `packages/protocol/`.
- Docker Compose with Postgres, RabbitMQ, and stub services that just log "I'm alive."
- Shared `protocol` package with all WS message and event type definitions.
- Vite + React skeleton with the three routes wired up but empty.
- Linting, formatting, basic CI (build + lint).

*Done when:* `docker compose up` starts everything cleanly. Browser can hit `/`, `/lobby`, `/match/:id`.

### Phase 1 — Single-match vertical slice

Goal: one player joins one hardcoded match, moves around, digs, finds the treasure. No multiplayer, no lobby, no DB.

- Game Server: tick loop, procedural map generation with seed, movement resolution, dig timer, treasure placement and win check.
- Gateway: WebSocket endpoint that opens a match on connect (single hardcoded match for now), forwards intents to Game Server.
- Web: PixiJS canvas rendering map + player; basic input; HUD with score.

*Done when:* one browser can walk around, dig, find the main treasure, see the score.

### Phase 2 — Two-player real-time + detector + powerups

Goal: a complete game between two browsers, end-to-end.

- Lobby Service: create-private-match (returns invite link), join-by-link, hand-off to Game Server.
- Game Server: two players per match, all powerup logic (shovel, compass, bomb), powerup slot rules, nuggets, full scoring, full match-end.
- Detector: per-player gauge computation, server filtering (no item coords leak).
- Web: detector gauge UI, powerup slot UI, compass two-step prompt, beep audio, sprite for the other player.
- Reconnect handling.

*Done when:* two browsers play a complete match through an invite link, scores tally correctly, detector behaves correctly.

### Phase 3 — Persistence (DB + GraphQL + MQ)

Goal: matches persist; leaderboard exists.

- Stats Consumer running.
- Game Server publishes `match.lifecycle` and `match.results` to RabbitMQ on match end.
- Stats Consumer writes `matches` and updates `player_stats` (idempotent).
- GraphQL endpoint on Gateway: `leaderboard`, `player`, `recentMatches`.
- Home screen shows top-N leaderboard. Post-match modal shows updated stats.

*Done when:* a finished match shows up in the leaderboard within a couple seconds, and `recentMatches` returns it.

### Phase 4 — Public lobby & polish

- Public lobby browser (open rooms, "Create public match" button).
- Audio: beeps tied to gauge, dig sounds, bomb FX, pickup chime.
- Visual polish: dig-progress arc, bomb explosion animation, pickup sparkle, particle effects on tunnel walls.
- Empty/error states (lobby empty, match-not-found, opponent disconnected).
- Tuning pass: dig time, detector range, nugget count, faster-shovel duration, bomb radius.
- Test coverage pass.

*Done when:* the game feels good to play and the test suite is green.

### Out of scope for MVP

- OAuth or device-bound persistent identity.
- Replays from `map_seed` + recorded inputs.
- Bots or single-player practice.
- More than two players per match.
- Mobile UI / touch controls.
- Distributed deployment, Kubernetes, observability stack.
- Cosmetic customization, themes, skins.

## 10. Open questions / known tradeoffs

- **Nickname collisions / impersonation.** Stats are loose; a future identity layer (device-bound or OAuth) is cleanly addable without protocol changes.
- **Single-instance Lobby Service for MVP.** Multi-instance lobby requires Redis pub/sub for room-state fan-out; deferred until needed.
- **Exact gameplay tuning** (map size, nugget count, detector range, dig time, faster-shovel duration, bomb radius) is an explicit Phase 4 task, not locked at design time. Numbers in this doc are starting points.
