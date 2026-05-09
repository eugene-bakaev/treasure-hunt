import { useParams } from 'react-router-dom';

export default function Match() {
  const { id } = useParams<{ id: string }>();
  return (
    <main>
      <h1>Match</h1>
      <p>Match {id}</p>
    </main>
  );
}
