import express from 'express';
import cors from 'cors';
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import type { HealthResponse } from '@treasure-hunt/protocol';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';

export async function createServer(): Promise<http.Server> {
  const app = express();

  const lobbyUrl = process.env['LOBBY_URL'] ?? 'http://localhost:3001';
  const webUrl = process.env['WEB_URL'] ?? 'http://localhost:5173';

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'gateway' };
    res.status(200).json(body);
  });

  // GraphQL endpoint — before catch-all proxy
  const apollo = new ApolloServer({ typeDefs, resolvers });
  await apollo.start();
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(apollo),
  );

  // Proxy /match and /matches requests to the lobby service
  app.use(
    createProxyMiddleware({
      target: lobbyUrl,
      changeOrigin: true,
      pathFilter: ['/match', '/matches'],
      on: {
        proxyReq: (_proxyReq, req) => {
          console.log(`[proxy] -> lobby: ${req.method} ${req.url}`);
        },
        error: (err) => {
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
      ws: false, // Internal handler handles /ws
      on: {
        proxyReq: (_proxyReq, req) => {
          if (!req.url?.match(/\.(js|css|png|jpg|svg|ico)$/)) {
            console.log(`[proxy] -> web: ${req.method} ${req.url}`);
          }
        },
        error: (err) => {
          console.error(`[proxy] web error: ${err.message}`);
        },
      },
    }),
  );

  app.use(express.json());

  return http.createServer(app);
}
