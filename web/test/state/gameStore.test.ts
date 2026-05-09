import { describe, expect, it, beforeEach } from 'vitest';
import { useGameStore, initFromServerMsg, applyDiff } from '../../src/state/gameStore.js';
import type { ServerMessage } from '@treasure-hunt/protocol';

// Reset store between tests by re-importing (zustand stores are singletons)
beforeEach(() => {
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

  it('initialises state from an init message', () => {
    initFromServerMsg(initMsg);
    const state = useGameStore.getState();
    expect(state.matchId).toBe('m1');
    expect(state.playerId).toBe('alice');
    expect(state.mapWidth).toBe(40);
    expect(state.cells.get('1,1')).toBe('walkable');
    expect(state.cells.get('0,0')).toBe('rock');
  });

  it('applies cell changes from a state_diff', () => {
    initFromServerMsg(initMsg);

    const diff: Extract<ServerMessage, { type: 'state_diff' }> = {
      type: 'state_diff',
      tick: 1,
      cellsChanged: [{ x: 5, y: 5, cellType: 'walkable' }],
      players: [{ id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 0 }],
      detector: 42,
      events: [],
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
      players: [{ id: 'alice', x: 2.5, y: 2.5, facing: 'E', digProgress: -1, score: 100 }],
      detector: 0,
      events: [{ type: 'match_end', winnerId: 'alice', scores: { alice: 100 } }],
    };
    applyDiff(diff, 'alice');

    const state = useGameStore.getState();
    expect(state.matchEnded).toBe(true);
    expect(state.winnerId).toBe('alice');
    expect(state.score).toBe(100);
  });
});
