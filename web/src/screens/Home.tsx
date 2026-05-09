import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <main>
      <h1>Treasure Hunt</h1>
      <p>Find the buried treasure before your opponent does.</p>
      <button
        onClick={() => navigate('/match/dev')}
        style={{
          marginTop: '1.5rem',
          padding: '0.75rem 2rem',
          fontSize: '1.1rem',
          cursor: 'pointer',
          background: '#ffd700',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 'bold',
        }}
      >
        Start Game
      </button>
    </main>
  );
}
