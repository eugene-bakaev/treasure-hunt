import { PlayerState } from '../physics/movement.js';
import { MapGrid } from '../map/types.js';
import { ItemType, CellChange, MatchEvent, CompassResult } from '@treasure-hunt/protocol';

export const FASTER_SHOVEL_TICKS = 450;

export interface ActivationContext {
  player: PlayerState;
  map: MapGrid;
  buriedItems: Map<string, ItemType>;
  groundItems: Map<string, ItemType>;
}

export interface ActivationResult {
  player: PlayerState;
  cellsChanged: CellChange[];
  publicEvents: MatchEvent[];
  privateEvents: MatchEvent[];
}

export function activatePowerup(ctx: ActivationContext): ActivationResult {
  const { player } = ctx;
  const cellsChanged: CellChange[] = [];
  const publicEvents: MatchEvent[] = [];
  const privateEvents: MatchEvent[] = [];

  if (player.heldPowerup === 'shovel') {
    if (player.fasterShovelTicksRemaining === 0) {
      return {
        player: {
          ...player,
          heldPowerup: null,
          fasterShovelTicksRemaining: FASTER_SHOVEL_TICKS,
        },
        cellsChanged,
        publicEvents: [
          {
            type: 'powerup_activate',
            playerId: player.id,
            powerup: 'shovel',
          },
        ],
        privateEvents,
      };
    }
  }

  if (player.heldPowerup === 'compass') {
    const nearest = findNearestBuriedItem(player.x, player.y, ctx.buriedItems);

    let result: CompassResult;
    if (!nearest) {
      result = { kind: 'no_target' };
    } else if (nearest.itemType === 'treasure') {
      result = {
        kind: 'direction',
        angleRad: Math.atan2(nearest.y + 0.5 - player.y, nearest.x + 0.5 - player.x),
      };
    } else {
      result = {
        kind: 'exact',
        x: nearest.x,
        y: nearest.y,
        itemType: nearest.itemType,
      };
    }

    return {
      player: {
        ...player,
        heldPowerup: null,
      },
      cellsChanged,
      publicEvents: [
        {
          type: 'powerup_activate',
          playerId: player.id,
          powerup: 'compass',
        },
      ],
      privateEvents: [
        {
          type: 'compass_result',
          playerId: player.id,
          result,
        },
      ],
    };
  }

  return {
    player,
    cellsChanged,
    publicEvents,
    privateEvents,
  };
}

function findNearestBuriedItem(
  px: number,
  py: number,
  buriedItems: Map<string, ItemType>,
): { x: number; y: number; itemType: ItemType } | null {
  let nearest: { x: number; y: number; itemType: ItemType } | null = null;
  let minDistanceSq = Infinity;

  for (const [key, itemType] of buriedItems.entries()) {
    const [sx, sy] = key.split(',');
    const x = parseInt(sx!, 10);
    const y = parseInt(sy!, 10);

    const dx = x + 0.5 - px;
    const dy = y + 0.5 - py;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq < minDistanceSq - 0.000001) {
      minDistanceSq = distanceSq;
      nearest = { x, y, itemType };
    } else if (Math.abs(distanceSq - minDistanceSq) < 0.000001) {
      // Tiebreak: lowest x, then lowest y
      if (!nearest || x < nearest.x || (x === nearest.x && y < nearest.y)) {
        nearest = { x, y, itemType };
      }
    }
  }

  return nearest;
}
