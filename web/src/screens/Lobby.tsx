import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPublicMatches, joinMatchById, type MatchRecord } from '../net/lobby.js';
import { getNickname } from '../net/socket.js';

export default function Lobby() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicMatches();
      setMatches(data);
    } catch {
      setError('Failed to load matches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMatches();
  }, []);

  async function handleJoin(matchId: string) {
    if (!getNickname().trim()) {
      alert('Please enter a nickname on the Home screen first.');
      navigate('/');
      return;
    }
    try {
      await joinMatchById(matchId);
      navigate(`/match/${matchId}`);
    } catch (err) {
      alert('Failed to join match. It might be full or closed.');
      void loadMatches();
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: '#eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Public Lobby</h1>
        <div>
          <button
            onClick={() => { void loadMatches(); }}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              marginRight: '1rem',
              cursor: 'pointer',
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              background: 'transparent',
              color: '#aaa',
              border: '1px solid #444',
              borderRadius: '4px',
            }}
          >
            Back
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading available matches...</p>
      ) : error ? (
        <p style={{ color: '#f88' }}>{error}</p>
      ) : matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#222', borderRadius: '8px' }}>
          <p style={{ color: '#888' }}>No public matches available right now.</p>
          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              background: '#ffd700',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Create One
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {matches.map((m) => (
            <div
              key={m.matchId}
              style={{
                background: '#222',
                padding: '1rem 1.5rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid #333',
              }}
            >
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  Match {m.matchId.slice(0, 8)}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>
                  Created {new Date(m.createdAt).toLocaleTimeString()} • {m.playerCount}/2 Players
                </div>
              </div>
              <button
                onClick={() => { void handleJoin(m.matchId); }}
                style={{
                  padding: '0.6rem 1.5rem',
                  background: '#ffd700',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Join
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
