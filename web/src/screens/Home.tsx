import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMatch } from '../net/lobby.js';
import { Leaderboard } from '../components/Leaderboard.js';
import { getNickname, setNickname as persistNickname } from '../net/socket.js';

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(() => {
    // We want the raw value for the input, but fall back to empty if never set
    return localStorage.getItem('treasure_hunt_nickname') || '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    persistNickname(nickname);
  }, [nickname]);

  async function handleCreate(isPublic = false) {
    if (!nickname.trim()) {
      setError('Please enter a nickname first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { matchId, joinCode } = await createMatch(isPublic);
      navigate(`/match/${matchId}`, { state: { joinCode } });
    } catch {
      setError('Failed to create match. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem' }}>
      <h1>Treasure Hunt</h1>
      <p>Find the buried treasure before your opponent does.</p>
      
      <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', maxWidth: '300px' }}>
        <label htmlFor="nickname" style={{ fontSize: '0.9rem', color: '#ccc' }}>Your Nickname</label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 15))}
          placeholder="Enter nickname..."
          style={{
            padding: '0.75rem',
            fontSize: '1rem',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#222',
            color: '#fff',
          }}
        />
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '300px' }}>
        <button
          onClick={() => { void handleCreate(true); }}
          disabled={loading}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1.1rem',
            cursor: loading ? 'default' : 'pointer',
            background: '#ffd700',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            opacity: loading ? 0.6 : 1,
            width: '100%',
          }}
        >
          {loading ? 'Creating…' : 'Create Public Match'}
        </button>

        <button
          onClick={() => { void handleCreate(false); }}
          disabled={loading}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1.1rem',
            cursor: loading ? 'default' : 'pointer',
            background: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            opacity: loading ? 0.6 : 1,
            width: '100%',
          }}
        >
          {loading ? 'Creating…' : 'Create Private Match'}
        </button>

        <button
          onClick={() => navigate('/lobby')}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1.1rem',
            cursor: 'pointer',
            background: 'transparent',
            color: '#ffd700',
            border: '1px solid #ffd700',
            borderRadius: '6px',
            fontWeight: 'bold',
            width: '100%',
          }}
        >
          Browse Lobby
        </button>
      </div>
      
      {error && (
        <p style={{ color: '#f88', marginTop: '0.75rem', fontSize: '0.9rem' }}>
          {error}
        </p>
      )}

      <Leaderboard />
    </main>
  );
}
