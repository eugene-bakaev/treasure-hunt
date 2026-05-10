import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import pg from 'pg';
import amqp from 'amqplib';
import { migrate } from '../src/db/migrate.js';
import { startConsumer } from '../src/consumer.js';
import type { MatchResultsMsg } from '@treasure-hunt/protocol';

const { Pool } = pg;

describe('Stats Service Integration', () => {
  let postgres: StartedTestContainer;
  let rabbitmq: StartedTestContainer;
  let pool: pg.Pool;
  let consumerConn: amqp.Connection;
  let consumerChan: amqp.Channel;

  // Increase timeout for container startup
  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpassword',
        POSTGRES_DB: 'testdb',
      })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();

    rabbitmq = await new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .start();

    const pgPort = postgres.getMappedPort(5432);
    const pgHost = postgres.getHost();
    const connectionString = `postgresql://testuser:testpassword@${pgHost}:${pgPort}/testdb`;

    pool = new Pool({
      connectionString,
    });

    await migrate(pool);
  }, 60000);

  afterAll(async () => {
    if (consumerChan) await consumerChan.close();
    if (consumerConn) await consumerConn.close();
    if (pool) await pool.end();
    if (postgres) await postgres.stop();
    if (rabbitmq) await rabbitmq.stop();
  });

  it('should consume match results and store them in Postgres', async () => {
    const rbPort = rabbitmq.getMappedPort(5672);
    const rbHost = rabbitmq.getHost();
    const rabbitmqUrl = `amqp://${rbHost}:${rbPort}`;
    const consumer = await startConsumer(rabbitmqUrl, pool);
    consumerConn = consumer.connection;
    consumerChan = consumer.channel;

    // Send a mock message
    const connection = await amqp.connect(rabbitmqUrl);
    const channel = await connection.createChannel();
    const exchange = 'match.results';
    await channel.assertExchange(exchange, 'fanout', { durable: true });

    const matchResults: MatchResultsMsg = {
      matchId: 'test-match-1',
      durationSeconds: 120,
      players: [
        {
          playerId: 'p1',
          nickname: 'Player 1',
          score: 100,
          treasuresFound: 1,
          nuggetsFound: 5,
        },
        {
          playerId: 'p2',
          nickname: 'Player 2',
          score: 50,
          treasuresFound: 0,
          nuggetsFound: 10,
        },
      ],
    };

    channel.publish(exchange, '', Buffer.from(JSON.stringify(matchResults)));

    // Wait for consumer to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify DB state
    const matchRes = await pool.query('SELECT * FROM matches WHERE id = $1', [matchResults.matchId]);
    expect(matchRes.rows).toHaveLength(1);
    expect(matchRes.rows[0].duration_seconds).toBe(120);

    const playerRes = await pool.query('SELECT * FROM player_stats WHERE match_id = $1 ORDER BY player_id', [
      matchResults.matchId,
    ]);
    expect(playerRes.rows).toHaveLength(2);
    expect(playerRes.rows[0].player_id).toBe('p1');
    expect(playerRes.rows[0].score).toBe(100);
    expect(playerRes.rows[1].player_id).toBe('p2');
    expect(playerRes.rows[1].score).toBe(50);

    await channel.close();
    await connection.close();
  }, 10000);

  it('should be idempotent and update existing records', async () => {
    const rbPort = rabbitmq.getMappedPort(5672);
    const rbHost = rabbitmq.getHost();
    const rabbitmqUrl = `amqp://${rbHost}:${rbPort}`;
    
    // Message with updated scores for the same match
    const updatedResults: MatchResultsMsg = {
      matchId: 'test-match-1',
      durationSeconds: 130, // Updated
      players: [
        {
          playerId: 'p1',
          nickname: 'Player 1 Updated',
          score: 200, // Updated
          treasuresFound: 2,
          nuggetsFound: 6,
        },
      ],
    };

    const connection = await amqp.connect(rabbitmqUrl);
    const channel = await connection.createChannel();
    const exchange = 'match.results';
    channel.publish(exchange, '', Buffer.from(JSON.stringify(updatedResults)));

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const matchRes = await pool.query('SELECT * FROM matches WHERE id = $1', [updatedResults.matchId]);
    expect(matchRes.rows[0].duration_seconds).toBe(130);

    const playerRes = await pool.query('SELECT * FROM player_stats WHERE match_id = $1 AND player_id = $2', [
      updatedResults.matchId,
      'p1',
    ]);
    expect(playerRes.rows[0].nickname).toBe('Player 1 Updated');
    expect(playerRes.rows[0].score).toBe(200);

    await channel.close();
    await connection.close();
  }, 10000);
});
