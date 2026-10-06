import { z } from 'zod';
import { amountSchema } from '../utils/money';
import { otpCodeSchema } from './auth.schema';

/** The code is sent to the account's verified phone, so only the amount is needed. */
export const checkoutSchema = z.strictObject({
  amount: amountSchema,
});

export const paymentParamsSchema = z.object({
  transactionId: z.string().trim().min(1).max(64),
});

export const verifyOtpSchema = z.strictObject({
  code: otpCodeSchema,
});

export const webhookStatusSchema = z.enum(['SUCCESS', 'FAILED']);

export const webhookSchema = z.object({
  transaction_id: z.string().trim().min(1).max(64),
  status: webhookStatusSchema,
});

export const simulateParamsSchema = paymentParamsSchema;

export const simulateBodySchema = z.strictObject({
  status: webhookStatusSchema,
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
export type WebhookStatus = z.infer<typeof webhookStatusSchema>;
