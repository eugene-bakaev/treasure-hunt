import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3002);
const app = createServer();

app.listen(port, () => {
  console.log(`[game] listening on :${port}`);
});
