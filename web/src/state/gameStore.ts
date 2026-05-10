import { create } from 'zustand';
import type {
  CellType,
  CellChange,
  ServerMessage,
  PlayerSnapshot,
  ItemType,
  PlayerBuffs,
  CompassResult,
} from '@treasure-hunt/protocol';

export type StoredCompassResult = Exclude<CompassResult, { kind: 'no_target' }> & {
  expiresAtMs: number;
};

interface GameState {
  matchId: string | null;
  playerId: string | null;
  mapWidth: number;
  mapHeight: number;
  cells: Map<string, CellType>;   // key = `${x},${y}`
  lastCellsChanged: CellChange[];
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

const defaultBuffs: PlayerBuffs = {
  fasterShovelTicksRemaining: 0,
};

export const useGameStore = create<GameState>()(() => ({
  matchId: null,
  playerId: null,
  mapWidth: 0,
  mapHeight: 0,
  cells: new Map(),
  lastCellsChanged: [],
  players: [],
  detector: 0,
  score: 0,
  matchEnded: false,
  winnerId: null,
  groundItems: [],
  heldPowerup: null,
  buffs: defaultBuffs,
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
    lastCellsChanged: [],
    players: [],
    detector: 0,
    score: 0,
    matchEnded: false,
    winnerId: null,
    groundItems: [],
    heldPowerup: null,
    buffs: defaultBuffs,
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
        if (event.result.kind !== 'no_target') {
          compassResult = {
            ...event.result,
            expiresAtMs: Date.now() + 5000,
          };
        }
      }
    }

    return {
      cells,
      lastCellsChanged: diff.cellsChanged,
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
