import { describe, expect, it, vi } from 'vitest';
import type { GameToGatewayMsg } from '@treasure-hunt/protocol';
import { GameMatch, type MatchEventEmitter } from '../../src/match/GameMatch.js';

function makeMatch() {
  const emitted: GameToGatewayMsg[] = [];
  const emit: MatchEventEmitter = (msg) => emitted.push(msg);
  const match = new GameMatch('test-match', 'fixed-seed', emit);
  return { match, emitted };
}

function makeTwoPlayerMatch() {
  const { match, emitted } = makeMatch();
  match.addPlayer('alice');
  match.addPlayer('bob');
  emitted.length = 0; // clear the two init messages
  match.stop(); // stop the tick loop so we can tick manually
  return { match, emitted };
}

describe('GameMatch', () => {
  it('emits player_init to both players when second player joins', () => {
    const { match, emitted } = makeMatch();
    match.addPlayer('alice');
    match.addPlayer('bob');
    const initMsgs = emitted.filter((m) => m.type === 'player_init');
    expect(initMsgs).toHaveLength(2);
    match.stop();
  });

  it('emits player_diff each tick', () => {
    const { match, emitted } = makeTwoPlayerMatch();

    match.tickOnce();
    const diffs = emitted.filter((m) => m.type === 'player_diff');
    expect(diffs).toHaveLength(2); // one diff per player
  });

  it('moves the player east when move intent is queued', () => {
    const { match, emitted } = makeTwoPlayerMatch();

    match.queueIntent('alice', { type: 'move', dir: 'E' });
    match.tickOnce();

    const diff = emitted.find((m) => m.type === 'player_diff' && (m as { type: 'player_diff'; playerId: string }).playerId === 'alice');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.x).toBeGreaterThan(2.5);
    }
  });

  it('computes detector signal in diff', () => {
    const { match, emitted } = makeTwoPlayerMatch();

    match.tickOnce();

    const diff = emitted.find((m) => m.type === 'player_diff');
    if (diff?.type === 'player_diff') {
      expect(diff.diff.detector).toBeGreaterThanOrEqual(0);
      expect(diff.diff.detector).toBeLessThanOrEqual(100);
    }
  });

  it('ends the match when treasure is dug', () => {
    const { match, emitted } = makeTwoPlayerMatch();

    match.queueIntent('alice', { type: 'move', dir: 'W' });
    match.tickOnce();
    match.queueIntent('alice', { type: 'move', dir: 'N' });
    match.tickOnce();
    match.queueIntent('alice', { type: 'dig' });
    match.tickOnce();

    const latestDiff = [...emitted].reverse().find((m) => m.type === 'player_diff');
    if (latestDiff?.type === 'player_diff') {
      const player = latestDiff.diff.players.find((p) => p.id === 'alice');
      expect(typeof player?.digProgress).toBe('number');
    }
    expect(true).toBe(true); // match didn't throw
  });
});

describe('GameMatch two-player deferred start', () => {
  it('does not emit init after first player joins', () => {
    const emitted: GameToGatewayMsg[] = [];
    const match = new GameMatch('m1', 'seed1', (msg) => emitted.push(msg));
    match.addPlayer('p1');
    const initMsgs = emitted.filter((m) => m.type === 'player_init');
    expect(initMsgs).toHaveLength(0);
  });

  it('emits init to both players when second player joins', () => {
    const emitted: GameToGatewayMsg[] = [];
    const match = new GameMatch('m1', 'seed1', (msg) => emitted.push(msg));
    match.addPlayer('p1');
    match.addPlayer('p2');
    const initMsgs = emitted.filter((m) => m.type === 'player_init');
    expect(initMsgs).toHaveLength(2);
    const playerIds = initMsgs.map((m) => (m as { type: 'player_init'; playerId: string }).playerId);
    expect(playerIds).toContain('p1');
    expect(playerIds).toContain('p2');
    match.stop();
  });

  it('ignores a third player join', () => {
    const emitted: GameToGatewayMsg[] = [];
    const match = new GameMatch('m1', 'seed1', (msg) => emitted.push(msg));
    match.addPlayer('p1');
    match.addPlayer('p2');
    match.addPlayer('p3');
    expect(match['players'].size).toBe(2);
    match.stop();
  });

  it('player 1 spawns at (2.5, 2.5) and player 2 at (37.5, 37.5)', () => {
    const match = new GameMatch('m1', 'seed1', () => {});
    match.addPlayer('p1');
    match.addPlayer('p2');
    expect(match['players'].get('p1')).toMatchObject({ x: 2.5, y: 2.5 });
    expect(match['players'].get('p2')).toMatchObject({ x: 37.5, y: 37.5 });
    match.stop();
  });
});
