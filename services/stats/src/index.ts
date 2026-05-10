import pg from 'pg';
import { createServer } from './server.js';
import { migrate } from './db/migrate.js';
import { startConsumer } from './consumer.js';

const { Pool } = pg;

const port = Number(process.env.PORT ?? 3003);
const postgresUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/stats';
const rabbitmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost';

const pool = new Pool({
  connectionString: postgresUrl,
});

async function main() {
  try {
    // 1. Migrate DB
    await migrate(pool);

    // 2. Start RabbitMQ consumer
    await startConsumer(rabbitmqUrl, pool);

    // 3. Start HTTP server (Health checks)
    const app = createServer();
    app.listen(port, () => {
      console.log(`[stats] listening on :${port}`);
    });
  } catch (err) {
    console.error('[stats] Fatal error during startup:', err);
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[stats] SIGTERM received, shutting down...');
  await pool.end();
  process.exit(0);
});
