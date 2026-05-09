import { describe, expect, it } from 'vitest';
import { generateMap } from '../../src/map/MapGenerator.js';

describe('generateMap', () => {
  it('produces a 40×40 grid', () => {
    const map = generateMap('test-seed');
    expect(map.width).toBe(40);
    expect(map.height).toBe(40);
    expect(map.cells).toHaveLength(40);
    expect(map.cells[0]).toHaveLength(40);
  });

  it('carves a 3×3 walkable spawn pocket at (1,1)–(3,3)', () => {
    const map = generateMap('test-seed');
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(map.cells[y]![x]).toBe('walkable');
      }
    }
  });

  it('places the treasure in a rock cell at least 15 cells from spawn center', () => {
    const map = generateMap('test-seed');
    const { x: tx, y: ty } = map.treasurePos;
    expect(map.cells[ty]![tx]).toBe('rock');
    const dx = tx - 2;
    const dy = ty - 2;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(15);
  });

  it('produces the same map for the same seed', () => {
    const a = generateMap('deterministic');
    const b = generateMap('deterministic');
    expect(a.treasurePos).toEqual(b.treasurePos);
  });

  it('produces different maps for different seeds', () => {
    const a = generateMap('seed-alpha');
    const b = generateMap('seed-beta');
    // It is astronomically unlikely for two random seeds to yield the same treasure pos
    expect(a.treasurePos).not.toEqual(b.treasurePos);
  });

  const map = generateMap('test-seed-phase2');

  it('second spawn pocket cells (36–38, 36–38) are walkable', () => {
    for (let y = 36; y <= 38; y++) {
      for (let x = 36; x <= 38; x++) {
        expect(map.cells[y]![x]).toBe('walkable');
      }
    }
  });

  it('treasure is at least 15 cells from both spawn centers', () => {
    const { x: tx, y: ty } = map.treasurePos;
    const d1 = Math.hypot(tx - 2, ty - 2);
    const d2 = Math.hypot(tx - 37, ty - 37);
    expect(Math.min(d1, d2)).toBeGreaterThanOrEqual(15);
  });

  it('first spawn pocket cells (1–3, 1–3) are still walkable', () => {
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(map.cells[y]![x]).toBe('walkable');
      }
    }
  });
});
