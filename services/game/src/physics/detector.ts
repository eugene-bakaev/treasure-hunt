import type { Facing } from '@treasure-hunt/protocol';
import { facingVec } from './movement.js';

const DETECTOR_RANGE = 12; // cells

export function computeDetector(
  player: { x: number; y: number; facing: Facing },
  buriedItems: ReadonlyArray<{ x: number; y: number }>,
): number {
  let max = 0;
  const { dx: fx, dy: fy } = facingVec(player.facing);

  for (const item of buriedItems) {
    const dx = item.x + 0.5 - player.x; // item center relative to player
    const dy = item.y + 0.5 - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    const distanceFactor = Math.max(0, 1 - d / DETECTOR_RANGE);

    let directionFactor: number;
    if (d < 0.001) {
      directionFactor = 1; // standing on it → max signal
    } else {
      // cos(bearing) = dot product of unit-item-vector and facing vector
      directionFactor = Math.max(0, (dx * fx + dy * fy) / d);
    }

    const signal = 100 * distanceFactor * directionFactor;
    if (signal > max) max = signal;
  }

  return Math.round(max);
}
