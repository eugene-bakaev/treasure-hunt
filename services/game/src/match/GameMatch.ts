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
import { activatePowerup } from './activationSystem.js';

export type MatchEventEmitter = (msg: GameToGatewayMsg) => void;

type PowerupItemType = Exclude<ItemType, 'treasure' | 'nugget'>;

function isPowerup(item: ItemType): item is PowerupItemType {
  return item !== 'treasure' && item !== 'nugget';
}

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
      fasterShovelTicksRemaining: 0,
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
    const playerPrivateEvents = new Map<string, MatchEvent[]>();

    // Snapshot ground items at the start of the tick (before pickups modify the map)
    const groundItemsArray = [...this.groundItems.entries()].map(([key, item]) => {
      const [xs, ys] = key.split(',');
      return { x: Number(xs), y: Number(ys), item };
    });

    for (const [playerId, player] of this.players) {
      const queue = this.intentQueues.get(playerId) ?? [];
      this.intentQueues.set(playerId, []);
      playerPrivateEvents.set(playerId, []);

      let state = player;

      // Drain intents — Pass 1: Powerup Activations
      for (const intent of queue) {
        if (intent.type === 'activate') {
          const result = activatePowerup({
            player: state,
            map: this.map,
            buriedItems: this.buriedItems,
            groundItems: this.groundItems,
          });
          state = result.player;
          cellsChanged.push(...result.cellsChanged);
          events.push(...result.publicEvents);
          playerPrivateEvents.get(playerId)!.push(...result.privateEvents);
        }
      }

      // Drain intents — Pass 2: Movement and Digging
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
          } else if (isPowerup(buried)) {
            // powerup: shovel | compass | bomb
            if (state.heldPowerup === null) {
              state = { ...state, heldPowerup: buried };
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

      // Decrement buffs
      if (state.fasterShovelTicksRemaining > 0) {
        state = {
          ...state,
          fasterShovelTicksRemaining: state.fasterShovelTicksRemaining - 1,
        };
      }

      // Ground pickup
      const groundKey = `${Math.floor(state.x)},${Math.floor(state.y)}`;
      const groundItem = this.groundItems.get(groundKey);
      if (groundItem !== undefined) {
        if (groundItem === 'nugget') {
          state = { ...state, score: state.score + 10 };
          this.groundItems.delete(groundKey);
          events.push({ type: 'pickup', playerId, itemType: 'nugget' });
        } else if (isPowerup(groundItem) && state.heldPowerup === null) {
          state = { ...state, heldPowerup: groundItem };
          this.groundItems.delete(groundKey);
          events.push({ type: 'pickup', playerId, itemType: groundItem });
        }
        // else: full slot — leave item in groundItems
      }

      this.players.set(playerId, state);
    }

    // Build and emit a state diff for each player
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
        buffs: {
          fasterShovelTicksRemaining: p.fasterShovelTicksRemaining,
        },
      }));

      const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
        type: 'state_diff',
        tick: this.tick,
        cellsChanged,
        players,
        detector,
        events: [...events, ...(playerPrivateEvents.get(playerId) ?? [])],
        groundItems: groundItemsArray,
      };
      this.emit({ type: 'player_diff', playerId, diff });
    }

    if (this.ended) this.stop();
  }
}
