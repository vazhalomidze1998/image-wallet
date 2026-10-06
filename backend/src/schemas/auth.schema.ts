import { z } from 'zod';

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(255, 'Email must be at most 255 characters')
  .pipe(z.email('Invalid email address'));

export const registerSchema = z.object({
  username: z
    .string({ error: 'Username is required' })
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may contain only letters, numbers and underscores'),
  email: emailSchema,
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    // bcrypt only uses the first 72 bytes of input.
    .max(72, 'Password must be at most 72 characters'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Accepts "+995 555 12-34-56" style input and normalises it to E.164 ("+995555123456"). */
export const phoneSchema = z
  .string({ error: 'Phone number is required' })
  .transform((v) => v.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter the phone number in international format, e.g. +995555123456'));

export const sendPhoneCodeSchema = z.strictObject({
  phone: phoneSchema,
});

/** 6-digit SMS code (phone verification and top-up confirmation). */
export const otpCodeSchema = z.string({ error: 'Code is required' }).trim().regex(/^\d{6}$/, 'The code has 6 digits');

export const verifyPhoneSchema = z.strictObject({
  code: otpCodeSchema,
});

export type SendPhoneCodeInput = z.infer<typeof sendPhoneCodeSchema>;
export type VerifyPhoneInput = z.infer<typeof verifyPhoneSchema>;
