import express from 'express';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): http.Server {
  const app = express();

  const lobbyUrl = process.env['LOBBY_URL'] ?? 'http://localhost:3001';
  const webUrl = process.env['WEB_URL'] ?? 'http://localhost:5173';

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'gateway' };
    res.status(200).json(body);
  });

  // Proxy /match requests to the lobby service (preserving the path)
  app.use(
    createProxyMiddleware({
      target: lobbyUrl,
      changeOrigin: true,
      pathFilter: '/match',
      on: {
        proxyReq: (proxyReq, req, _res) => {
          console.log(`[proxy] -> lobby: ${req.method} ${req.url}`);
        },
        error: (err, req, res) => {
          console.error(`[proxy] lobby error: ${err.message}`);
        },
      },
    }),
  );

  // Proxy everything else to the web service
  app.use(
    createProxyMiddleware({
      target: webUrl,
      changeOrigin: true,
      ws: true,
      on: {
        proxyReq: (proxyReq, req, _res) => {
          // Only log non-static assets to avoid noise
          if (!req.url?.match(/\.(js|css|png|jpg|svg|ico)$/)) {
            console.log(`[proxy] -> web: ${req.method} ${req.url}`);
          }
        },
        error: (err, req, res) => {
          console.error(`[proxy] web error: ${err.message}`);
        },
      },
    }),
  );

  app.use(express.json());

  return http.createServer(app);
}
