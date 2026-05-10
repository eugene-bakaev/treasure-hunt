import { describe, expect, it } from 'vitest';
import {
  startDig,
  advanceDig,
  isDugComplete,
  DIG_TICKS,
  getDigTarget,
} from '../../src/match/digSystem.js';
import { generateMap } from '../../src/map/MapGenerator.js';
import type { PlayerState } from '../../src/physics/movement.js';

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'p1',
    x: 2.5,
    y: 2.5,
    facing: 'E',
    moveDir: null,
    digTarget: null,
    digTicksRemaining: 0,
    score: 0,
    heldPowerup: null,
    fasterShovelTicksRemaining: 0,
    ...overrides,
  };
}

describe('digSystem', () => {
  const map = generateMap('test-seed');

  describe('getDigTarget', () => {
    it('returns cell directly in front of player (facing east, at 2.5,2.5 → cell 3,2)', () => {
      const player = makePlayer({ x: 2.5, y: 2.5, facing: 'E' });
      const target = getDigTarget(player);
      // floor(2.5) = 2, +1 (east) = 3; y stays at floor(2.5)=2
      expect(target).toEqual({ x: 3, y: 2 });
    });

    it('returns cell above when facing north (at 2.5,2.5 → cell 2,1)', () => {
      const player = makePlayer({ x: 2.5, y: 2.5, facing: 'N' });
      expect(getDigTarget(player)).toEqual({ x: 2, y: 1 });
    });
  });

  describe('startDig', () => {
    it('starts dig when facing a rock cell', () => {
      // Player at (2.5,2.5) facing east; cell (3,2) is inside spawn pocket = walkable
      // Let's face south from (2.5,2.5) → target (2,3), which is still walkable
      // Face north from (1.5,1.5) → target (1,0) which is rock
      const player = makePlayer({ x: 1.5, y: 1.5, facing: 'N' });
      const after = startDig(player, map);
      expect(after.digTicksRemaining).toBe(DIG_TICKS);
      expect(after.digTarget).toEqual({ x: 1, y: 0 });
    });

    it('does not start dig if target cell is walkable', () => {
      // Player at (2.5,2.5) facing east → cell (3,2) is walkable (in spawn pocket)
      const player = makePlayer({ x: 2.5, y: 2.5, facing: 'E' });
      const after = startDig(player, map);
      expect(after.digTicksRemaining).toBe(0);
    });

    it('does not start a new dig if already digging', () => {
      const player = makePlayer({ digTicksRemaining: 10, digTarget: { x: 1, y: 0 } });
      const after = startDig(player, map);
      expect(after.digTicksRemaining).toBe(10); // unchanged
    });
  });

  describe('advanceDig', () => {
    it('decrements digTicksRemaining by 1', () => {
      const player = makePlayer({ digTicksRemaining: 10, digTarget: { x: 1, y: 0 } });
      expect(advanceDig(player).digTicksRemaining).toBe(9);
    });

    it('does nothing if not digging', () => {
      const player = makePlayer({ digTicksRemaining: 0 });
      expect(advanceDig(player).digTicksRemaining).toBe(0);
    });
  });

  describe('isDugComplete', () => {
    it('returns true when digTicksRemaining reaches 0 with a target', () => {
      const player = makePlayer({ digTicksRemaining: 0, digTarget: { x: 1, y: 0 } });
      expect(isDugComplete(player)).toBe(true);
    });

    it('returns false when still digging', () => {
      const player = makePlayer({ digTicksRemaining: 1, digTarget: { x: 1, y: 0 } });
      expect(isDugComplete(player)).toBe(false);
    });

    it('returns false when digTarget is null (never started)', () => {
      const player = makePlayer({ digTicksRemaining: 0, digTarget: null });
      expect(isDugComplete(player)).toBe(false);
    });
  });
});
