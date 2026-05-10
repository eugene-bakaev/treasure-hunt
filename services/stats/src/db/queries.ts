import type { Pool } from 'pg';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';

export async function upsertMatchResults(pool: Pool, results: MatchResultsMsg) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotent upsert for matches
    await client.query(
      `
      INSERT INTO matches (id, duration_seconds)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET
        duration_seconds = EXCLUDED.duration_seconds
      `,
      [results.matchId, results.durationSeconds]
    );

    // Idempotent upsert for player stats
    for (const player of results.players) {
      await client.query(
        `
        INSERT INTO player_stats (match_id, player_id, nickname, score, treasures_found, nuggets_found)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (match_id, player_id) DO UPDATE SET
          nickname = EXCLUDED.nickname,
          score = EXCLUDED.score,
          treasures_found = EXCLUDED.treasures_found,
          nuggets_found = EXCLUDED.nuggets_found
        `,
        [
          results.matchId,
          player.playerId,
          player.nickname,
          player.score,
          player.treasuresFound,
          player.nuggetsFound,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[stats] Failed to upsert match results:', err);
    throw err;
  } finally {
    client.release();
  }
}
