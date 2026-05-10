import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

// Mock pg so the test doesn't need a real Postgres
vi.mock('pg', () => {
  const Pool = vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
    end: vi.fn(),
  }));
  return { default: { Pool } };
});

describe('Gateway GraphQL endpoint', () => {
  it('POST /graphql returns 200 with data for leaderboard query', async () => {
    const server = await createServer();
    const res = await request(server)
      .post('/graphql')
      .send({ query: '{ leaderboard(limit: 5) { nickname matchesPlayed } }' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.leaderboard).toEqual([]);
  });

  it('POST /graphql resolves player query returning null for unknown nickname', async () => {
    const server = await createServer();
    const res = await request(server)
      .post('/graphql')
      .send({ query: '{ player(nickname: "nobody") { nickname } }' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data.player).toBeNull();
  });

  it('POST /graphql resolves recentMatches returning empty array', async () => {
    const server = await createServer();
    const res = await request(server)
      .post('/graphql')
      .send({ query: '{ recentMatches(limit: 5) { id winnerNick } }' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.data.recentMatches).toEqual([]);
  });
});
