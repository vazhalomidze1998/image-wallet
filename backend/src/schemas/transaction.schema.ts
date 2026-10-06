import { z } from 'zod';
import { paginationQuerySchema } from './common.schema';

/** "2026-01-01" (whole day, UTC) or a full ISO datetime. */
const dateParam = z.union([z.iso.date(), z.iso.datetime({ offset: true })], {
  error: 'Use YYYY-MM-DD or an ISO 8601 datetime',
});

const DAY_MS = 24 * 60 * 60 * 1000;
const isDateOnly = (s: string) => s.length === 10;

const filterShape = {
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
};

/**
 * Converts the raw strings into a half-open range [from, toExclusive).
 * A date-only "to" includes that whole day: to=2026-03-01 → before 2026-03-02T00:00Z.
 */
function toRange<T extends { from?: string; to?: string }>(q: T) {
  const from = q.from ? new Date(isDateOnly(q.from) ? `${q.from}T00:00:00.000Z` : q.from) : undefined;
  let toExclusive: Date | undefined;
  if (q.to) {
    toExclusive = isDateOnly(q.to)
      ? new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY_MS)
      : new Date(new Date(q.to).getTime() + 1);
  }
  return { ...q, from, toExclusive };
}

const rangeIsValid = (q: { from?: Date; toExclusive?: Date }) =>
  !q.from || !q.toExclusive || q.from < q.toExclusive;
const rangeError = { message: '"from" must be before "to"', path: ['from'] };

export const transactionsQuerySchema = paginationQuerySchema
  .extend(filterShape)
  .transform(toRange)
  .refine(rangeIsValid, rangeError);

export const exportQuerySchema = z
  .object({
    format: z.enum(['csv'], { error: 'Only format=csv is supported' }).default('csv'),
    ...filterShape,
  })
  .transform(toRange)
  .refine(rangeIsValid, rangeError);

export type TransactionFilters = {
  type?: 'INCOME' | 'EXPENSE';
  from?: Date;
  toExclusive?: Date;
};
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
