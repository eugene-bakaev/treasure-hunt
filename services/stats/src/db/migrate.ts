import type { Pool } from 'pg';

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Force schema update for Phase 3 dev
    await client.query('DROP TABLE IF EXISTS player_stats');
    await client.query('DROP TABLE IF EXISTS matches');

    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id uuid PRIMARY KEY,
        started_at timestamptz NOT NULL,
        ended_at timestamptz NOT NULL,
        duration_sec int NOT NULL,
        map_seed text NOT NULL,
        winner_nick text NOT NULL,
        player_a_nick text NOT NULL,
        player_a_score int NOT NULL,
        player_b_nick text NOT NULL,
        player_b_score int NOT NULL,
        end_reason text NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_matches_ended_at ON matches (ended_at DESC);
      CREATE INDEX IF NOT EXISTS idx_matches_winner ON matches (winner_nick);
      CREATE INDEX IF NOT EXISTS idx_matches_player_a ON matches (player_a_nick);
      CREATE INDEX IF NOT EXISTS idx_matches_player_b ON matches (player_b_nick);

      CREATE TABLE IF NOT EXISTS player_stats (
        nickname text PRIMARY KEY,
        matches_played int NOT NULL DEFAULT 0,
        matches_won int NOT NULL DEFAULT 0,
        total_score bigint NOT NULL DEFAULT 0,
        best_score int NOT NULL DEFAULT 0,
        last_played_at timestamptz
      );
    `);

    await client.query('COMMIT');
    console.log('[stats] Database migration completed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[stats] Database migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}
