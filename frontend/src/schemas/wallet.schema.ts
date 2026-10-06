import { z } from 'zod'

const MAX_AMOUNT = 1_000_000

/**
 * Amounts stay strings (exactly what the user typed) and are sent as strings;
 * the backend converts them to Decimal. No float math happens in the browser.
 */
export const amountField = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter a positive amount with up to 2 decimals')
  .refine((v) => Number(v) > 0, 'Amount must be greater than 0')
  .refine((v) => Number(v) <= MAX_AMOUNT, 'Amount must not exceed 1,000,000.00')

/**
 * Accepts "+995 555 12 34 56", "555123456" (Georgian mobile, +995 added) etc.
 * and normalises to E.164, which is what the backend expects.
 */
export const phoneField = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .transform((v) => {
    const digits = v.replace(/[\s().-]/g, '')
    return /^5\d{8}$/.test(digits) ? `+995${digits}` : digits
  })
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid number, e.g. +995 555 12 34 56'))

export const topUpSchema = z.object({ amount: amountField })

export const phoneSchema = z.object({ phone: phoneField })

export function makeTransferSchema(ownEmail: string | undefined) {
  return z.object({
    receiver_email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Receiver email is required')
      .pipe(z.email('Enter a valid email address'))
      .refine((email) => email !== ownEmail?.toLowerCase(), 'You cannot transfer money to yourself'),
    amount: amountField,
    description: z.string().trim().max(255, 'At most 255 characters').optional(),
  })
}

export type TopUpForm = z.infer<typeof topUpSchema>
export type PhoneForm = z.input<typeof phoneSchema>
export type PhoneValues = z.output<typeof phoneSchema>
export type TransferForm = z.infer<ReturnType<typeof makeTransferSchema>>
