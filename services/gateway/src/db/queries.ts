import pg from 'pg';

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({ connectionString: process.env['POSTGRES_URL'] });
  }
  return _pool;
}

export interface DbPlayerStats {
  nickname: string;
  matches_played: number;
  matches_won: number;
  total_score: bigint;
  best_score: number;
  last_played_at: Date | null;
}

export interface DbMatch {
  id: string;
  started_at: Date;
  ended_at: Date;
  duration_sec: number;
  winner_nick: string;
  player_a_nick: string;
  player_a_score: number;
  player_b_nick: string;
  player_b_score: number;
  end_reason: string;
}

type SortCol = 'total_score' | 'matches_won' | 'best_score';

const SORT_MAP: Record<string, SortCol> = {
  TOTAL_SCORE: 'total_score',
  WINS: 'matches_won',
  BEST_SCORE: 'best_score',
};

export async function queryLeaderboard(sortBy: string, limit: number): Promise<DbPlayerStats[]> {
  const col: SortCol = SORT_MAP[sortBy] ?? 'total_score';
  const { rows } = await getPool().query<DbPlayerStats>(
    `SELECT * FROM player_stats ORDER BY ${col} DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function queryPlayer(nickname: string): Promise<DbPlayerStats | null> {
  const { rows } = await getPool().query<DbPlayerStats>(
    'SELECT * FROM player_stats WHERE nickname = $1',
    [nickname],
  );
  return rows[0] ?? null;
}

export async function queryRecentMatches(nickname: string | null, limit: number): Promise<DbMatch[]> {
  if (nickname) {
    const { rows } = await getPool().query<DbMatch>(
      `SELECT * FROM matches WHERE player_a_nick = $1 OR player_b_nick = $1
       ORDER BY ended_at DESC LIMIT $2`,
      [nickname, limit],
    );
    return rows;
  }
  const { rows } = await getPool().query<DbMatch>(
    'SELECT * FROM matches ORDER BY ended_at DESC LIMIT $1',
    [limit],
  );
  return rows;
}

export async function queryPlayerRecentMatches(nickname: string, limit: number): Promise<DbMatch[]> {
  const { rows } = await getPool().query<DbMatch>(
    `SELECT * FROM matches WHERE player_a_nick = $1 OR player_b_nick = $1
     ORDER BY ended_at DESC LIMIT $2`,
    [nickname, limit],
  );
  return rows;
}
