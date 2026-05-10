import type { Pool } from 'pg';

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        duration_seconds INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        match_id TEXT REFERENCES matches(id),
        player_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        score INTEGER NOT NULL,
        treasures_found INTEGER NOT NULL,
        nuggets_found INTEGER NOT NULL,
        PRIMARY KEY (match_id, player_id)
      )
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
