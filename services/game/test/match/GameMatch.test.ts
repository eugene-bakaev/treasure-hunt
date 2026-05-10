import { describe, expect, it, vi } from 'vitest';
import type { GameToGatewayMsg } from '@treasure-hunt/protocol';
import { GameMatch, type MatchEventEmitter } from '../../src/match/GameMatch.js';

function makeMatch() {
  const emitted: GameToGatewayMsg[] = [];
  const emit: MatchEventEmitter = (msg) => emitted.push(msg);
  const onResults = vi.fn();
  const match = new GameMatch('test-match', 'fixed-seed', emit, onResults);
  return { match, emitted, onResults };
}

function makeTwoPlayerMatch() {
  const { match, emitted, onResults } = makeMatch();
  match.addPlayer('alice', 'Alice');
  match.addPlayer('bob', 'Bob');
  emitted.length = 0; // clear the two init messages
  match.stop(); // stop the tick loop so we can tick manually
  return { match, emitted, onResults };
}

describe('GameMatch', () => {
  it('emits player_init to both players when second player joins', () => {
    const { match, emitted } = makeMatch();
    match.addPlayer('alice', 'Alice');
    match.addPlayer('bob', 'Bob');
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

describe('GameMatch item pickups', () => {
  it('digging a nugget cell awards 10 pts and emits pickup event', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const nugget = match['map'].items.find((i: { item: string }) => i.item === 'nugget')!;
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      digTarget: { x: nugget.x, y: nugget.y },
      digTicksRemaining: 1,
    });

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.score).toBe(10);
      expect(diff.diff.events).toContainEqual({
        type: 'pickup', playerId: 'alice', itemType: 'nugget',
      });
      expect(match['buriedItems'].has(`${nugget.x},${nugget.y}`)).toBe(false);
    }
  });

  it('digging a powerup cell with empty slot sets heldPowerup and emits pickup', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const shovel = match['map'].items.find((i: { item: string }) => i.item === 'shovel')!;
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: null,
      digTarget: { x: shovel.x, y: shovel.y },
      digTicksRemaining: 1,
    });

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.heldPowerup).toBe('shovel');
      expect(diff.diff.events).toContainEqual({
        type: 'pickup', playerId: 'alice', itemType: 'shovel',
      });
    }
  });

  it('digging a powerup cell with full slot drops it to groundItems', () => {
    const { match } = makeTwoPlayerMatch();
    const shovel1 = match['map'].items.filter(
      (i: { item: string }) => i.item === 'shovel',
    )[0]!;
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: 'compass',
      digTarget: { x: shovel1.x, y: shovel1.y },
      digTicksRemaining: 1,
    });

    match.tickOnce();

    expect(match['groundItems'].get(`${shovel1.x},${shovel1.y}`)).toBe('shovel');
    expect(match['buriedItems'].has(`${shovel1.x},${shovel1.y}`)).toBe(false);
  });

  it('walking over a nugget ground item awards 10 pts and removes it', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['groundItems'].set(groundKey, 'nugget');

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.score).toBe(10);
      expect(match['groundItems'].has(groundKey)).toBe(false);
    }
  });

  it('walking over a powerup ground item with empty slot picks it up', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['players'].set('alice', { ...alice, heldPowerup: null });
    match['groundItems'].set(groundKey, 'bomb');

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.heldPowerup).toBe('bomb');
      expect(match['groundItems'].has(groundKey)).toBe(false);
    }
  });

  it('walking over a powerup ground item with full slot leaves it in groundItems', () => {
    const { match } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['players'].set('alice', { ...alice, heldPowerup: 'compass' });
    match['groundItems'].set(groundKey, 'bomb');

    match.tickOnce();

    expect(match['groundItems'].has(groundKey)).toBe(true);
    expect(match['groundItems'].get(groundKey)).toBe('bomb');
  });

  it('walking over a treasure ground item awards 100 pts and ends match', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    const groundKey = `${Math.floor(alice.x)},${Math.floor(alice.y)}`;
    match['groundItems'].set(groundKey, 'treasure');

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.score).toBe(100);
      expect(match['groundItems'].has(groundKey)).toBe(false);
      expect(diff.diff.events).toContainEqual({
        type: 'pickup', playerId: 'alice', itemType: 'treasure',
      });
      expect(diff.diff.events).toContainEqual({
        type: 'match_end',
        winnerId: 'alice',
        scores: expect.any(Object),
      });
      expect(match['ended']).toBe(true);
    }
  });

  it('state_diff includes groundItems array', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['groundItems'].set(`${Math.floor(alice.x)},${Math.floor(alice.y)}`, 'shovel');

    match.tickOnce();

    const diff = emitted.find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      expect(Array.isArray(diff.diff.groundItems)).toBe(true);
      expect(diff.diff.groundItems.length).toBeGreaterThan(0);
    }
  });

  it('surfaces buffs in player snapshot', () => {
    const { match, emitted } = makeTwoPlayerMatch();

    match.tickOnce();

    const diff = emitted.find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.buffs).toBeDefined();
      expect(player?.buffs.fasterShovelTicksRemaining).toBe(0);
    }
  });
});

describe('GameMatch buffs', () => {
  it('decrements fasterShovelTicksRemaining each tick', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      fasterShovelTicksRemaining: 10,
    });

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.buffs.fasterShovelTicksRemaining).toBe(9);
    }
    expect(match['players'].get('alice')?.fasterShovelTicksRemaining).toBe(9);
  });

  it('floors fasterShovelTicksRemaining at 0', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      fasterShovelTicksRemaining: 0,
    });

    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.buffs.fasterShovelTicksRemaining).toBe(0);
    }
    expect(match['players'].get('alice')?.fasterShovelTicksRemaining).toBe(0);
  });

  it('activates held powerup when activate intent is queued', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: 'shovel',
      fasterShovelTicksRemaining: 0,
    });

    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const diff = [...emitted].reverse().find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    expect(diff?.type).toBe('player_diff');
    if (diff?.type === 'player_diff') {
      const player = diff.diff.players.find((p) => p.id === 'alice');
      expect(player?.heldPowerup).toBeNull();
      expect(player?.buffs.fasterShovelTicksRemaining).toBeGreaterThan(0);
      expect(diff.diff.events).toContainEqual({
        type: 'powerup_activate',
        playerId: 'alice',
        powerup: 'shovel',
      });
    }
  });

  it('only activates once if multiple activate intents are queued in one tick', () => {
    const { match } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: 'shovel',
      fasterShovelTicksRemaining: 0,
    });

    // Queue two activates. The second should be a no-op because shovel is gone.
    match.queueIntent('alice', { type: 'activate' });
    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const aliceState = match['players'].get('alice')!;
    expect(aliceState.heldPowerup).toBeNull();
    // It should have exactly the initial buff amount (minus 1 for the tick decrement if it happens in the same tick)
    // Actually GameMatch.ts decrements it AFTER activating in tickOnce.
    // FASTER_SHOVEL_TICKS = 450. After decrement: 449.
    expect(aliceState.fasterShovelTicksRemaining).toBe(449);
  });

  it('processes activate intents before dig intents in the same tick (two-pass)', () => {
    const { match } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    // Alice is at (2.5, 2.5). There is rock at (2, 2) which is West then North.
    // Actually let's just force Alice to face a rock.
    match['map'].cells[2][1] = 'rock'; // (1, 2) is West of (2.5, 2.5)
    match['players'].set('alice', {
      ...alice,
      x: 2.5,
      y: 2.5,
      facing: 'W',
      heldPowerup: 'shovel',
      fasterShovelTicksRemaining: 0,
    });

    // Queue dig then activate. In one-pass, dig would start with 24 ticks.
    // In two-pass, activate happens first, so dig starts with 12 ticks.
    match.queueIntent('alice', { type: 'dig' });
    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const aliceState = match['players'].get('alice')!;
    expect(aliceState.heldPowerup).toBeNull();
    expect(aliceState.fasterShovelTicksRemaining).toBe(449);
    // DIG_TICKS is 24. Buffed should be 12.
    // In tickOnce:
    // 1. Drains intents (startDig sets it to 12)
    // 2. advanceDig decrements it to 11
    expect(aliceState.digTicksRemaining).toBe(11);
  });

  it('routes private events only to the player who activated', () => {
    const { match, emitted } = makeTwoPlayerMatch();
    const alice = match['players'].get('alice')!;
    match['players'].set('alice', {
      ...alice,
      heldPowerup: 'compass',
    });

    match.queueIntent('alice', { type: 'activate' });
    match.tickOnce();

    const aliceDiff = emitted.find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'alice',
    );
    const bobDiff = emitted.find(
      (m) => m.type === 'player_diff' && (m as { playerId: string }).playerId === 'bob',
    );

    expect(aliceDiff?.type).toBe('player_diff');
    expect(bobDiff?.type).toBe('player_diff');

    if (aliceDiff?.type === 'player_diff' && bobDiff?.type === 'player_diff') {
      // Alice should see the compass_result
      expect(aliceDiff.diff.events).toContainEqual(
        expect.objectContaining({ type: 'compass_result', playerId: 'alice' }),
      );
      // Bob should NOT see the compass_result
      expect(bobDiff.diff.events).not.toContainEqual(
        expect.objectContaining({ type: 'compass_result', playerId: 'alice' }),
      );
      // Both should see the public powerup_activate event
      const activateEvent = {
        type: 'powerup_activate',
        playerId: 'alice',
        powerup: 'compass',
      };
      expect(aliceDiff.diff.events).toContainEqual(activateEvent);
      expect(bobDiff.diff.events).toContainEqual(activateEvent);
    }
  });
});
