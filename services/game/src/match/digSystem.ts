import type { MapGrid } from '../map/types.js';
import { facingVec, TICK_RATE, type PlayerState } from '../physics/movement.js';

export const DIG_TIME_SEC = 0.8;
export const DIG_TICKS = Math.round(DIG_TIME_SEC * TICK_RATE); // 24

export function getDigTarget(
  player: PlayerState,
): { x: number; y: number } {
  const { dx, dy } = facingVec(player.facing);
  return {
    x: Math.floor(player.x) + dx,
    y: Math.floor(player.y) + dy,
  };
}

export function startDig(player: PlayerState, map: MapGrid): PlayerState {
  if (player.digTicksRemaining > 0) return player; // already digging

  const target = getDigTarget(player);
  if (
    target.x < 0 ||
    target.y < 0 ||
    target.x >= map.width ||
    target.y >= map.height
  ) {
    return player;
  }
  if (map.cells[target.y]![target.x] !== 'rock') return player;

  return { ...player, digTarget: target, digTicksRemaining: DIG_TICKS };
}

export function advanceDig(player: PlayerState): PlayerState {
  if (player.digTicksRemaining <= 0) return player;
  return { ...player, digTicksRemaining: player.digTicksRemaining - 1 };
}

export function isDugComplete(player: PlayerState): boolean {
  return player.digTarget !== null && player.digTicksRemaining === 0;
}
