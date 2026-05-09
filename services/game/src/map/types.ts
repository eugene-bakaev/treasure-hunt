import type { ItemType } from '@treasure-hunt/protocol';

export type CellType = 'rock' | 'walkable';

export interface MapGrid {
  width: number;
  height: number;
  cells: CellType[][];  // cells[y][x]
  treasurePos: { x: number; y: number };
  items: Array<{ x: number; y: number; item: ItemType }>;
  seed: string;
}
