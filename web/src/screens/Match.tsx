import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PixiCanvas from '../pixi/PixiCanvas.js';
import DetectorGauge from '../hud/DetectorGauge.js';
import Scoreboard from '../hud/Scoreboard.js';
import { useGameStore } from '../state/gameStore.js';
import { useInput } from '../hooks/useInput.js';
import { connect, disconnect, sendIntent } from '../net/socket.js';
import type { Facing } from '@treasure-hunt/protocol';

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { detector, score, matchEnded, winnerId, playerId } = useGameStore((s) => ({
    detector: s.detector,
    score: s.score,
    matchEnded: s.matchEnded,
    winnerId: s.winnerId,
    playerId: s.playerId,
  }));

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [id]);

  useEffect(() => {
    if (matchEnded) {
      const timer = setTimeout(() => navigate('/'), 4000);
      return () => clearTimeout(timer);
    }
  }, [matchEnded, navigate]);

  const onMove = useCallback(
    (dir: Facing) => sendIntent({ type: 'move', dir }),
    [],
  );
  const onStop = useCallback(() => sendIntent({ type: 'stop' }), []);
  const onDig = useCallback(() => sendIntent({ type: 'dig' }), []);

  useInput({ onMove, onStop, onDig });

  const nickname = playerId ?? 'You';

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
          nickname={nickname}
          score={score}
          matchEnded={matchEnded}
          isWinner={matchEnded && winnerId === playerId}
        />
      </div>

      <PixiCanvas />

      <div style={{ width: '640px' }}>
        <DetectorGauge value={detector} />
      </div>

      {matchEnded && (
        <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
          Returning to home in 4 seconds…
        </p>
      )}
    </div>
  );
}
