const LOBBY_URL: string =
  (import.meta.env as Record<string, string | undefined>)['VITE_LOBBY_URL'] ??
  ''; // empty string means relative to same origin

export interface MatchRecord {
  matchId: string;
  joinCode: string;
  createdAt: string;
  isPublic: boolean;
  playerCount: number;
}

export async function createMatch(isPublic = false): Promise<{ matchId: string; joinCode: string }> {
  const res = await fetch(`${LOBBY_URL}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublic }),
  });
  if (!res.ok) throw new Error('Failed to create match');
  return res.json() as Promise<{ matchId: string; joinCode: string }>;
}

export async function fetchPublicMatches(): Promise<MatchRecord[]> {
  const res = await fetch(`${LOBBY_URL}/matches`);
  if (!res.ok) throw new Error('Failed to fetch public matches');
  return res.json() as Promise<MatchRecord[]>;
}

export async function joinMatchByCode(joinCode: string): Promise<{ matchId: string }> {
  const res = await fetch(
    `${LOBBY_URL}/match/join/${encodeURIComponent(joinCode)}`,
  );
  if (!res.ok) throw new Error('Invalid invite link');
  return res.json() as Promise<{ matchId: string }>;
}

export async function joinMatchById(matchId: string): Promise<void> {
  const res = await fetch(`${LOBBY_URL}/match/${matchId}/join`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to join match');
}

export async function getMatch(matchId: string): Promise<MatchRecord> {
  const res = await fetch(`${LOBBY_URL}/match/${matchId}`);
  if (!res.ok) throw new Error('Match not found');
  return res.json() as Promise<MatchRecord>;
}
