import amqp from 'amqplib';
import type { Pool } from 'pg';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';
import { upsertMatchResults } from './db/queries.js';

export async function startConsumer(rabbitmqUrl: string, pool: Pool) {
  try {
    const connection = await amqp.connect(rabbitmqUrl);
    const channel = await connection.createChannel();

    const exchange = 'match.results';
    const queue = 'stats.match.results';

    await channel.assertExchange(exchange, 'fanout', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, '');

    console.log(`[stats] Waiting for messages in ${queue}`);

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        try {
          const results: MatchResultsMsg = JSON.parse(msg.content.toString());
          console.log(`[stats] Received results for match ${results.matchId}`);
          
          await upsertMatchResults(pool, results);
          
          channel.ack(msg);
        } catch (err) {
          console.error('[stats] Error processing message:', err);
          // Nack the message if processing fails, but don't requeue to avoid infinite loops on malformed messages.
          // In production, the queue should be configured with a Dead Letter Exchange.
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
