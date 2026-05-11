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
    const queueName = 'match.results';
    await channel.assertQueue(queueName, { durable: true });

    const matchResults: MatchResultsMsg = {
      matchId: '123e4567-e89b-12d3-a456-426614174000',
      startedAt: new Date(Date.now() - 120000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: 120,
      mapSeed: 'test-seed',
      winnerId: 'p1',
      playerA: {
        playerId: 'p1',
        nickname: 'Alice',
        score: 100,
        treasuresFound: 1,
        nuggetsFound: 5,
      },
      playerB: {
        playerId: 'p2',
        nickname: 'Bob',
        score: 50,
        treasuresFound: 0,
        nuggetsFound: 10,
      },
      endReason: 'Treasure Found',
    };

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(matchResults)), { persistent: true });

    // Wait for consumer to process
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verify DB state
    const matchRes = await pool.query('SELECT * FROM matches WHERE id = $1', [matchResults.matchId]);
    expect(matchRes.rows).toHaveLength(1);
    expect(matchRes.rows[0].duration_sec).toBe(120);
    expect(matchRes.rows[0].winner_nick).toBe('Alice');

    const playerRes = await pool.query('SELECT * FROM player_stats WHERE nickname = $1', ['Alice']);
    expect(playerRes.rows).toHaveLength(1);
    expect(playerRes.rows[0].total_score).toBe('100');
    expect(playerRes.rows[0].matches_won).toBe(1);

    const playerResB = await pool.query('SELECT * FROM player_stats WHERE nickname = $1', ['Bob']);
    expect(playerResB.rows).toHaveLength(1);
    expect(playerResB.rows[0].total_score).toBe('50');
    expect(playerResB.rows[0].matches_won).toBe(0);

    await channel.close();
    await connection.close();
  }, 15000);

  it('should be idempotent and update existing records', async () => {
    const rbPort = rabbitmq.getMappedPort(5672);
    const rbHost = rabbitmq.getHost();
    const rabbitmqUrl = `amqp://${rbHost}:${rbPort}`;
    
    // Same matchId, same message (simulating redelivery)
    const redeliveredResults: MatchResultsMsg = {
      matchId: '123e4567-e89b-12d3-a456-426614174000',
      startedAt: new Date(Date.now() - 120000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: 120,
      mapSeed: 'test-seed',
      winnerId: 'p1',
      playerA: {
        playerId: 'p1',
        nickname: 'Alice',
        score: 100,
        treasuresFound: 1,
        nuggetsFound: 5,
      },
      playerB: {
        playerId: 'p2',
        nickname: 'Bob',
        score: 50,
        treasuresFound: 0,
        nuggetsFound: 10,
      },
      endReason: 'Treasure Found',
    };

    const connection = await amqp.connect(rabbitmqUrl);
    const channel = await connection.createChannel();
    const queueName = 'match.results';
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(redeliveredResults)), { persistent: true });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Stats should NOT have changed (idempotency)
    const playerRes = await pool.query('SELECT * FROM player_stats WHERE nickname = $1', ['Alice']);
    expect(playerRes.rows[0].matches_played).toBe(1); // Still 1, not 2

    await channel.close();
    await connection.close();
  }, 15000);
});
