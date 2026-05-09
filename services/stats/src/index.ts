import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3003);
const app = createServer();

app.listen(port, () => {
  console.log(`[stats] listening on :${port}`);
});
