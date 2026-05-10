import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useGameStore, initFromServerMsg, applyDiff, expireCompassResult } from '../../src/state/gameStore.js';
import type { ServerMessage, PlayerSnapshot } from '@treasure-hunt/protocol';

const defaultBuffs = { fasterShovelTicksRemaining: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({
    matchId: null,
    playerId: null,
    mapWidth: 0,
    mapHeight: 0,
    cells: new Map(),
    players: [],
    detector: 0,
    score: 0,
    matchEnded: false,
    winnerId: null,
    groundItems: [],
    heldPowerup: null,
    buffs: defaultBuffs,
    compassResult: null,
  });
});

describe('gameStore', () => {
  const initMsg: Extract<ServerMessage, { type: 'init' }> = {
    type: 'init',
    matchId: 'm1',
    playerId: 'alice',
    mapWidth: 40,
    mapHeight: 40,
    walkableCells: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    spawnX: 2.5,
    spawnY: 2.5,
  };

  const aliceSnapshot = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
    id: 'alice',
    x: 2.5,
    y: 2.5,
    facing: 'E',
    digProgress: -1,
    score: 0,
    heldPowerup: null,
    buffs: defaultBuffs,
    ...overrides,
  });

  it('initialises state from an init message', () => {
    initFromServerMsg(initMsg);
    const state = useGameStore.getState();
    expect(state.matchId).toBe('m1');
    expect(state.playerId).toBe('alice');
    expect(state.mapWidth).toBe(40);
    expect(state.cells.get('1,1')).toBe('walkable');
    expect(state.cells.get('0,0')).toBe('rock');
    expect(state.groundItems).toEqual([]);
    expect(state.heldPowerup).toBeNull();
    expect(state.buffs).toEqual(defaultBuffs);
    expect(state.compassResult).toBeNull();
  });

  it('applies cell changes from a state_diff', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 1,
      cellsChanged: [{ x: 5, y: 5, cellType: 'walkable' }],
      players: [aliceSnapshot()],
      detector: 42,
      events: [],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.cells.get('5,5')).toBe('walkable');
    expect(state.detector).toBe(42);
    expect(state.score).toBe(0);
  });

  it('sets matchEnded on match_end event', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 2,
      cellsChanged: [],
      players: [aliceSnapshot({ score: 100 })],
      detector: 0,
      events: [{ type: 'match_end', winnerId: 'alice', scores: { alice: 100 } }],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.matchEnded).toBe(true);
    expect(state.winnerId).toBe('alice');
    expect(state.score).toBe(100);
  });

  it('updates groundItems from state_diff', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 3,
      cellsChanged: [],
      players: [aliceSnapshot()],
      detector: 0,
      events: [],
      groundItems: [{ x: 10, y: 15, item: 'shovel' }],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.groundItems).toEqual([{ x: 10, y: 15, item: 'shovel' }]);
  });

  it('reads heldPowerup from own PlayerSnapshot', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 4,
      cellsChanged: [],
      players: [aliceSnapshot({ heldPowerup: 'compass' })],
      detector: 0,
      events: [],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.heldPowerup).toBe('compass');
  });

  it('clears heldPowerup to null when server sends null', () => {
    initFromServerMsg(initMsg);

    // First diff: set heldPowerup to 'shovel'
    const diff1: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 5,
      cellsChanged: [],
      players: [aliceSnapshot({ heldPowerup: 'shovel' })],
      detector: 0,
      events: [],
      groundItems: [],
    };
    applyDiff(diff1, 'alice');
    expect(useGameStore.getState().heldPowerup).toBe('shovel');

    // Second diff: clear heldPowerup to null
    const diff2: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 6,
      cellsChanged: [],
      players: [aliceSnapshot({ heldPowerup: null })],
      detector: 0,
      events: [],
      groundItems: [],
    };
    applyDiff(diff2, 'alice');

    expect(useGameStore.getState().heldPowerup).toBeNull();
  });

  it('reads buffs from own PlayerSnapshot', () => {
    initFromServerMsg(initMsg);

    const buffs = { fasterShovelTicksRemaining: 10 };
    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 7,
      cellsChanged: [],
      players: [aliceSnapshot({ buffs })],
      detector: 0,
      events: [],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    expect(useGameStore.getState().buffs).toEqual(buffs);
  });

  it('sets compassResult from compass_result event for local player', () => {
    initFromServerMsg(initMsg);
    const now = 1000;
    vi.setSystemTime(now);

    const result = { kind: 'exact' as const, x: 10, y: 10, itemType: 'treasure' as const };
    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 8,
      cellsChanged: [],
      players: [aliceSnapshot()],
      detector: 0,
      events: [{ type: 'compass_result', playerId: 'alice', result }],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    expect(useGameStore.getState().compassResult).toEqual({
      ...result,
      expiresAtMs: now + 5000,
    });
  });

  it('does not set compassResult for other players', () => {
    initFromServerMsg(initMsg);

    const result = { kind: 'exact' as const, x: 10, y: 10, itemType: 'treasure' as const };
    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 9,
      cellsChanged: [],
      players: [aliceSnapshot(), aliceSnapshot({ id: 'bob' })],
      detector: 0,
      events: [{ type: 'compass_result', playerId: 'bob', result }],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    expect(useGameStore.getState().compassResult).toBeNull();
  });

  it('does not set compassResult for kind: no_target', () => {
    initFromServerMsg(initMsg);

    const result = { kind: 'no_target' as const };
    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 10,
      cellsChanged: [],
      players: [aliceSnapshot()],
      detector: 0,
      events: [{ type: 'compass_result', playerId: 'alice', result }],
      groundItems: [],
    };
    applyDiff(diff, 'alice');

    expect(useGameStore.getState().compassResult).toBeNull();
  });

  it('expireCompassResult clears the compass result', () => {
    initFromServerMsg(initMsg);
    const result = { kind: 'exact' as const, x: 10, y: 10, itemType: 'treasure' as const };
    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 11,
      cellsChanged: [],
      players: [aliceSnapshot()],
      detector: 0,
      events: [{ type: 'compass_result', playerId: 'alice', result }],
      groundItems: [],
    };
    applyDiff(diff, 'alice');
    expect(useGameStore.getState().compassResult).not.toBeNull();

    expireCompassResult();
    expect(useGameStore.getState().compassResult).toBeNull();
  });
});
