import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3001);
const app = createServer();

app.listen(port, () => {
  console.log(`[lobby] listening on :${port}`);
});
