interface Props { nickname: string; score: number; matchEnded?: boolean; isWinner?: boolean; }
export default function Scoreboard({ nickname, score, matchEnded, isWinner }: Props) {
  return (
    <div style={{ color: '#eee', fontSize: '1rem', padding: '0.25rem 0.5rem' }}>
      <span style={{ fontWeight: 'bold' }}>{nickname}</span>{' · '}<span>{score}</span>
      {matchEnded && (
        <span style={{ marginLeft: '0.75rem', fontWeight: 'bold', color: isWinner ? '#ffd700' : '#aaa' }}>
          {isWinner ? 'You win!' : 'Game over'}
        </span>
      )}
    </div>
  );
}
