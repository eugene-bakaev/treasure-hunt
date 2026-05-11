import pg from 'pg';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';

export async function persistMatch(pool: pg.Pool, msg: MatchResultsMsg): Promise<void> {
  const winnerNick =
    msg.playerA.playerId === msg.winnerId ? msg.playerA.nickname : msg.playerB.nickname;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO matches
         (id, started_at, ended_at, duration_sec, map_seed, winner_nick,
          player_a_nick, player_a_score, player_b_nick, player_b_score, end_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        msg.matchId,
        new Date(msg.startedAt),
        new Date(msg.endedAt),
        msg.durationSec,
        msg.mapSeed,
        winnerNick,
        msg.playerA.nickname,
        msg.playerA.score,
        msg.playerB.nickname,
        msg.playerB.score,
        msg.endReason,
      ],
    );

    if (result.rows.length === 0) {
      // duplicate delivery — skip stats update
      await client.query('COMMIT');
      return;
    }

    for (const player of [msg.playerA, msg.playerB]) {
      const won = player.playerId === msg.winnerId ? 1 : 0;
      await client.query(
        `INSERT INTO player_stats (nickname, matches_played, matches_won, total_score, best_score, last_played_at)
         VALUES ($1, 1, $2, $3, $4, $5)
         ON CONFLICT (nickname) DO UPDATE SET
           matches_played = player_stats.matches_played + 1,
           matches_won    = player_stats.matches_won + $2,
           total_score    = player_stats.total_score + $3,
           best_score     = GREATEST(player_stats.best_score, $4),
           last_played_at = $5`,
        [player.nickname, won, player.score, player.score, new Date(msg.endedAt)],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
