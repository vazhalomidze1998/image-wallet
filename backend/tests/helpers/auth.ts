import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../src/config/prisma';

let counter = 0;

/** A number no other test user has (users.phone is unique). */
export function uniquePhone() {
  counter += 1;
  return `+1555${String(process.pid % 1000).padStart(3, '0')}${String(counter).padStart(4, '0')}`;
}

/**
 * Registers a unique user and returns its id, email and bearer token.
 * The user gets a verified phone (needed for top-ups) unless `verifiedPhone: false`.
 */
export async function createUser(
  app: Express,
  overrides: { username?: string; email?: string; verifiedPhone?: boolean } = {},
) {
  counter += 1;
  const body = {
    username: overrides.username ?? `user_${Date.now()}_${counter}`,
    email: overrides.email ?? `user${Date.now()}_${counter}@example.com`,
    password: 'password123',
  };

  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);

  let phone: string | null = null;
  if (overrides.verifiedPhone !== false) {
    phone = uniquePhone();
    await prisma.user.update({ where: { id: res.body.data.user.id }, data: { phone, phoneVerifiedAt: new Date() } });
  }

  return {
    id: res.body.data.user.id as string,
    email: body.email,
    phone,
    token: res.body.data.token as string,
    auth: { Authorization: `Bearer ${res.body.data.token}` },
  };
}
