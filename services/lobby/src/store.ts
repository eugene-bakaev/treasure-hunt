import { v4 as uuidv4 } from 'uuid';

export interface MatchRecord {
  matchId: string;
  joinCode: string;
  createdAt: Date;
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

export function createMatch(): MatchRecord {
  const matchId = uuidv4();
  const joinCode = generateJoinCode();
  const record: MatchRecord = { matchId, joinCode, createdAt: new Date() };
  matches.set(matchId, record);
  codeIndex.set(joinCode, matchId);
  return record;
}

export function resolveJoinCode(joinCode: string): MatchRecord | undefined {
  const matchId = codeIndex.get(joinCode.toUpperCase());
  return matchId !== undefined ? matches.get(matchId) : undefined;
}

export function resetStore(): void {
  matches.clear();
  codeIndex.clear();
}
