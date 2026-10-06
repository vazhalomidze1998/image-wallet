import request from 'supertest';
import { createApp } from '../src/app';
import { getAnalytics } from '../src/services/transaction.service';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { checkout, sendWebhook, topUp } from './helpers/wallet';

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;
let bob: TestUser;

function transfer(from: TestUser, to: TestUser, amount: number, description?: string) {
  return request(app)
    .post('/api/wallet/transfer')
    .set(from.auth)
    .send({ receiver_email: to.email, amount, description });
}

async function setCreatedAt(referenceId: string, iso: string) {
  await prisma.transaction.updateMany({ where: { referenceId }, data: { createdAt: new Date(iso) } });
}

/**
 * Alice's ledger after setup (newest first):
 *   INCOME   10.00 COMPLETED  (from Bob)
 *   EXPENSE  30.00 COMPLETED  (to Bob, "Dinner, with \"friends\"")
 *   INCOME  100.00 COMPLETED  (top-up)
 *   INCOME    5.00 PENDING    (top-up, not confirmed)
 *   INCOME    7.00 FAILED     (top-up, failed)
 */
async function seedLedger() {
  await topUp(app, alice, 100);
  await transfer(alice, bob, 30, 'Dinner, with "friends"');
  await transfer(bob, alice, 10, 'Refund');
  await checkout(app, alice, 5);
  const failed = await checkout(app, alice, 7);
  await sendWebhook(app, { transaction_id: failed.body.data.transaction_id, status: 'FAILED' });
}

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser(app);
  bob = await createUser(app);
});
afterAll(() => prisma.$disconnect());

describe('GET /api/wallet/transactions', () => {
  it('returns only the user\'s transactions, newest first, with pagination', async () => {
    await seedLedger();

    const res = await request(app).get('/api/wallet/transactions?page=1&limit=10').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 5, totalPages: 1 });
    const dates = res.body.data.map((t: { createdAt: string }) => t.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);

    const expense = res.body.data.find((t: { type: string }) => t.type === 'EXPENSE');
    expect(expense).toMatchObject({
      transactionId: expect.stringMatching(/^trf_/),
      amount: '30.00',
      status: 'COMPLETED',
      category: 'TRANSFER',
      description: 'Dinner, with "friends"',
      counterparty: { email: bob.email, username: expect.any(String) },
    });

    // Bob sees only his own side of the two transfers.
    const bobs = await request(app).get('/api/wallet/transactions').set(bob.auth);
    expect(bobs.body.pagination.total).toBe(2);
  });

  it('paginates', async () => {
    await seedLedger();

    const page2 = await request(app).get('/api/wallet/transactions?page=2&limit=2').set(alice.auth);
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });

    const page3 = await request(app).get('/api/wallet/transactions?page=3&limit=2').set(alice.auth);
    expect(page3.body.data).toHaveLength(1);
  });

  it('filters by type', async () => {
    await seedLedger();

    const income = await request(app).get('/api/wallet/transactions?type=INCOME').set(alice.auth);
    expect(income.body.pagination.total).toBe(4);
    expect(income.body.data.every((t: { type: string }) => t.type === 'INCOME')).toBe(true);

    const expense = await request(app).get('/api/wallet/transactions?type=EXPENSE').set(alice.auth);
    expect(expense.body.pagination.total).toBe(1);
  });

  it('filters by date range; "to" includes the whole day', async () => {
    const txA = await topUp(app, alice, 1);
    const txB = await topUp(app, alice, 2);
    const txC = await topUp(app, alice, 3);
    await setCreatedAt(txA, '2026-01-15T10:00:00Z');
    await setCreatedAt(txB, '2026-03-01T23:59:00Z');
    await setCreatedAt(txC, '2026-03-02T00:00:00Z');

    const res = await request(app)
      .get('/api/wallet/transactions?from=2026-01-01&to=2026-03-01')
      .set(alice.auth);

    expect(res.body.data.map((t: { transactionId: string }) => t.transactionId)).toEqual([txB, txA]);

    const combined = await request(app)
      .get('/api/wallet/transactions?type=INCOME&from=2026-03-02')
      .set(alice.auth);
    expect(combined.body.data.map((t: { transactionId: string }) => t.transactionId)).toEqual([txC]);
  });

  it.each([
    'type=FOO',
    'from=yesterday',
    'to=2026-13-01',
    'from=2026-03-01&to=2026-01-01',
    'page=0',
    'limit=1000',
  ])('rejects invalid query: %s', async (qs) => {
    const res = await request(app).get(`/api/wallet/transactions?${qs}`).set(alice.auth);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/wallet/transactions')).status).toBe(401);
  });
});

describe('GET /api/wallet/analytics', () => {
  it('aggregates the current month, counting only completed transactions', async () => {
    await seedLedger();

    const res = await request(app).get('/api/wallet/analytics').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      currency: 'USD',
      totalIncome: '110.00',
      totalExpense: '30.00',
      net: '80.00',
      balance: '80.00',
      transactionCount: 3,
    });
    expect(res.body.data.topTransactions.map((t: { amount: string }) => t.amount)).toEqual([
      '100.00',
      '30.00',
      '10.00',
    ]);
  });

  it('excludes transactions from previous months but shows them in the trend', async () => {
    const old = await topUp(app, alice, 40);
    await topUp(app, alice, 60);
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    await setCreatedAt(old, lastMonth.toISOString());

    const res = await request(app).get('/api/wallet/analytics').set(alice.auth);

    expect(res.body.data.totalIncome).toBe('60.00');
    expect(res.body.data.transactionCount).toBe(1);
    expect(res.body.data.balance).toBe('100.00');

    const trend = res.body.data.monthlyTrend;
    expect(trend).toHaveLength(6);
    expect(trend[5]).toMatchObject({ month: now.toISOString().slice(0, 7), income: '60.00', transactionCount: 1 });
    expect(trend[4]).toMatchObject({ month: lastMonth.toISOString().slice(0, 7), income: '40.00' });
    expect(trend[0]).toMatchObject({ income: '0.00', expense: '0.00', transactionCount: 0 });
  });

  it('returns zeros for a new wallet', async () => {
    const res = await request(app).get('/api/wallet/analytics').set(alice.auth);

    expect(res.body.data).toMatchObject({
      totalIncome: '0.00',
      totalExpense: '0.00',
      balance: '0.00',
      transactionCount: 0,
      topTransactions: [],
    });
  });

  it('aggregates in the database instead of loading every row', async () => {
    await seedLedger();
    const findMany = jest.spyOn(prisma.transaction, 'findMany');

    await getAnalytics(alice.id);

    // Only the top-5 query loads rows, and it is capped.
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 5 });
    findMany.mockRestore();
  });
});

describe('GET /api/wallet/transactions/export', () => {
  function parseCsv(text: string) {
    return text
      .replace(/^﻿/, '')
      .trim()
      .split('\r\n');
  }

  it('downloads a CSV with correct headers and rows', async () => {
    await seedLedger();

    const res = await request(app).get('/api/wallet/transactions/export?format=csv').set(alice.auth);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="transactions-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.text.startsWith('﻿')).toBe(true);

    const lines = parseCsv(res.text);
    expect(lines[0]).toBe('Date,Transaction ID,Type,Amount,Description,Status');
    expect(lines).toHaveLength(6);
    expect(lines.some((l) => l.includes(',EXPENSE,30.00,"Dinner, with ""friends""",COMPLETED'))).toBe(true);
  });

  it('applies the same filters as the history', async () => {
    await seedLedger();

    const res = await request(app).get('/api/wallet/transactions/export?type=EXPENSE').set(alice.auth);
    expect(parseCsv(res.text)).toHaveLength(2);
  });

  it('neutralizes spreadsheet formulas in descriptions', async () => {
    await topUp(app, alice, 10);
    await transfer(alice, bob, 1, '=HYPERLINK("http://evil")');

    const res = await request(app).get('/api/wallet/transactions/export').set(alice.auth);
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('exports more rows than one batch', async () => {
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: alice.id } });
    await prisma.transaction.createMany({
      data: Array.from({ length: 1203 }, (_, i) => ({
        walletId: wallet.id,
        type: 'INCOME' as const,
        category: 'TOP_UP' as const,
        status: 'COMPLETED' as const,
        amount: 1,
        referenceId: `tx_bulk_${i}`,
      })),
    });

    const res = await request(app).get('/api/wallet/transactions/export').set(alice.auth);
    const lines = parseCsv(res.text);

    expect(lines).toHaveLength(1204);
    expect(new Set(lines).size).toBe(1204);
  });

  it('rejects unsupported formats', async () => {
    const res = await request(app).get('/api/wallet/transactions/export?format=pdf').set(alice.auth);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/wallet/transactions/export')).status).toBe(401);
  });
});
