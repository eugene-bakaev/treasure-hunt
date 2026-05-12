import { v4 as uuidv4 } from 'uuid';

export interface MatchRecord {
  matchId: string;
  joinCode: string;
  createdAt: Date;
  isPublic: boolean;
  playerCount: number;
}

const matches = new Map<string, MatchRecord>();  // matchId → record
const codeIndex = new Map<string, string>();      // joinCode → matchId

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code: string;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  } while (codeIndex.has(code));
  return code;
}

export function createMatch(isPublic = false): MatchRecord {
  const matchId = uuidv4();
  const joinCode = generateJoinCode();
  const record: MatchRecord = {
    matchId,
    joinCode,
    createdAt: new Date(),
    isPublic,
    playerCount: 0,
  };
  matches.set(matchId, record);
  codeIndex.set(joinCode, matchId);
  return record;
}

export function listPublicMatches(): MatchRecord[] {
  return Array.from(matches.values()).filter(
    (m) => m.isPublic && m.playerCount < 2,
  );
}

export function getMatch(matchId: string): MatchRecord | undefined {
  return matches.get(matchId);
}

export function incrementPlayerCount(matchId: string): boolean {
  const record = matches.get(matchId);
  if (!record || record.playerCount >= 2) return false;
  record.playerCount++;
  return true;
}

export function resolveJoinCode(joinCode: string): MatchRecord | undefined {
  const matchId = codeIndex.get(joinCode.toUpperCase());
  return matchId !== undefined ? matches.get(matchId) : undefined;
}

export function resetStore(): void {
  matches.clear();
  codeIndex.clear();
}
