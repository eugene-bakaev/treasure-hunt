import { describe, expect, it } from 'vitest';
import { applyMovement, MOVE_PER_TICK, type PlayerState } from '../../src/physics/movement.js';
import { generateMap } from '../../src/map/MapGenerator.js';

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
    ...overrides,
  };
}

describe('applyMovement', () => {
  const map = generateMap('test-seed');

  it('moves east by MOVE_PER_TICK when facing east into walkable cell', () => {
    // spawn pocket is walkable at x=1..3, y=1..3; player at (2.5, 2.5) moving east
    // (3.5, 2.5) would be outside pocket but let's move just a tick
    const player = makePlayer({ x: 2.0, y: 2.5, facing: 'E', moveDir: 'E' });
    const next = applyMovement(player, map);
    expect(next.x).toBeCloseTo(2.0 + MOVE_PER_TICK);
    expect(next.y).toBeCloseTo(2.5);
    expect(next.facing).toBe('E');
  });

  it('updates facing without moving when destination is rock', () => {
    // Player at (1.05, 2.5) trying to move west into cell x=0 which is rock
    const player = makePlayer({ x: 1.05, y: 2.5, facing: 'E', moveDir: 'W' });
    const next = applyMovement(player, map);
    expect(next.x).toBeCloseTo(1.05); // didn't move
    expect(next.facing).toBe('W');   // facing updated
  });

  it('does not move when moveDir is null', () => {
    const player = makePlayer({ x: 2.5, y: 2.5, moveDir: null });
    const next = applyMovement(player, map);
    expect(next.x).toBe(2.5);
    expect(next.y).toBe(2.5);
  });
});
