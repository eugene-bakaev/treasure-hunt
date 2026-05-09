import type { CellType } from './types.js';
import type { MapGrid } from './types.js';

const MAP_WIDTH = 40;
const MAP_HEIGHT = 40;
const SPAWN1_CENTER_X = 2;
const SPAWN1_CENTER_Y = 2;
const SPAWN2_CENTER_X = 37;
const SPAWN2_CENTER_Y = 37;
const MIN_TREASURE_DIST = 15;

function makePrng(seedStr: string): () => number {
  let h = 0;
  for (const c of seedStr) {
    h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  }
  return function () {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carveSpawnPocket(
  cells: CellType[][],
  cx: number,
  cy: number,
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) {
        cells[y]![x] = 'walkable';
      }
    }
  }
}

export function generateMap(seed: string): MapGrid {
  const rng = makePrng(seed);

  const cells: CellType[][] = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, (): CellType => 'rock'),
  );

  carveSpawnPocket(cells, SPAWN1_CENTER_X, SPAWN1_CENTER_Y);
  carveSpawnPocket(cells, SPAWN2_CENTER_X, SPAWN2_CENTER_Y);

  // Place treasure in a rock cell ≥ MIN_TREASURE_DIST from both spawn centers
  let treasurePos: { x: number; y: number };
  while (true) {
    const tx = Math.floor(rng() * MAP_WIDTH);
    const ty = Math.floor(rng() * MAP_HEIGHT);
    const d1 = Math.hypot(tx - SPAWN1_CENTER_X, ty - SPAWN1_CENTER_Y);
    const d2 = Math.hypot(tx - SPAWN2_CENTER_X, ty - SPAWN2_CENTER_Y);
    if (Math.min(d1, d2) >= MIN_TREASURE_DIST && cells[ty]![tx] === 'rock') {
      treasurePos = { x: tx, y: ty };
      break;
    }
  }

  return { width: MAP_WIDTH, height: MAP_HEIGHT, cells, treasurePos, seed };
}
