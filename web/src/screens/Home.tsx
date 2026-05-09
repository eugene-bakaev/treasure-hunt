import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMatch } from '../net/lobby.js';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const { matchId, joinCode } = await createMatch();
      navigate(`/match/${matchId}`, { state: { joinCode } });
    } catch {
      setError('Failed to create match. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Treasure Hunt</h1>
      <p>Find the buried treasure before your opponent does.</p>
      <button
        onClick={() => { void handleCreate(); }}
        disabled={loading}
        style={{
          marginTop: '1.5rem',
          padding: '0.75rem 2rem',
          fontSize: '1.1rem',
          cursor: loading ? 'default' : 'pointer',
          background: '#ffd700',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Creating…' : 'Create Match'}
      </button>
      {error && (
        <p style={{ color: '#f88', marginTop: '0.75rem', fontSize: '0.9rem' }}>
          {error}
        </p>
      )}
    </main>
  );
}
