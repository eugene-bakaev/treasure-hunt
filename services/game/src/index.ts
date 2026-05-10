import { createServer } from './server.js';
import { GameWsServer } from './ws/GameWsServer.js';
import { RabbitMQPublisher } from './rabbitmq/publisher.js';

const port = Number(process.env['PORT'] ?? 3002);
const internalPort = Number(process.env['GAME_INTERNAL_PORT'] ?? 3010);
const rabbitmqUrl = process.env['RABBITMQ_URL'] ?? 'amqp://localhost';

const app = createServer();
app.listen(port, () => {
  console.log(`[game] listening on :${port}`);
});

const publisher = new RabbitMQPublisher(rabbitmqUrl);
publisher.connect().then(() => {
  console.log('[game] RabbitMQ connected');
}).catch((err) => {
  console.error('[game] RabbitMQ connection failed:', err);
});

const wsServer = new GameWsServer(internalPort, (results) => {
  publisher.publishResults(results);
});
wsServer.listen().then(() => {
  console.log(`[game] internal WS listening on :${internalPort}`);
});
