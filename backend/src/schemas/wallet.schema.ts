import { z } from 'zod';
import { amountSchema } from '../utils/money';
import { emailSchema } from './auth.schema';

export const transferSchema = z.strictObject({
  receiver_email: emailSchema,
  amount: amountSchema,
  description: z.string().trim().max(255, 'Description must be at most 255 characters').optional(),
});

export type TransferInput = z.infer<typeof transferSchema>;
