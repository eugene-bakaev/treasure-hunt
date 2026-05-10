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

  describe('bomb', () => {
    const createBombMap = (): MapGrid => {
      const map: MapGrid = {
        width: 10,
        height: 10,
        cells: Array.from({ length: 10 }, () => Array(10).fill('rock')),
        treasurePos: { x: 5, y: 5 },
        items: [],
        seed: 'test',
      };
      return map;
    };

    it('flips rock cells to walkable and emits bomb_detonate', () => {
      // player at 1.5, 1.5 facing E (facing dx: 1, dy: 0)
      // target should be (1+1, 1+0) = (2, 1)
      // 3x3 area: x from 1 to 3, y from 0 to 2
      const player = createPlayer({ heldPowerup: 'bomb', x: 1.5, y: 1.5, facing: 'E' });
      const map = createBombMap();
      const ctx = {
        player,
        map,
        buriedItems: new Map<string, ItemType>(),
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.player.heldPowerup).toBeNull();
      expect(result.cellsChanged).toHaveLength(9);
      for (let y = 0; y <= 2; y++) {
        for (let x = 1; x <= 3; x++) {
          expect(result.cellsChanged).toContainEqual({ x, y, cellType: 'walkable' });
          expect(ctx.map.cells[y][x]).toBe('walkable');
        }
      }

      expect(result.publicEvents).toContainEqual({
        type: 'bomb_detonate',
        playerId: 'p1',
        cells: expect.arrayContaining(
          Array.from({ length: 9 }).map((_, i) => ({
            x: 1 + (i % 3),
            y: Math.floor(i / 3),
          }))
        ),
      });
      expect(result.publicEvents).toContainEqual({
        type: 'powerup_activate',
        playerId: 'p1',
        powerup: 'bomb',
      });
    });

    it('auto-collects nuggets and emits pickup', () => {
      const player = createPlayer({ heldPowerup: 'bomb', x: 1.5, y: 1.5, facing: 'E', score: 0 });
      const map = createBombMap();
      const buriedItems = new Map<string, ItemType>();
      buriedItems.set('2,1', 'nugget'); // Center of 3x3

      const ctx = {
        player,
        map,
        buriedItems,
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.player.score).toBe(10);
      expect(ctx.buriedItems.has('2,1')).toBe(false);
      expect(result.publicEvents).toContainEqual({
        type: 'pickup',
        playerId: 'p1',
        itemType: 'nugget',
      });
    });

    it('moves treasure to ground items', () => {
      const player = createPlayer({ heldPowerup: 'bomb', x: 1.5, y: 1.5, facing: 'E' });
      const map = createBombMap();
      const buriedItems = new Map<string, ItemType>();
      const groundItems = new Map<string, ItemType>();
      buriedItems.set('2,1', 'treasure');

      const ctx = {
        player,
        map,
        buriedItems,
        groundItems,
      };

      activatePowerup(ctx);

      expect(ctx.buriedItems.has('2,1')).toBe(false);
      expect(ctx.groundItems.get('2,1')).toBe('treasure');
    });

    it('collects powerup if held slot is empty', () => {
      const player = createPlayer({ heldPowerup: 'bomb', x: 1.5, y: 1.5, facing: 'E' });
      const map = createBombMap();
      const buriedItems = new Map<string, ItemType>();
      buriedItems.set('2,1', 'shovel');

      const ctx = {
        player,
        map,
        buriedItems,
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      // Player used the bomb, so slot became empty, then picked up shovel
      expect(result.player.heldPowerup).toBe('shovel');
      expect(ctx.buriedItems.has('2,1')).toBe(false);
      expect(result.publicEvents).toContainEqual({
        type: 'pickup',
        playerId: 'p1',
        itemType: 'shovel',
      });
    });

    it('moves powerup to ground items if multiple powerups unearthed and slot fills up', () => {
      const player = createPlayer({ heldPowerup: 'bomb', x: 1.5, y: 1.5, facing: 'E' });
      const map = createBombMap();
      const buriedItems = new Map<string, ItemType>();
      const groundItems = new Map<string, ItemType>();
      
      // Put two powerups in the blast zone
      buriedItems.set('2,1', 'shovel');
      buriedItems.set('3,1', 'compass');

      const ctx = {
        player,
        map,
        buriedItems,
        groundItems,
      };

      const result = activatePowerup(ctx);

      expect(ctx.buriedItems.has('2,1')).toBe(false);
      expect(ctx.buriedItems.has('3,1')).toBe(false);
      
      // One should be held, one on the ground
      // Note: order is dependent on Map traversal, but we can just check conditions
      expect(result.player.heldPowerup).not.toBeNull();
      expect(result.player.heldPowerup).not.toBe('bomb'); // slot was emptied, then refilled
      expect(groundItems.size).toBe(1);

      const groundItemTypes = Array.from(groundItems.values());
      const heldPowerup = result.player.heldPowerup;      
      expect(heldPowerup === 'shovel' || heldPowerup === 'compass').toBe(true);
      expect(groundItemTypes[0] === 'shovel' || groundItemTypes[0] === 'compass').toBe(true);
      expect(groundItemTypes[0]).not.toBe(heldPowerup);
    });

    it('skips off-map cells and does not flip already walkable cells', () => {
      const player = createPlayer({ heldPowerup: 'bomb', x: 0.5, y: 0.5, facing: 'N' });
      // Target is (0, -1) which is off-map. 3x3 is x=-1..1, y=-2..0. 
      // Only (0,0), (1,0) are on-map.
      const map = createBombMap();
      map.cells[0][0] = 'walkable'; // already walkable

      const ctx = {
        player,
        map,
        buriedItems: new Map<string, ItemType>(),
        groundItems: new Map<string, ItemType>(),
      };

      const result = activatePowerup(ctx);

      expect(result.cellsChanged).toHaveLength(1);
      expect(result.cellsChanged).toContainEqual({ x: 1, y: 0, cellType: 'walkable' });
      
      expect(result.publicEvents).toContainEqual(
        expect.objectContaining({
          type: 'bomb_detonate',
          playerId: 'p1',
          cells: [{ x: 1, y: 0 }],
        })
      );
    });
  });
});
