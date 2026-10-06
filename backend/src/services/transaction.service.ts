import type { Writable } from 'node:stream';
import { once } from 'node:events';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { csvRow, UTF8_BOM } from '../utils/csv';
import { formatMoney } from '../utils/money';
import { buildPagination, toSkipTake } from '../utils/pagination';
import type { TransactionFilters } from '../schemas/transaction.schema';
import { getWalletByUserId } from './wallet.service';

const TOP_TRANSACTIONS_LIMIT = 5;
const TREND_MONTHS = 6;
const EXPORT_BATCH_SIZE = 500;

// Newest first; id breaks ties so ordering (and cursor paging) is stable.
const ORDER_BY: Prisma.TransactionOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

const WITH_COUNTERPARTY = {
  counterpartyWallet: { select: { user: { select: { username: true, email: true } } } },
} satisfies Prisma.TransactionInclude;

type TransactionWithCounterparty = Prisma.TransactionGetPayload<{ include: typeof WITH_COUNTERPARTY }>;

function toTransactionDto(tx: TransactionWithCounterparty) {
  return {
    id: tx.id,
    transactionId: tx.referenceId,
    type: tx.type,
    category: tx.category,
    status: tx.status,
    amount: formatMoney(tx.amount),
    description: tx.description,
    counterparty: tx.counterpartyWallet?.user ?? null,
    createdAt: tx.createdAt,
  };
}

function buildWhere(walletId: string, filters: TransactionFilters): Prisma.TransactionWhereInput {
  return {
    walletId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.toExclusive
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.toExclusive ? { lt: filters.toExclusive } : {}),
          },
        }
      : {}),
  };
}

export async function listTransactions(
  userId: string,
  filters: TransactionFilters,
  page: number,
  limit: number,
) {
  const wallet = await getWalletByUserId(userId);
  const where = buildWhere(wallet.id, filters);

  const [rows, total] = await prisma.$transaction([
    prisma.transaction.findMany({ where, orderBy: ORDER_BY, include: WITH_COUNTERPARTY, ...toSkipTake(page, limit) }),
    prisma.transaction.count({ where }),
  ]);

  return {
    data: rows.map(toTransactionDto),
    pagination: buildPagination(page, limit, total),
  };
}

function monthStartUtc(date: Date, offsetMonths = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

/**
 * Current-month analytics (UTC). All sums and counts are computed by PostgreSQL;
 * only the top-N rows and one row per month are loaded into Node.js.
 * Only COMPLETED transactions count; pending/failed top-ups are ignored.
 */
export async function getAnalytics(userId: string, now = new Date()) {
  const wallet = await getWalletByUserId(userId);
  const periodStart = monthStartUtc(now);
  const periodEnd = monthStartUtc(now, 1);
  const trendStart = monthStartUtc(now, -(TREND_MONTHS - 1));

  const monthWhere: Prisma.TransactionWhereInput = {
    walletId: wallet.id,
    status: 'COMPLETED',
    createdAt: { gte: periodStart, lt: periodEnd },
  };

  const [totals, top, trendRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type'],
      where: monthWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where: monthWhere,
      orderBy: [{ amount: 'desc' }, { createdAt: 'desc' }],
      take: TOP_TRANSACTIONS_LIMIT,
      include: WITH_COUNTERPARTY,
    }),
    prisma.$queryRaw<{ month: string; income: Prisma.Decimal; expense: Prisma.Decimal; count: number }[]>`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0)  AS income,
             COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS expense,
             COUNT(*)::int AS count
      FROM transactions
      WHERE wallet_id = ${wallet.id}::uuid
        AND status = 'COMPLETED'
        AND created_at >= ${trendStart}
        AND created_at < ${periodEnd}
      GROUP BY 1
      ORDER BY 1`,
  ]);

  const income = totals.find((t) => t.type === 'INCOME');
  const expense = totals.find((t) => t.type === 'EXPENSE');
  const totalIncome = income?._sum.amount ?? new Prisma.Decimal(0);
  const totalExpense = expense?._sum.amount ?? new Prisma.Decimal(0);

  // Fill months without transactions with zeros so charts get a continuous series.
  const byMonth = new Map(trendRows.map((r) => [r.month, r]));
  const monthlyTrend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const key = monthStartUtc(now, i - (TREND_MONTHS - 1)).toISOString().slice(0, 7);
    const row = byMonth.get(key);
    return {
      month: key,
      income: formatMoney(row?.income),
      expense: formatMoney(row?.expense),
      transactionCount: row?.count ?? 0,
    };
  });

  return {
    period: { from: periodStart, to: periodEnd },
    currency: wallet.currency,
    totalIncome: formatMoney(totalIncome),
    totalExpense: formatMoney(totalExpense),
    net: formatMoney(totalIncome.minus(totalExpense)),
    balance: formatMoney(wallet.balance),
    transactionCount: (income?._count._all ?? 0) + (expense?._count._all ?? 0),
    topTransactions: top.map(toTransactionDto),
    monthlyTrend,
  };
}

export const CSV_HEADER = ['Date', 'Transaction ID', 'Type', 'Amount', 'Description', 'Status'];

/**
 * Streams the CSV in batches (keyset pagination by cursor), so memory use stays
 * constant no matter how many transactions the user has.
 */
export async function exportTransactionsCsv(userId: string, filters: TransactionFilters, out: Writable) {
  const wallet = await getWalletByUserId(userId);
  const where = buildWhere(wallet.id, filters);

  const write = async (chunk: string) => {
    if (!out.write(chunk)) await once(out, 'drain');
  };

  await write(UTF8_BOM + csvRow(CSV_HEADER));

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.transaction.findMany({
      where,
      orderBy: ORDER_BY,
      take: EXPORT_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const tx of batch) {
      await write(
        csvRow([
          tx.createdAt.toISOString(),
          tx.referenceId,
          tx.type,
          formatMoney(tx.amount),
          tx.description ?? '',
          tx.status,
        ]),
      );
    }

    if (batch.length < EXPORT_BATCH_SIZE) break;
    cursor = batch[batch.length - 1]!.id;
  }

  out.end();
}
