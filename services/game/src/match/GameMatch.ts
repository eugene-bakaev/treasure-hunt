import type {
  ClientMessage,
  CellChange,
  PlayerSnapshot,
  MatchEvent,
  ServerMessage,
  GameToGatewayMsg,
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

interface BuriedItem {
  x: number;
  y: number;
  id: 'treasure';
}

export class GameMatch {
  private readonly matchId: string;
  private readonly map: MapGrid;
  private readonly players = new Map<string, PlayerState>();
  private readonly intentQueues = new Map<string, ClientMessage[]>();
  private buriedItems: BuriedItem[];
  private tick = 0;
  private ended = false;
  private emit: MatchEventEmitter;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(matchId: string, seed: string, emit: MatchEventEmitter) {
    this.matchId = matchId;
    this.map = generateMap(seed);
    this.emit = emit;
    this.buriedItems = [{ ...this.map.treasurePos, id: 'treasure' }];
  }

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
        this.map.cells[ty]![tx] = 'walkable';
        cellsChanged.push({ x: tx, y: ty, cellType: 'walkable' });

        // Check if treasure was buried here
        const treasureIdx = this.buriedItems.findIndex(
          (item) => item.x === tx && item.y === ty,
        );
        if (treasureIdx >= 0) {
          this.buriedItems.splice(treasureIdx, 1);
          state = { ...state, score: state.score + 100 };
          events.push({ type: 'pickup', playerId, itemType: 'treasure' });
          events.push({
            type: 'match_end',
            winnerId: playerId,
            scores: { [playerId]: state.score },
          });
          this.ended = true;
        }

        state = { ...state, digTarget: null };
      }

      // Apply movement (only if not digging)
      if (state.digTicksRemaining === 0) {
        state = applyMovement(state, this.map);
      }

      this.players.set(playerId, state);
    }

    // Build and emit a state diff for each player
    for (const [playerId, player] of this.players) {
      const detector = computeDetector(player, this.buriedItems);
      const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        facing: p.facing,
        digProgress: p.digTarget !== null ? 1 - p.digTicksRemaining / DIG_TICKS : -1,
        score: p.score,
      }));

      const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
        type: 'state_diff',
        tick: this.tick,
        cellsChanged,
        players,
        detector,
        events,
      };
      this.emit({ type: 'player_diff', playerId, diff });
    }

    if (this.ended) this.stop();
  }
}
