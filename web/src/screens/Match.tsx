import { useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import PixiCanvas from '../pixi/PixiCanvas.js';
import DetectorGauge from '../hud/DetectorGauge.js';
import Scoreboard from '../hud/Scoreboard.js';
import PowerupSlot from '../hud/PowerupSlot.js';
import BuffBar from '../hud/BuffBar.js';
import PostMatch from './PostMatch.js';
import { useGameStore } from '../state/gameStore.js';
import { useInput } from '../hooks/useInput.js';
import { connect, disconnect, sendIntent, getNickname } from '../net/socket.js';
import type { Facing } from '@treasure-hunt/protocol';

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const detector = useGameStore((s) => s.detector);
  const score = useGameStore((s) => s.score);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const winnerId = useGameStore((s) => s.winnerId);
  const playerId = useGameStore((s) => s.playerId);
  const heldPowerup = useGameStore((s) => s.heldPowerup);
  const buffs = useGameStore((s) => s.buffs);

  useEffect(() => {
    connect(id!);
    return () => disconnect();
  }, [id]);

  const onMove = useCallback(
    (dir: Facing) => sendIntent({ type: 'move', dir }),
    [],
  );
  const onStop = useCallback(() => sendIntent({ type: 'stop' }), []);
  const onDig = useCallback(() => sendIntent({ type: 'dig' }), []);
  const onActivate = useCallback(() => sendIntent({ type: 'activate' }), []);

  useInput({ onMove, onStop, onDig, onActivate });

  const joinCode = (location.state as { joinCode?: string } | null)?.joinCode;
  const inviteUrl = joinCode
    ? `${window.location.origin}/join/${joinCode}`
    : null;

  if (playerId === null) {
    return (
      <main style={{ color: '#eee', padding: '2rem', textAlign: 'center', background: '#111', minHeight: '100vh' }}>
        <h2>Waiting for opponent…</h2>
        {inviteUrl && (
          <>
            <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#aaa' }}>
              Share this link:
            </p>
            <code style={{
              display: 'block', margin: '0.5rem auto', padding: '0.5rem 1rem',
              background: '#222', borderRadius: '4px', maxWidth: '480px',
              wordBreak: 'break-all', fontSize: '0.9rem',
            }}>
              {inviteUrl}
            </code>
            <button
              onClick={() => { void navigator.clipboard.writeText(inviteUrl); }}
              style={{
                marginTop: '0.5rem', padding: '0.4rem 1rem', cursor: 'pointer',
                background: '#444', color: '#eee', border: 'none', borderRadius: '4px',
              }}
            >
              Copy
            </button>
          </>
        )}
      </main>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        gap: '0.5rem',
        background: '#111',
        minHeight: '100vh',
      }}
    >
      <div style={{ width: '640px' }}>
        <Scoreboard
          nickname={getNickname()}
          score={score}
          matchEnded={matchEnded}
          isWinner={matchEnded && winnerId === playerId}
        />
      </div>

      <div style={{ width: '640px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <PowerupSlot
          heldPowerup={heldPowerup}
          disabled={heldPowerup === 'shovel' && buffs.fasterShovelTicksRemaining > 0}
        />
        <BuffBar fasterShovelTicksRemaining={buffs.fasterShovelTicksRemaining} />
      </div>

      <PixiCanvas />

      <div style={{ width: '640px' }}>
        <DetectorGauge value={detector} />
      </div>

      {matchEnded && id && (
        <PostMatch matchId={id} winnerId={winnerId} playerId={playerId} />
      )}
    </div>
  );
}
