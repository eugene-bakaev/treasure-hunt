# Phase 2a — Two-Player Match Design

**Goal:** Two browsers play the same match end-to-end via a private invite link. Both players see each other move in real time. The game starts when both are connected.

**Scope:** Lobby service (join codes), multi-match Game Server, second spawn pocket, frontend invite/join/waiting flow. No powerups, no nuggets, no reconnect — those are Phase 2b–2d.

---

## 1. Invite Flow

1. Player 1 clicks **Create Match** → `POST lobby:3001/match` → `{ matchId, joinCode }`
2. Browser navigates to `/match/:matchId` (joinCode passed in router state)
3. Match screen shows **"Waiting for opponent…"** overlay + shareable link: `{origin}/join/{joinCode}`
4. Player 2 opens the link → `/join/:joinCode` → `GET lobby:3001/match/join/:joinCode` → `{ matchId }` → navigates to `/match/:matchId`
5. Both browsers connect via `ws://gateway:3000/ws?matchId=:matchId`
6. Gateway parses `matchId` from the upgrade URL, includes it in every message to the Game Server
7. Game Server creates the `GameMatch` lazily on the first `player_join`. When the **second** player joins, it sends `init` to both players simultaneously and starts the 30 Hz tick loop
8. Both screens drop the overlay and gameplay begins

---

## 2. Lobby Service (`services/lobby`)

### Endpoints

```
POST /match
  Body: (none)
  Response: { matchId: string, joinCode: string }
  Creates a match record. joinCode is 6 uppercase alphanumeric chars.

GET /match/join/:joinCode
  Response: { matchId: string }
  404 if joinCode unknown
```

### Match record (in-memory)

```ts
interface MatchRecord {
  matchId: string;   // uuid
  joinCode: string;  // 6-char uppercase alphanumeric
  createdAt: Date;
}
```

No status field needed — the Game Server owns runtime state. The lobby only resolves join codes to match IDs.

### CORS

Open for all origins (localhost dev + Docker). Both `:3001` and `:3000` ports are exposed.

### Join code generation

```ts
function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
```

---

## 3. Protocol (`packages/protocol/src/messages.ts`)

Add `matchId` to all three `GatewayToGameMsg` variants:

```ts
export type GatewayToGameMsg =
  | { type: 'player_join';   matchId: string; playerId: string }
  | { type: 'player_leave';  matchId: string; playerId: string }
  | { type: 'player_intent'; matchId: string; playerId: string; intent: ClientMessage };
```

All other types (`ServerMessage`, `PlayerSnapshot`, `MatchEvent`, `GameToGatewayMsg`) are unchanged. The `state_diff` already carries all players in its `players` array — each client distinguishes itself from the opponent using the `playerId` it received in `init`.

---

## 4. Game Server (`services/game`)

### `GameWsServer` — multi-match

Replace the single `GameMatch` field with a `Map<string, GameMatch>`:

```ts
private matches = new Map<string, GameMatch>();

private getOrCreateMatch(matchId: string): GameMatch {
  if (!this.matches.has(matchId)) {
    const seed = process.env['MATCH_SEED'] ?? uuidv4();
    const match = new GameMatch(matchId, seed, (msg) => this.broadcast(msg));
    this.matches.set(matchId, match);
  }
  return this.matches.get(matchId)!;
}
```

On `player_join`: call `getOrCreateMatch(matchId).addPlayer(playerId)` — silently ignore if match already has 2 players.
On `player_leave`: route to the correct match by matchId.
On `player_intent`: route to the correct match by matchId.

Matches are never deleted from the map for Phase 2a (memory is fine at MVP scale).

### `GameMatch` — deferred start

`addPlayer()` no longer sends `init` or calls `start()` immediately:

```ts
addPlayer(playerId: string): void {
  if (this.players.size >= 2) return; // cap at 2
  const spawn = this.players.size === 0 ? { x: 2.5, y: 2.5 } : { x: 37.5, y: 37.5 };
  this.players.set(playerId, {
    id: playerId, ...spawn,
    facing: 'E', moveDir: null,
    digTarget: null, digTicksRemaining: 0, score: 0,
  });
  this.intentQueues.set(playerId, []);

  if (this.players.size === 2) {
    // Both players present — send init to each and start the tick loop
    for (const [pid] of this.players) {
      this.emitInit(pid);
    }
    this.start();
  }
}
```

While waiting for the second player, no `init` is sent and the tick loop is not running. The client Match screen stays in "Waiting…" state (gated on `playerId === null` in the Zustand store).

### Spawn positions

Player join order determines spawn:
- **1st player**: (2.5, 2.5) — top-left pocket (cells 1–3, 1–3)
- **2nd player**: (37.5, 37.5) — bottom-right pocket (cells 36–38, 36–38)

### `MapGenerator` — second spawn pocket

Add a second 3×3 walkable pocket at cells (36, 36) to (38, 38).

Update treasure placement: require ≥15 cells from **both** spawn centers — (2, 2) and (37, 37). This naturally forces the treasure into the middle half of the map.

```ts
function distFromSpawns(x: number, y: number): number {
  const d1 = Math.hypot(x - 2, y - 2);
  const d2 = Math.hypot(x - 37, y - 37);
  return Math.min(d1, d2);
}
// treasure candidate valid if distFromSpawns(x, y) >= 15
```

---

## 5. Gateway (`services/gateway`)

One change in `clientHandler.ts`: parse `matchId` from the WebSocket upgrade request URL.

```ts
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'ws://x');
  const matchId = url.searchParams.get('matchId') ?? 'dev';
  const playerId = uuidv4();
  clients.set(playerId, ws);

  proxy.send({ type: 'player_join', matchId, playerId });

  ws.on('message', (data) => {
    const intent = JSON.parse(data.toString()) as ClientMessage;
    proxy.send({ type: 'player_intent', matchId, playerId, intent });
  });

  ws.on('close', () => {
    clients.delete(playerId);
    proxy.send({ type: 'player_leave', matchId, playerId });
  });
});
```

Fallback to `'dev'` preserves backward compatibility during the transition.

---

## 6. Frontend (`web`)

### New files
- `web/src/screens/Join.tsx` — join-by-code screen
- `web/src/net/lobby.ts` — Lobby API calls (`createMatch`, `joinMatch`)

### Modified files
- `web/src/App.tsx` — add `/join/:joinCode` route
- `web/src/screens/Home.tsx` — "Create Match" button
- `web/src/screens/Match.tsx` — waiting overlay + invite link
- `web/src/net/socket.ts` — accept `matchId` param, append `?matchId=` to WS URL
- `web/.env.example` — document `VITE_LOBBY_URL`

### `lobby.ts`

```ts
const LOBBY_URL = (import.meta.env as Record<string, string | undefined>)['VITE_LOBBY_URL']
  ?? 'http://localhost:3001';

export async function createMatch(): Promise<{ matchId: string; joinCode: string }> {
  const res = await fetch(`${LOBBY_URL}/match`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create match');
  return res.json() as Promise<{ matchId: string; joinCode: string }>;
}

export async function joinMatch(joinCode: string): Promise<{ matchId: string }> {
  const res = await fetch(`${LOBBY_URL}/match/join/${joinCode}`);
  if (!res.ok) throw new Error('Invalid invite link');
  return res.json() as Promise<{ matchId: string }>;
}
```

### `Home.tsx`

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

### `Join.tsx`

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

  if (error) return <main><p style={{ color: '#f88' }}>{error}</p></main>;
  return <main><p style={{ color: '#eee' }}>Joining…</p></main>;
}
```

### `Match.tsx` — waiting overlay

Add to the top of the returned JSX, before the game div, conditional on `playerId === null`:

```tsx
const joinCode = (location.state as { joinCode?: string } | null)?.joinCode;
const inviteUrl = joinCode ? `${window.location.origin}/join/${joinCode}` : null;

if (playerId === null) {
  return (
    <main style={{ color: '#eee', padding: '2rem', textAlign: 'center' }}>
      <h2>Waiting for opponent…</h2>
      {inviteUrl && (
        <>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#aaa' }}>
            Share this link:
          </p>
          <code style={{ display: 'block', margin: '0.5rem auto', padding: '0.5rem 1rem',
            background: '#222', borderRadius: '4px', maxWidth: '480px', wordBreak: 'break-all' }}>
            {inviteUrl}
          </code>
          <button
            onClick={() => { void navigator.clipboard.writeText(inviteUrl); }}
            style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', cursor: 'pointer',
              background: '#444', color: '#eee', border: 'none', borderRadius: '4px' }}
          >
            Copy
          </button>
        </>
      )}
    </main>
  );
}
```

`useLocation` imported from `react-router-dom` to access `location.state`. Add `const location = useLocation();` at the top of `Match()`, alongside the existing `useParams` and `useNavigate` calls.

### `socket.ts`

Export `connect` accepts a `matchId` parameter:

```ts
export function connect(matchId: string): void {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;
  const socket = new WebSocket(`${WS_URL}?matchId=${encodeURIComponent(matchId)}`);
  ws = socket;
  // ... rest unchanged
}
```

`Match.tsx` passes `id` (from `useParams`) to `connect(id!)`.

### `App.tsx`

```tsx
<Route path="/join/:joinCode" element={<Join />} />
```

---

## 7. Testing

### Lobby unit tests (`services/lobby/test/`)
- `POST /match` returns `{ matchId, joinCode }` with correct shapes
- `GET /match/join/:joinCode` returns `{ matchId }` for a known code
- `GET /match/join/UNKNOWN` returns 404

### Game Server unit tests
- `GameMatch` with two players: first `addPlayer` does not emit init; second does
- `GameMatch` rejects a third player
- `MapGenerator` second spawn pocket cells are walkable
- Treasure placement satisfies ≥15 cells from both spawn centers

### Gateway integration test
- WS connection with `?matchId=test` → `player_join` forwarded with `matchId: 'test'`

### Web unit tests
- `Join` screen: shows "Joining…", navigates to `/match/:id` on success, shows error on 404
- `Home` screen: "Create Match" button calls `createMatch`, navigates on success
- `Match` screen: shows waiting overlay when `playerId === null`; drops overlay when store has playerId

---

## 8. Done criteria

Phase 2a is complete when:
1. Player 1 creates a match and sees the invite link
2. Player 2 opens the invite link and both browsers transition to gameplay simultaneously
3. Both players see each other's yellow dot moving in real time
4. One player finds the treasure → both screens show the correct winner/loser result → both redirect home after 4 seconds
5. All unit tests pass; `pnpm build` succeeds
