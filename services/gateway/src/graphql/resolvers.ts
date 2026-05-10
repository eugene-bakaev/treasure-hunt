import {
  queryLeaderboard,
  queryPlayer,
  queryRecentMatches,
  queryPlayerRecentMatches,
  type DbPlayerStats,
  type DbMatch,
} from '../db/queries.js';

function toPlayerStats(row: DbPlayerStats) {
  const played = row.matches_played;
  const won = row.matches_won;
  return {
    nickname: row.nickname,
    matchesPlayed: played,
    matchesWon: won,
    winRate: played > 0 ? won / played : 0,
    totalScore: Number(row.total_score),
    bestScore: row.best_score,
    lastPlayedAt: row.last_played_at?.toISOString() ?? null,
  };
}

function toMatch(row: DbMatch) {
  return {
    id: row.id,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at.toISOString(),
    durationSec: row.duration_sec,
    winnerNick: row.winner_nick,
    playerA: { nickname: row.player_a_nick, score: row.player_a_score, won: row.player_a_nick === row.winner_nick },
    playerB: { nickname: row.player_b_nick, score: row.player_b_score, won: row.player_b_nick === row.winner_nick },
    endReason: row.end_reason,
  };
}

export const resolvers = {
  Query: {
    leaderboard: async (
      _: unknown,
      { limit = 20, sortBy = 'TOTAL_SCORE' }: { limit?: number; sortBy?: string },
    ) => {
      const rows = await queryLeaderboard(sortBy, limit);
      return rows.map(toPlayerStats);
    },

    player: async (_: unknown, { nickname }: { nickname: string }) => {
      const row = await queryPlayer(nickname);
      return row ? toPlayerStats(row) : null;
    },

    recentMatches: async (
      _: unknown,
      { nickname, limit = 20 }: { nickname?: string; limit?: number },
    ) => {
      const rows = await queryRecentMatches(nickname ?? null, limit);
      return rows.map(toMatch);
    },
  },

  PlayerStats: {
    recentMatches: async (
      parent: { nickname: string },
      { limit = 5 }: { limit?: number },
    ) => {
      const rows = await queryPlayerRecentMatches(parent.nickname, limit);
      return rows.map(toMatch);
    },
  },
};
