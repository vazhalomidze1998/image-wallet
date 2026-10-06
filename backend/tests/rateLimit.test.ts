import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from './helpers/db';

// Limiters read this per request, so it can be toggled for this file only.
beforeAll(() => {
  process.env.ENABLE_RATE_LIMIT_IN_TESTS = 'true';
});
afterAll(async () => {
  delete process.env.ENABLE_RATE_LIMIT_IN_TESTS;
  await prisma.$disconnect();
});

describe('Rate limiting', () => {
  it('blocks the 6th registration attempt from the same IP within an hour', async () => {
    const app = createApp();
    // Invalid bodies still count as attempts but never touch the database.
    const attempt = () => request(app).post('/api/auth/register').send({});

    for (let i = 0; i < 5; i++) {
      expect((await attempt()).status).toBe(400);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: expect.any(String) },
    });
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
  });
});
