import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'gateway' };
    res.status(200).json(body);
  });

  return app;
}
