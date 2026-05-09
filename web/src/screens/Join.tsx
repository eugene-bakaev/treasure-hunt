import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { joinMatch } from '../net/lobby.js';

export default function Join() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!joinCode) return;
    joinMatch(joinCode)
      .then(({ matchId }) => navigate(`/match/${matchId}`))
      .catch(() => setError('Invalid or expired invite link.'));
  }, [joinCode, navigate]);

  if (error) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#f88' }}>{error}</p>
      </main>
    );
  }
  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: '#eee' }}>Joining…</p>
    </main>
  );
}
