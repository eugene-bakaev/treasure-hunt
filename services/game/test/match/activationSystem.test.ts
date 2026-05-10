import { describe, it, expect } from 'vitest';
import { activatePowerup, FASTER_SHOVEL_TICKS } from '../../src/match/activationSystem.js';
import { PlayerState } from '../../src/physics/movement.js';
import { MapGrid } from '../../src/map/types.js';
import { ItemType } from '@treasure-hunt/protocol';

describe('activationSystem', () => {
  const mockMap: MapGrid = {
    width: 10,
    height: 10,
    cells: Array.from({ length: 10 }, () => Array(10).fill('walkable')),
    treasurePos: { x: 5, y: 5 },
    items: [],
    seed: 'test',
  };

  const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
    id: 'p1',
    x: 1.5,
    y: 1.5,
    facing: 'E',
    moveDir: null,
    digTarget: null,
    digTicksRemaining: 0,
    score: 0,
    heldPowerup: null,
    fasterShovelTicksRemaining: 0,
    ...overrides,
  });

  describe('shovel', () => {
    it('activates shovel if not already active', () => {
      const player = createPlayer({ heldPowerup: 'shovel' });
      const ctx = {
        player,
        map: mockMap,
        buriedItems: new Map<string, ItemType>(),
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.player.heldPowerup).toBeNull();
      expect(result.player.fasterShovelTicksRemaining).toBe(FASTER_SHOVEL_TICKS);
      expect(result.publicEvents).toContainEqual({
        type: 'powerup_activate',
        playerId: 'p1',
        powerup: 'shovel',
      });
    });

    it('does not activate shovel if already active', () => {
      const player = createPlayer({
        heldPowerup: 'shovel',
        fasterShovelTicksRemaining: 100,
      });
      const ctx = {
        player,
        map: mockMap,
        buriedItems: new Map<string, ItemType>(),
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.player.heldPowerup).toBe('shovel');
      expect(result.player.fasterShovelTicksRemaining).toBe(100);
      expect(result.publicEvents).toHaveLength(0);
    });

    it('does not activate if no powerup held', () => {
        const player = createPlayer({ heldPowerup: null });
        const ctx = {
          player,
          map: mockMap,
          buriedItems: new Map<string, ItemType>(),
          groundItems: new Map<string, ItemType>(),
        };
  
        const result = activatePowerup(ctx);
  
        expect(result.player.heldPowerup).toBeNull();
        expect(result.publicEvents).toHaveLength(0);
      });
  });

  describe('compass', () => {
    it('returns no_target when no buried items exist', () => {
      const player = createPlayer({ heldPowerup: 'compass', x: 1.5, y: 1.5 });
      const ctx = {
        player,
        map: mockMap,
        buriedItems: new Map<string, ItemType>(),
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.privateEvents).toContainEqual({
        type: 'compass_result',
        playerId: 'p1',
        result: { kind: 'no_target' },
      });
    });

    it('returns direction to nearest treasure', () => {
      const player = createPlayer({ heldPowerup: 'compass', x: 1.5, y: 1.5 });
      const buriedItems = new Map<string, ItemType>();
      buriedItems.set('4,4', 'treasure');
      buriedItems.set('10,10', 'nugget'); // further away

      const ctx = {
        player,
        map: mockMap,
        buriedItems,
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      // Using cell centers (4.5, 4.5)
      const expectedAngle = Math.atan2(4.5 - 1.5, 4.5 - 1.5);
      expect(result.privateEvents).toContainEqual({
        type: 'compass_result',
        playerId: 'p1',
        result: { kind: 'direction', angleRad: expectedAngle },
      });
    });

    it('returns exact location for nearest nugget or powerup', () => {
      const player = createPlayer({ heldPowerup: 'compass', x: 1.5, y: 1.5 });
      const buriedItems = new Map<string, ItemType>();
      buriedItems.set('2,2', 'nugget');
      buriedItems.set('10,10', 'treasure'); // further away

      const ctx = {
        player,
        map: mockMap,
        buriedItems,
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.privateEvents).toContainEqual({
        type: 'compass_result',
        playerId: 'p1',
        result: { kind: 'exact', x: 2, y: 2, itemType: 'nugget' },
      });
    });

    it('handles tiebreaking: lowest x, then lowest y', () => {
      const player = createPlayer({ heldPowerup: 'compass', x: 5.5, y: 5.5 });
      const buriedItems = new Map<string, ItemType>();
      // All at same distance from center (5.5, 5.5)
      buriedItems.set('4,4', 'nugget');
      buriedItems.set('4,6', 'shovel');
      buriedItems.set('6,4', 'compass');
      buriedItems.set('6,6', 'bomb');

      const ctx = {
        player,
        map: mockMap,
        buriedItems,
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      // (4,4) has lowest x, and among those with x=4, (4,4) has lowest y
      expect(result.privateEvents).toContainEqual({
        type: 'compass_result',
        playerId: 'p1',
        result: { kind: 'exact', x: 4, y: 4, itemType: 'nugget' },
      });
    });
  });
});
