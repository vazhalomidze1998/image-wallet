import request from 'supertest';
import { createApp } from '../src/app';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { balanceOf, topUp } from './helpers/wallet';

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;
let bob: TestUser;

function transfer(from: TestUser, body: object) {
  return request(app).post('/api/wallet/transfer').set(from.auth).send(body);
}

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser(app);
  bob = await createUser(app);
  await topUp(app, alice, '100.00');
});
afterAll(() => prisma.$disconnect());

describe('POST /api/wallet/transfer', () => {
  it('moves money and records EXPENSE + INCOME with a shared reference', async () => {
    const res = await transfer(alice, {
      receiver_email: bob.email,
      amount: 50,
      description: 'Dinner repayment',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      transferId: expect.stringMatching(/^trf_[a-f0-9]{32}$/),
      amount: '50.00',
      currency: 'USD',
      description: 'Dinner repayment',
      receiver: { email: bob.email },
      balance: '50.00',
      status: 'COMPLETED',
    });

    expect(await balanceOf(alice.id)).toBe('50.00');
    expect(await balanceOf(bob.id)).toBe('50.00');

    const legs = await prisma.transaction.findMany({
      where: { referenceId: res.body.data.transferId },
      include: { wallet: true },
    });
    expect(legs).toHaveLength(2);
    const expense = legs.find((t) => t.type === 'EXPENSE')!;
    const income = legs.find((t) => t.type === 'INCOME')!;
    expect(expense.wallet.userId).toBe(alice.id);
    expect(income.wallet.userId).toBe(bob.id);
    expect(expense.counterpartyWalletId).toBe(income.walletId);
    expect(income.counterpartyWalletId).toBe(expense.walletId);
    for (const leg of legs) {
      expect(leg).toMatchObject({ category: 'TRANSFER', status: 'COMPLETED', description: 'Dinner repayment' });
      expect(leg.amount.toFixed(2)).toBe('50.00');
    }
  });

  it('handles exact decimal amounts without float errors', async () => {
    await transfer(alice, { receiver_email: bob.email, amount: 0.1 });
    await transfer(alice, { receiver_email: bob.email, amount: 0.2 });

    expect(await balanceOf(bob.id)).toBe('0.30');
    expect(await balanceOf(alice.id)).toBe('99.70');
  });

  it('allows spending the exact full balance', async () => {
    const res = await transfer(alice, { receiver_email: bob.email, amount: '100.00' });

    expect(res.status).toBe(201);
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it('rejects insufficient balance and changes nothing', async () => {
    const res = await transfer(alice, { receiver_email: bob.email, amount: 100.01 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balanceOf(alice.id)).toBe('100.00');
    expect(await balanceOf(bob.id)).toBe('0.00');
    expect(await prisma.transaction.count({ where: { category: 'TRANSFER' } })).toBe(0);
  });

  it('rejects a transfer to yourself', async () => {
    const res = await transfer(alice, { receiver_email: alice.email.toUpperCase(), amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_TRANSFER');
    expect(await balanceOf(alice.id)).toBe('100.00');
  });

  it('rejects a nonexistent receiver', async () => {
    const res = await transfer(alice, { receiver_email: 'ghost@example.com', amount: 10 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RECEIVER_NOT_FOUND');
  });

  it.each([
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -10 }],
    ['3 decimals', { amount: 1.005 }],
    ['invalid email', { receiver_email: 'nope' }],
    ['too long description', { description: 'x'.repeat(256) }],
  ])('rejects %s', async (_label, override) => {
    const res = await transfer(alice, { receiver_email: bob.email, amount: 10, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/wallet/transfer').send({ receiver_email: bob.email, amount: 1 });
    expect(res.status).toBe(401);
  });
});

describe('Concurrency', () => {
  it('prevents double spending: 10 parallel transfers of 20 from 100 → exactly 5 succeed', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => transfer(alice, { receiver_email: bob.email, amount: 20 })),
    );

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 422);
    expect(ok).toHaveLength(5);
    expect(rejected).toHaveLength(5);
    rejected.forEach((r) => expect(r.body.error.code).toBe('INSUFFICIENT_FUNDS'));

    expect(await balanceOf(alice.id)).toBe('0.00');
    expect(await balanceOf(bob.id)).toBe('100.00');
    expect(await prisma.transaction.count({ where: { category: 'TRANSFER' } })).toBe(10);
  });

  it('does not deadlock when two users send to each other at the same time', async () => {
    await topUp(app, bob, '100.00');

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? transfer(alice, { receiver_email: bob.email, amount: 5 })
          : transfer(bob, { receiver_email: alice.email, amount: 5 }),
      ),
    );

    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await balanceOf(alice.id)).toBe('100.00');
    expect(await balanceOf(bob.id)).toBe('100.00');
  });

  it('the database itself refuses a negative balance (CHECK constraint)', async () => {
    await expect(
      prisma.wallet.update({ where: { userId: alice.id }, data: { balance: { decrement: 1000 } } }),
    ).rejects.toThrow(/wallets_balance_non_negative/);
    expect(await balanceOf(alice.id)).toBe('100.00');
  });
});
