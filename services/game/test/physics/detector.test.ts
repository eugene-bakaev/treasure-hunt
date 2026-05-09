import { describe, expect, it } from 'vitest';
import { computeDetector } from '../../src/physics/detector.js';

describe('computeDetector', () => {
  it('returns 100 when directly facing an item at close range', () => {
    // Player at (0, 5) facing east; item at (1, 5) → ahead, 1 cell away
    const signal = computeDetector(
      { x: 0.5, y: 5.5, facing: 'E' },
      [{ x: 1, y: 5 }],
    );
    // distance_factor ≈ 1 - 1/12 ≈ 0.917, direction_factor = 1 → ~91
    expect(signal).toBeGreaterThan(85);
  });

  it('returns 0 when facing directly away from the item', () => {
    // Player at (5, 5) facing west; item is to the east
    const signal = computeDetector(
      { x: 5.5, y: 5.5, facing: 'W' },
      [{ x: 8, y: 5 }],
    );
    expect(signal).toBe(0);
  });

  it('returns 0 when item is beyond detector range', () => {
    // Item 20 cells away (range = 12)
    const signal = computeDetector(
      { x: 0.5, y: 0.5, facing: 'E' },
      [{ x: 20, y: 0 }],
    );
    expect(signal).toBe(0);
  });

  it('decreases monotonically as distance increases (item directly ahead)', () => {
    const player = { x: 0.5, y: 0.5, facing: 'E' as const };
    const signals = [1, 3, 6, 9, 11].map((dist) =>
      computeDetector(player, [{ x: dist, y: 0 }]),
    );
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i]).toBeLessThan(signals[i - 1]!);
    }
  });

  it('returns the max signal over multiple items', () => {
    const player = { x: 0.5, y: 0.5, facing: 'E' as const };
    const signalSingle = computeDetector(player, [{ x: 1, y: 0 }]);
    const signalBoth = computeDetector(player, [
      { x: 1, y: 0 },
      { x: 15, y: 15 }, // far away, contributes nothing
    ]);
    expect(signalBoth).toBe(signalSingle);
  });

  it('returns 0 when there are no buried items', () => {
    expect(computeDetector({ x: 5.5, y: 5.5, facing: 'N' }, [])).toBe(0);
  });
});
