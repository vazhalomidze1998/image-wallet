import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

export function generateOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Keyed hash, so a leaked database row cannot be brute-forced back to the code offline.
 * `scope` binds the code to what it confirms (a payment id, a user + phone number).
 */
export function hashOtp(scope: string, code: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`${scope}:${code}`).digest('hex');
}

export function otpMatches(scope: string, code: string, storedHash: string) {
  const expected = Buffer.from(hashOtp(scope, code));
  const stored = Buffer.from(storedHash);
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}

export function otpExpiry(from: Date) {
  return new Date(from.getTime() + env.OTP_TTL_SECONDS * 1000);
}

export function secondsUntil(date: Date, now = Date.now()) {
  return Math.max(1, Math.ceil((date.getTime() - now) / 1000));
}
