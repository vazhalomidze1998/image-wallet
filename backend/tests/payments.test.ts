import request from 'supertest';
import { createApp } from '../src/app';
import { signPayload } from '../src/services/payment.service';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { balanceOf, checkout, sendWebhook } from './helpers/wallet';

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser(app);
  bob = await createUser(app);
});
afterAll(() => prisma.$disconnect());

describe('GET /api/wallet', () => {
  it('starts every new wallet at 0.00 USD', async () => {
    const res = await request(app).get('/api/wallet').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      walletId: expect.any(String),
      balance: '0.00',
      currency: 'USD',
      user: { id: alice.id, email: alice.email, username: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/wallet')).status).toBe(401);
  });
});

describe('POST /api/payments/checkout', () => {
  it('creates a pending payment without changing the balance', async () => {
    const res = await checkout(app, alice, 100);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      transaction_id: expect.stringMatching(/^tx_[a-f0-9]{24}$/),
      amount: '100.00',
      currency: 'USD',
      status: 'PENDING',
    });
    expect(await balanceOf(alice.id)).toBe('0.00');

    const tx = await prisma.transaction.findFirstOrThrow({
      where: { referenceId: res.body.data.transaction_id },
    });
    expect(tx).toMatchObject({ type: 'INCOME', category: 'TOP_UP', status: 'PENDING' });
  });

  it('accepts string amounts and keeps exact decimals', async () => {
    const res = await checkout(app, alice, '0.10');
    expect(res.body.data.amount).toBe('0.10');
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['3 decimal places', 10.123],
    ['not a number', 'abc'],
    ['too large', 1_000_000.01],
  ])('rejects %s amount', async (_label, amount) => {
    const res = await checkout(app, alice, amount);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/payments/checkout').send({ amount: 10 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/payments/webhook', () => {
  let txId: string;

  beforeEach(async () => {
    txId = (await checkout(app, alice, '100.00')).body.data.transaction_id;
  });

  it('SUCCESS completes the payment and credits the wallet', async () => {
    const res = await sendWebhook(app, { transaction_id: txId, status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ transaction_id: txId, status: 'COMPLETED', alreadyProcessed: false });
    expect(await balanceOf(alice.id)).toBe('100.00');

    const tx = await prisma.transaction.findFirstOrThrow({ where: { referenceId: txId } });
    expect(tx.status).toBe('COMPLETED');
  });

  it('a duplicate SUCCESS webhook does not credit twice', async () => {
    await sendWebhook(app, { transaction_id: txId, status: 'SUCCESS' });
    const second = await sendWebhook(app, { transaction_id: txId, status: 'SUCCESS' });

    expect(second.status).toBe(200);
    expect(second.body.data.alreadyProcessed).toBe(true);
    expect(await balanceOf(alice.id)).toBe('100.00');
  });

  it('concurrent duplicate webhooks credit exactly once', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => sendWebhook(app, { transaction_id: txId, status: 'SUCCESS' })),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.data.alreadyProcessed === false)).toHaveLength(1);
    expect(await balanceOf(alice.id)).toBe('100.00');
  });

  it('FAILED marks the payment failed without crediting', async () => {
    const res = await sendWebhook(app, { transaction_id: txId, status: 'FAILED' });

    expect(res.body.data.status).toBe('FAILED');
    expect(await balanceOf(alice.id)).toBe('0.00');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { referenceId: txId } });
    expect(tx.status).toBe('FAILED');
  });

  it('final states are never changed (SUCCESS after FAILED is ignored)', async () => {
    await sendWebhook(app, { transaction_id: txId, status: 'FAILED' });
    const res = await sendWebhook(app, { transaction_id: txId, status: 'SUCCESS' });

    expect(res.body.data).toMatchObject({ status: 'FAILED', alreadyProcessed: true });
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it('returns 404 for an unknown transaction', async () => {
    const res = await sendWebhook(app, { transaction_id: 'tx_unknown', status: 'SUCCESS' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('rejects a missing signature', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ transaction_id: txId, status: 'SUCCESS' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it('rejects a wrong signature', async () => {
    const res = await sendWebhook(app, { transaction_id: txId, status: 'SUCCESS' }, 'sha256=deadbeef');

    expect(res.status).toBe(401);
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it('rejects a body modified after signing', async () => {
    const signed = JSON.stringify({ transaction_id: txId, status: 'FAILED' });
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signPayload(signed))
      .send(JSON.stringify({ transaction_id: txId, status: 'SUCCESS' }));

    expect(res.status).toBe(401);
  });

  it('rejects an invalid status', async () => {
    const res = await sendWebhook(app, { transaction_id: txId, status: 'MAYBE' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/:transactionId/simulate (dev only)', () => {
  it('lets the owner complete their own pending payment', async () => {
    const txId = (await checkout(app, alice, 25)).body.data.transaction_id;
    const res = await request(app)
      .post(`/api/payments/${txId}/simulate`)
      .set(alice.auth)
      .send({ status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(await balanceOf(alice.id)).toBe('25.00');
  });

  it('does not let another user complete it', async () => {
    const txId = (await checkout(app, alice, 25)).body.data.transaction_id;
    const res = await request(app)
      .post(`/api/payments/${txId}/simulate`)
      .set(bob.auth)
      .send({ status: 'SUCCESS' });

    expect(res.status).toBe(404);
    expect(await balanceOf(alice.id)).toBe('0.00');
  });
});
