import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('lobby server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'lobby' });
  });

  it('POST /match returns matchId and joinCode', async () => {
    const app = createServer();
    const res = await request(app).post('/match');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      matchId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      joinCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
    });
  });

  it('GET /match/join/:joinCode resolves to matchId', async () => {
    const app = createServer();
    const createRes = await request(app).post('/match');
    const { joinCode, matchId } = createRes.body as { joinCode: string; matchId: string };
    const joinRes = await request(app).get(`/match/join/${joinCode}`);
    expect(joinRes.status).toBe(200);
    expect(joinRes.body).toEqual({ matchId });
  });

  it('GET /match/join/UNKNOWN returns 404', async () => {
    const app = createServer();
    const res = await request(app).get('/match/join/ZZZZZZ');
    expect(res.status).toBe(404);
  });
});
