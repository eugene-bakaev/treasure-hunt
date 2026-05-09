import { createServer } from './server.js';
import { attachWebSocket } from './ws/clientHandler.js';

const port = Number(process.env['PORT'] ?? 3000);
const server = createServer();

attachWebSocket(server);

server.listen(port, () => {
  console.log(`[gateway] listening on :${port}`);
});
