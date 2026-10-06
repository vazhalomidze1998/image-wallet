import { Prisma, type PhoneVerification } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { ConflictError, TooManyRequestsError, ValidationError } from '../utils/errors';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  generateOtp,
  hashOtp,
  otpExpiry,
  otpMatches,
  secondsUntil,
} from '../utils/otp';
import type { SendPhoneCodeInput, VerifyPhoneInput } from '../schemas/auth.schema';
import { toPublicUser } from './auth.service';
import { exposeDevCodes, maskPhone, sendSms } from './sms.service';

/** The code only confirms this exact number for this exact user. */
function otpScope(userId: string, phone: string) {
  return `phone:${userId}:${phone}`;
}

function toVerificationDto(v: PhoneVerification) {
  return {
    phone: maskPhone(v.phone),
    codeExpiresAt: v.expiresAt,
    resendAvailableAt: new Date(v.sentAt.getTime() + OTP_RESEND_COOLDOWN_MS),
  };
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Texts a code that links `input.phone` to the account once verified.
 * One pending verification per user; a new request replaces it (after the cooldown),
 * so the cooldown also applies when switching between numbers.
 */
export async function sendPhoneCode(userId: string, input: SendPhoneCodeInput) {
  const { phone } = input;
  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (owner?.id === userId) {
    throw new ConflictError('This number is already verified on your account', 'PHONE_ALREADY_VERIFIED');
  }
  if (owner) throw new ConflictError('This number is linked to another account', 'PHONE_TAKEN');

  const now = new Date();
  const code = generateOtp();
  const data = { phone, otpHash: hashOtp(otpScope(userId, phone), code), expiresAt: otpExpiry(now), sentAt: now, attempts: 0 };

  // Claim the send slot with a conditional write, so parallel requests cannot bypass the cooldown.
  let claimed: PhoneVerification | null = null;
  const { count } = await prisma.phoneVerification.updateMany({
    where: { userId, sentAt: { lte: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS) } },
    data,
  });
  if (count === 1) {
    claimed = await prisma.phoneVerification.findUnique({ where: { userId } });
  } else {
    try {
      claimed = await prisma.phoneVerification.create({ data: { userId, ...data } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  if (!claimed) {
    const current = await prisma.phoneVerification.findUniqueOrThrow({ where: { userId } });
    const retryAfter = secondsUntil(new Date(current.sentAt.getTime() + OTP_RESEND_COOLDOWN_MS), now.getTime());
    throw new TooManyRequestsError(`Wait ${retryAfter}s before requesting a new code`, 'OTP_RESEND_COOLDOWN');
  }

  const minutes = Math.round(env.OTP_TTL_SECONDS / 60);
  try {
    await sendSms(phone, `ImageWallet: ${code} is your code to verify this phone number. Valid for ${minutes} min. Do not share it.`);
  } catch (err) {
    // Nothing was delivered: drop the row so the user can retry straight away.
    await prisma.phoneVerification.deleteMany({ where: { id: claimed.id } });
    throw err;
  }

  return { ...toVerificationDto(claimed), ...(exposeDevCodes && { devCode: code }) };
}

/**
 * Checks the code and saves the number as the account's verified phone.
 * Attempts are counted with a conditional update before comparing, so parallel guesses
 * cannot exceed OTP_MAX_ATTEMPTS; after that a new code has to be requested.
 */
export async function verifyPhone(userId: string, input: VerifyPhoneInput) {
  const verification = await prisma.phoneVerification.findUnique({ where: { userId } });
  if (!verification) {
    throw new ValidationError('Request a verification code first', undefined, 'OTP_NOT_SENT');
  }
  if (verification.expiresAt.getTime() < Date.now()) {
    throw new ValidationError('The code has expired. Request a new one.', undefined, 'OTP_EXPIRED');
  }

  const tooManyAttempts = new ValidationError('Too many wrong codes. Request a new one.', undefined, 'OTP_TOO_MANY_ATTEMPTS');
  const { count } = await prisma.phoneVerification.updateMany({
    // Matching the hash too: attempts only count against the code they were made for.
    where: { id: verification.id, otpHash: verification.otpHash, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (count === 0) throw tooManyAttempts;

  if (!otpMatches(otpScope(userId, verification.phone), input.code, verification.otpHash)) {
    const current = await prisma.phoneVerification.findUnique({ where: { id: verification.id } });
    const attemptsLeft = OTP_MAX_ATTEMPTS - (current?.attempts ?? OTP_MAX_ATTEMPTS);
    if (attemptsLeft <= 0) throw tooManyAttempts;
    throw new ValidationError(
      `Wrong code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`,
      undefined,
      'INVALID_OTP',
    );
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Consuming the row first makes the code single-use, even with parallel requests.
      const consumed = await tx.phoneVerification.deleteMany({
        where: { id: verification.id, otpHash: verification.otpHash },
      });
      if (consumed.count === 0) {
        throw new ValidationError('This code is no longer valid. Enter the latest code.', undefined, 'OTP_NOT_SENT');
      }
      return tx.user.update({
        where: { id: userId },
        data: { phone: verification.phone, phoneVerifiedAt: new Date() },
      });
    });
    return toPublicUser(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Another account verified the same number in the meantime.
      await prisma.phoneVerification.deleteMany({ where: { id: verification.id } });
      throw new ConflictError('This number is linked to another account', 'PHONE_TAKEN');
    }
    throw err;
  }
}
