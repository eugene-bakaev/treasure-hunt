import { useQuery } from '@apollo/client';
import { GetLeaderboardDocument, GetLeaderboardQuery } from '../gql/generated/graphql.js';

export function Leaderboard() {
  const { data, loading, error } = useQuery(GetLeaderboardDocument, {
    variables: { limit: 10 },
    pollInterval: 30000,
  });

  if (loading) return <p>Loading leaderboard...</p>;
  if (error) return <p>Error loading leaderboard</p>;
  if (!data?.leaderboard.length) return <p>No players yet.</p>;

  return (
    <section style={{ marginTop: '2rem', width: '100%', maxWidth: '600px' }}>
      <h2 style={{ textAlign: 'center' }}>Top Players</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #444', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Player</th>
            <th style={{ padding: '0.5rem' }}>Score</th>
            <th style={{ padding: '0.5rem' }}>Wins</th>
            <th style={{ padding: '0.5rem' }}>Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.leaderboard.map((entry: GetLeaderboardQuery['leaderboard'][0]) => (
            <tr key={entry.nickname} style={{ borderBottom: '1px solid #333' }}>
              <td style={{ padding: '0.5rem' }}>{entry.nickname}</td>
              <td style={{ padding: '0.5rem' }}>{entry.totalScore}</td>
              <td style={{ padding: '0.5rem' }}>{entry.matchesWon}</td>
              <td style={{ padding: '0.5rem' }}>{(entry.winRate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
