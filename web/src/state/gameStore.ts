import { create } from 'zustand';
import type {
  CellType,
  ServerMessage,
  PlayerSnapshot,
} from '@treasure-hunt/protocol';

interface GameState {
  matchId: string | null;
  playerId: string | null;
  mapWidth: number;
  mapHeight: number;
  cells: Map<string, CellType>;   // key = `${x},${y}`
  players: PlayerSnapshot[];
  detector: number;
  score: number;
  matchEnded: boolean;
  winnerId: string | null;
}

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
}));

export function initFromServerMsg(
  msg: Extract<ServerMessage, { type: 'init' }>,
): void {
  const cells = new Map<string, CellType>();
  // Initialise all cells as rock, then set walkable ones
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
    const myPlayer = diff.players.find((p: PlayerSnapshot) => p.id === myPlayerId);
    const score = myPlayer?.score ?? prev.score;

    for (const event of diff.events) {
      if (event.type === 'match_end') {
        matchEnded = true;
        winnerId = event.winnerId;
      }
    }

    return {
      cells,
      players: diff.players,
      detector: diff.detector,
      score,
      matchEnded,
      winnerId,
    };
  });
}
