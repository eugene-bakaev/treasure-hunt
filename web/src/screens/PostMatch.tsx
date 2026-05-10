import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GetPlayerStatsDocument } from '../gql/generated/graphql.js';
import { getNickname } from '../net/socket.js';

interface PostMatchProps {
  matchId: string;
  winnerId: string | null;
  playerId: string;
}

export default function PostMatch({ winnerId, playerId }: PostMatchProps) {
  const navigate = useNavigate();
  const nickname = getNickname();
  
  const { data, loading } = useQuery(GetPlayerStatsDocument, {
    variables: { nickname },
    skip: !nickname,
  });

  const isWinner = winnerId === playerId;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: '1rem',
    }}>
      <div style={{
        background: '#222', padding: '2rem', borderRadius: '12px',
        maxWidth: '500px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        textAlign: 'center', border: '1px solid #444',
      }}>
        <h1 style={{ color: isWinner ? '#ffd700' : '#ff4444', marginBottom: '0.5rem' }}>
          {isWinner ? 'Victory!' : 'Defeat'}
        </h1>
        <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>
          {isWinner ? 'You found the most treasure!' : 'Your opponent was faster this time.'}
        </p>

        {!loading && data?.player && (
          <div style={{
            background: '#111', padding: '1rem', borderRadius: '8px',
            marginBottom: '1.5rem', textAlign: 'left',
          }}>
            <h3 style={{ marginTop: 0, fontSize: '0.9rem', color: '#888', textTransform: 'uppercase' }}>
              Your Career Stats
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>Total Score: <strong>{data.player.totalScore}</strong></div>
              <div>Best Score: <strong>{data.player.bestScore}</strong></div>
              <div>Matches: <strong>{data.player.matchesPlayed}</strong></div>
              <div>Win Rate: <strong>{(data.player.winRate * 100).toFixed(1)}%</strong></div>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.75rem 2rem', fontSize: '1.1rem', cursor: 'pointer',
            background: '#ffd700', border: 'none', borderRadius: '6px',
            fontWeight: 'bold', width: '100%',
          }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}
