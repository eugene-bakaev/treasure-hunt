// Shared types for WebSocket messages and the internal Gateway↔GameServer protocol.

export type Facing = 'N' | 'S' | 'E' | 'W';
export type CellType = 'rock' | 'walkable';
export type ItemType = 'treasure' | 'nugget' | 'shovel' | 'compass' | 'bomb';

// --- Browser → Gateway → Game Server ---

export type ClientMessage =
  | { type: 'move'; dir: Facing }
  | { type: 'stop' }
  | { type: 'dig' }
  | { type: 'activate' };

// --- Game Server → Gateway → Browser ---

export interface CellChange {
  x: number;
  y: number;
  cellType: CellType;
}

export interface PlayerBuffs {
  fasterShovelTicksRemaining: number;
}

export type PowerupType = Exclude<ItemType, 'treasure' | 'nugget'>;

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  digProgress: number; // 0–1; negative means not digging
  score: number;
  heldPowerup: PowerupType | null;
  buffs: PlayerBuffs;
}

export type CompassResult =
  | { kind: 'exact'; x: number; y: number; itemType: ItemType }
  | { kind: 'direction'; angleRad: number }
  | { kind: 'no_target' };

export type MatchEvent =
  | { type: 'match_end'; winnerId: string; scores: Record<string, number> }
  | { type: 'pickup'; playerId: string; itemType: ItemType }
  | { type: 'powerup_activate'; playerId: string; powerup: PowerupType }
  | { type: 'compass_result'; playerId: string; result: CompassResult }
  | { type: 'bomb_detonate'; playerId: string; cells: Array<{ x: number; y: number }> };

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
  | { type: 'player_join'; matchId: string; playerId: string; nickname: string }
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

export interface MatchPlayerResult {
  playerId: string;
  nickname: string;
  score: number;
  treasuresFound: number;
  nuggetsFound: number;
}

export interface MatchResultsMsg {
  matchId: string;
  startedAt: string; // ISO
  endedAt: string;   // ISO
  durationSec: number;
  mapSeed: string;
  winnerId: string | null;
  playerA: MatchPlayerResult;
  playerB: MatchPlayerResult;
  endReason: string;
}
