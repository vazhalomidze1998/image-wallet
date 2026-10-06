import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const MAX_AMOUNT = new Prisma.Decimal('1000000');

/**
 * Accepts 100, 100.5, "100.50" and converts to Prisma.Decimal via its string form,
 * so money never goes through floating-point arithmetic.
 */
export const amountSchema = z
  .union([z.number(), z.string().trim()], { error: 'Amount is required' })
  .transform((v) => String(v))
  .refine((s) => /^\d+(\.\d{1,2})?$/.test(s), {
    message: 'Amount must be a positive number with at most 2 decimal places',
  })
  .transform((s) => new Prisma.Decimal(s))
  .refine((d) => d.gt(0), { message: 'Amount must be greater than 0' })
  .refine((d) => d.lte(MAX_AMOUNT), { message: `Amount must not exceed ${MAX_AMOUNT.toFixed(2)}` });

/** Money is always serialized as a string with 2 decimals, e.g. "100.00". */
export function formatMoney(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}
