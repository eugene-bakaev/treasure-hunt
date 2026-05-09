export type CellType = 'rock' | 'walkable';

export interface MapGrid {
  width: number;
  height: number;
  cells: CellType[][];  // cells[y][x]
  treasurePos: { x: number; y: number };
  seed: string;
}
