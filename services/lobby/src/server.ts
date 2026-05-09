import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';
import { createMatch, resolveJoinCode } from './store.js';

export function createServer(): Express {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'lobby' };
    res.status(200).json(body);
  });

  app.post('/match', (_req, res) => {
    const record = createMatch();
    res.status(201).json({ matchId: record.matchId, joinCode: record.joinCode });
  });

  app.get('/match/join/:joinCode', (req, res) => {
    const record = resolveJoinCode(req.params['joinCode'] ?? '');
    if (!record) {
      res.status(404).json({ error: 'Invalid join code' });
      return;
    }
    res.status(200).json({ matchId: record.matchId });
  });

  return app;
}
