# RabbitMQ Results Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement RabbitMQ publishing of match results from the game service.

**Architecture:** Create a `RabbitMQPublisher` in the game service. Update `GameMatch` to track player nicknames, match start time, and collection stats. When a match ends, `GameMatch` calls a callback that uses the publisher to send results to the `match.results` queue.

**Tech Stack:** TypeScript, RabbitMQ (amqplib), Vitest.

---

### Task 1: Update PlayerState and collection stats

**Files:**
- Modify: `services/game/src/physics/movement.ts`
- Modify: `services/game/src/match/GameMatch.ts`

- [ ] **Step 1: Update PlayerState in movement.ts**

```typescript
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
  treasuresFound: number;
  nuggetsFound: number;
}
```

- [ ] **Step 2: Update Player initialization and collection in GameMatch.ts**

Initialize `treasuresFound: 0` and `nuggetsFound: 0` in `addPlayer`.
Increment them in `tickOnce` when items are collected.

### Task 2: Implement RabbitMQPublisher

**Files:**
- Create: `services/game/src/rabbitmq/publisher.ts`
- Create: `services/game/test/rabbitmq/publisher.test.ts`

- [ ] **Step 1: Create RabbitMQPublisher**

```typescript
import amqp from 'amqplib';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';

export class RabbitMQPublisher {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly url: string;
  private readonly queueName = 'match.results';

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(this.queueName, { durable: true });
  }

  publishResults(results: MatchResultsMsg): void {
    if (!this.channel) {
      console.error('RabbitMQ channel not initialized');
      return;
    }
    const payload = Buffer.from(JSON.stringify(results));
    this.channel.sendToQueue(this.queueName, payload, { persistent: true });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}
```

- [ ] **Step 2: Create unit test for publisher**

Use `vi.mock('amqplib')` to verify it calls `connect`, `createChannel`, `assertQueue`, and `sendToQueue`.

### Task 3: Update GameMatch for results tracking

**Files:**
- Modify: `services/game/src/match/GameMatch.ts`

- [ ] **Step 1: Update GameMatch constructor and fields**

Add `nicknames`, `startedAt`, and `onMatchResults` callback.

```typescript
export type MatchResultsCallback = (results: MatchResultsMsg) => void;

export class GameMatch {
  private readonly nicknames = new Map<string, string>();
  private startedAt = 0;
  private onMatchResults: MatchResultsCallback;
  // ...
  constructor(matchId: string, seed: string, emit: MatchEventEmitter, onMatchResults: MatchResultsCallback) {
    this.onMatchResults = onMatchResults;
    // ...
  }
}
```

- [ ] **Step 2: Update addPlayer to accept nickname**

```typescript
  addPlayer(playerId: string, nickname: string): void {
    this.nicknames.set(playerId, nickname);
    // ...
```

- [ ] **Step 3: Update start() to record startedAt**

```typescript
  start(): void {
    if (this.intervalHandle !== null) return;
    this.startedAt = Date.now();
    this.intervalHandle = setInterval(() => this.tickOnce(), 1000 / 30);
  }
```

- [ ] **Step 4: Implement _publishResults and call it in tickOnce**

```typescript
  private _publishResults(): void {
    const durationSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const players: MatchPlayerResult[] = [...this.players.values()].map(p => ({
      playerId: p.id,
      nickname: this.nicknames.get(p.id) ?? 'Unknown',
      score: p.score,
      treasuresFound: p.treasuresFound,
      nuggetsFound: p.nuggetsFound,
    }));

    this.onMatchResults({
      matchId: this.matchId,
      durationSeconds,
      players,
    });
  }
```

Call it when `this.ended` becomes true in `tickOnce`.

### Task 4: Wire up everything in WsServer and Index

**Files:**
- Modify: `services/game/src/ws/GameWsServer.ts`
- Modify: `services/game/src/index.ts`

- [ ] **Step 1: Update GameWsServer to take result callback**

Update constructor and `getOrCreateMatch`.

- [ ] **Step 2: Update index.ts to initialize RabbitMQPublisher**

Connect to `process.env['RABBITMQ_URL'] ?? 'amqp://localhost'`.

### Task 5: Verification

- [ ] **Step 1: Run all tests in game service**
- [ ] **Step 2: Fix any test failures in GameMatch.test.ts due to signature changes**
