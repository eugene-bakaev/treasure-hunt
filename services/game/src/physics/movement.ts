import type { Facing } from '@treasure-hunt/protocol';
import type { MapGrid } from '../map/types.js';

export interface PlayerState {
  id: string;
  x: number;         // fractional cell coordinate
  y: number;
  facing: Facing;
  moveDir: Facing | null;
  digTarget: { x: number; y: number } | null;
  digTicksRemaining: number; // 0 = not digging; starts at DIG_TICKS on dig start
  score: number;
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
  fasterShovelTicksRemaining: number;
  treasuresFound: number;
  nuggetsFound: number;
}

export const MOVE_SPEED = 4;   // cells per second
export const TICK_RATE = 30;   // Hz
export const MOVE_PER_TICK = MOVE_SPEED / TICK_RATE;

const FACING_VEC: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

export function facingVec(facing: Facing): { dx: number; dy: number } {
  return FACING_VEC[facing];
}

function isWalkable(map: MapGrid, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return false;
  return map.cells[cy]![cx] === 'walkable';
}

export function applyMovement(player: PlayerState, map: MapGrid): PlayerState {
  if (!player.moveDir) return player;

  const { dx, dy } = FACING_VEC[player.moveDir];
  const nx = player.x + dx * MOVE_PER_TICK;
  const ny = player.y + dy * MOVE_PER_TICK;

  // Check if the cell the player's center would enter is walkable
  const cellX = Math.floor(nx);
  const cellY = Math.floor(ny);

  if (!isWalkable(map, cellX, cellY)) {
    // Update facing but don't move
    return { ...player, facing: player.moveDir };
  }

  return { ...player, x: nx, y: ny, facing: player.moveDir };
}
