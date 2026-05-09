import { createServer } from './server.js';
import { GameWsServer } from './ws/GameWsServer.js';

const port = Number(process.env['PORT'] ?? 3002);
const internalPort = Number(process.env['GAME_INTERNAL_PORT'] ?? 3010);

const app = createServer();
app.listen(port, () => {
  console.log(`[game] listening on :${port}`);
});

const wsServer = new GameWsServer(internalPort);
wsServer.listen().then(() => {
  console.log(`[game] internal WS listening on :${internalPort}`);
});
