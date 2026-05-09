import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { joinMatch } from '../net/lobby.js';

export default function Join() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!joinCode) return;
    let mounted = true;
    joinMatch(joinCode)
      .then(({ matchId }) => { if (mounted) navigate(`/match/${matchId}`); })
      .catch(() => { if (mounted) setError('Invalid or expired invite link.'); });
    return () => { mounted = false; };
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
