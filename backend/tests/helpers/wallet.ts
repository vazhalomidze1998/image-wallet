import request from 'supertest';
import type { Express } from 'express';
import { signPayload } from '../../src/services/payment.service';
import { prisma } from '../../src/config/prisma';

type Auth = { auth: Record<string, string> };

/** Sends a webhook signed exactly like the payment provider would. */
export function sendWebhook(app: Express, body: object, signature?: string) {
  const raw = JSON.stringify(body);
  return request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Signature', signature ?? signPayload(raw))
    .send(raw);
}

export async function checkout(app: Express, user: Auth, amount: number | string) {
  return request(app).post('/api/payments/checkout').set(user.auth).send({ amount });
}

/** Completes a full top-up: checkout + SUCCESS webhook. */
export async function topUp(app: Express, user: Auth, amount: number | string) {
  const res = await checkout(app, user, amount);
  if (res.status !== 201) throw new Error(`checkout failed: ${JSON.stringify(res.body)}`);
  const hook = await sendWebhook(app, { transaction_id: res.body.data.transaction_id, status: 'SUCCESS' });
  if (hook.status !== 200) throw new Error(`webhook failed: ${JSON.stringify(hook.body)}`);
  return res.body.data.transaction_id as string;
}

export async function balanceOf(userId: string) {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return wallet.balance.toFixed(2);
}
