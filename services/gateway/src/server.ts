import express from 'express';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): http.Server {
  const app = express();
  app.use(express.json());

  const lobbyUrl = process.env['LOBBY_URL'] ?? 'http://localhost:3001';
  const webUrl = process.env['WEB_URL'] ?? 'http://localhost:5173';

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'gateway' };
    res.status(200).json(body);
  });

  // Proxy /match requests to the lobby service
  app.use(
    '/match',
    createProxyMiddleware({
      target: lobbyUrl,
      changeOrigin: true,
    }),
  );

  // Proxy everything else to the web service
  app.use(
    '/',
    createProxyMiddleware({
      target: webUrl,
      changeOrigin: true,
      ws: true, // handle HMR if needed
    }),
  );

  return http.createServer(app);
}
