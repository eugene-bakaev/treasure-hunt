const LOBBY_URL: string =
  (import.meta.env as Record<string, string | undefined>)['VITE_LOBBY_URL'] ??
  'http://localhost:3001';

export async function createMatch(): Promise<{ matchId: string; joinCode: string }> {
  const res = await fetch(`${LOBBY_URL}/match`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create match');
  return res.json() as Promise<{ matchId: string; joinCode: string }>;
}

export async function joinMatch(joinCode: string): Promise<{ matchId: string }> {
  const res = await fetch(
    `${LOBBY_URL}/match/join/${encodeURIComponent(joinCode)}`,
  );
  if (!res.ok) throw new Error('Invalid invite link');
  return res.json() as Promise<{ matchId: string }>;
}
