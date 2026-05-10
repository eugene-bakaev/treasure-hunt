export const typeDefs = `#graphql
  enum LeaderboardSort { TOTAL_SCORE WINS BEST_SCORE }

  type Query {
    leaderboard(limit: Int = 20, sortBy: LeaderboardSort = TOTAL_SCORE): [PlayerStats!]!
    player(nickname: String!): PlayerStats
    recentMatches(nickname: String, limit: Int = 20): [Match!]!
  }

  type PlayerStats {
    nickname: String!
    matchesPlayed: Int!
    matchesWon: Int!
    winRate: Float!
    totalScore: Int!
    bestScore: Int!
    lastPlayedAt: String
    recentMatches(limit: Int = 5): [Match!]!
  }

  type Match {
    id: ID!
    startedAt: String!
    endedAt: String!
    durationSec: Int!
    winnerNick: String!
    playerA: MatchPlayer!
    playerB: MatchPlayer!
    endReason: String!
  }

  type MatchPlayer {
    nickname: String!
    score: Int!
    won: Boolean!
  }
`;
