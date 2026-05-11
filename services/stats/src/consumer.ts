import amqp from 'amqplib';
import type { Pool } from 'pg';
import { persistMatch } from './db/queries.js';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';

const QUEUE = 'match.results';

export async function startConsumer(rabbitmqUrl: string, pool: Pool) {
  try {
    const connection = await amqp.connect(rabbitmqUrl);
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE, { durable: true });
    channel.prefetch(1);

    console.log(`[stats] Waiting for messages in ${QUEUE}`);

    channel.consume(QUEUE, async (msg) => {
      if (msg !== null) {
        try {
          const results = JSON.parse(msg.content.toString()) as MatchResultsMsg;
          console.log(`[stats] Received results for match ${results.matchId}`);
          await persistMatch(pool, results);
          channel.ack(msg);
        } catch (err) {
          console.error('[stats] error processing results:', err);
          channel.nack(msg, false, false);
        }
      }
    });

    return { connection, channel };
  } catch (err) {
    console.error('[stats] Failed to start consumer:', err);
    throw err;
  }
}
