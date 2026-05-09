import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('gateway server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const server = createServer();
    const res = await request(server).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'gateway' });
  });
});
