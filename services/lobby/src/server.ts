import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';
import { createMatch, resolveJoinCode, listPublicMatches, incrementPlayerCount, getMatch } from './store.js';

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

  app.post('/match', (req, res) => {
    const isPublic = req.body?.isPublic === true;
    const record = createMatch(isPublic);
    res.status(201).json({ matchId: record.matchId, joinCode: record.joinCode });
  });

  app.get('/matches', (_req, res) => {
    const matches = listPublicMatches();
    res.status(200).json(matches);
  });

  app.get('/match/:matchId', (req, res) => {
    const record = getMatch(req.params['matchId'] ?? '');
    if (!record) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }
    res.status(200).json(record);
  });

  app.post('/match/:matchId/join', (req, res) => {
    const matchId = req.params['matchId'] ?? '';
    const success = incrementPlayerCount(matchId);
    if (!success) {
      res.status(400).json({ error: 'Failed to join match' });
      return;
    }
    res.sendStatus(204);
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
