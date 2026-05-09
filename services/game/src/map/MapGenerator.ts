import type { CellType, MapGrid } from './types.js';

const MAP_WIDTH = 40;
const MAP_HEIGHT = 40;
const SPAWN_CENTER_X = 2;
const SPAWN_CENTER_Y = 2;
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

export function generateMap(seed: string): MapGrid {
  const rng = makePrng(seed);

  const cells: CellType[][] = Array.from({ length: MAP_HEIGHT }, () =>
    Array.from({ length: MAP_WIDTH }, (): CellType => 'rock'),
  );

  // Carve 3×3 spawn pocket centered at (SPAWN_CENTER_X, SPAWN_CENTER_Y)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = SPAWN_CENTER_X + dx;
      const cy = SPAWN_CENTER_Y + dy;
      if (cx >= 0 && cy >= 0 && cx < MAP_WIDTH && cy < MAP_HEIGHT) {
        cells[cy]![cx] = 'walkable';
      }
    }
  }

  // Place treasure in a random rock cell at least MIN_TREASURE_DIST from spawn center
  let treasurePos: { x: number; y: number };
  while (true) {
    const tx = Math.floor(rng() * MAP_WIDTH);
    const ty = Math.floor(rng() * MAP_HEIGHT);
    const dx = tx - SPAWN_CENTER_X;
    const dy = ty - SPAWN_CENTER_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= MIN_TREASURE_DIST && cells[ty]![tx] === 'rock') {
      treasurePos = { x: tx, y: ty };
      break;
    }
  }

  return { width: MAP_WIDTH, height: MAP_HEIGHT, cells, treasurePos, seed };
}
