import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Payment } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { formatMoney } from '../utils/money';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, generateOtp, hashOtp, otpExpiry, otpMatches, secondsUntil } from '../utils/otp';
import type { CheckoutInput, VerifyOtpInput, WebhookInput, WebhookStatus } from '../schemas/payment.schema';
import { exposeDevCodes, maskPhone, sendSms } from './sms.service';
import { getWalletByUserId } from './wallet.service';

export const SIGNATURE_HEADER = 'x-webhook-signature';

export { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS };
export const OTP_MAX_SENDS = 3;

function toPaymentDto(payment: Payment) {
  const pending = payment.status === 'PENDING';
  return {
    transaction_id: payment.providerTxId,
    amount: formatMoney(payment.amount),
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    processedAt: payment.processedAt,
    phone: payment.phone ? maskPhone(payment.phone) : null,
    codeExpiresAt: pending ? payment.otpExpiresAt : null,
    resendAvailableAt:
      pending && payment.otpSentAt && payment.otpSendCount < OTP_MAX_SENDS
        ? new Date(payment.otpSentAt.getTime() + OTP_RESEND_COOLDOWN_MS)
        : null,
  };
}

async function findOwnPayment(userId: string, providerTxId: string) {
  const payment = await prisma.payment.findFirst({ where: { providerTxId, userId } });
  if (!payment) throw new NotFoundError('Payment not found', 'PAYMENT_NOT_FOUND');
  return payment;
}

function assertPending(payment: Payment) {
  if (payment.status !== 'PENDING') {
    throw new ConflictError(`This payment is already ${payment.status.toLowerCase()}`, 'PAYMENT_NOT_PENDING');
  }
}

/**
 * Generates a fresh code for a pending payment and texts it to the payment's phone.
 * The send slot is claimed with a conditional update first, so parallel resend requests
 * cannot bypass the cooldown or the send limit.
 */
async function sendPaymentOtp(payment: Payment) {
  const now = new Date();
  const { count } = await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: 'PENDING',
      otpSendCount: { lt: OTP_MAX_SENDS },
      OR: [{ otpSentAt: null }, { otpSentAt: { lte: new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS) } }],
    },
    data: { otpSentAt: now, otpSendCount: { increment: 1 } },
  });
  if (count === 0) {
    const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    assertPending(current);
    if (current.otpSendCount >= OTP_MAX_SENDS) {
      throw new TooManyRequestsError('No more codes can be sent for this payment. Start a new top-up.', 'OTP_SEND_LIMIT');
    }
    const retryAfter = secondsUntil(new Date((current.otpSentAt?.getTime() ?? 0) + OTP_RESEND_COOLDOWN_MS), now.getTime());
    throw new TooManyRequestsError(`Wait ${retryAfter}s before requesting a new code`, 'OTP_RESEND_COOLDOWN');
  }

  const code = generateOtp();
  const minutes = Math.round(env.OTP_TTL_SECONDS / 60);
  try {
    await sendSms(
      payment.phone!,
      `ImageWallet: ${code} is your code to confirm the top-up of ${formatMoney(payment.amount)} ${payment.currency}. Valid for ${minutes} min. Do not share it.`,
    );
  } catch (err) {
    // Give the slot back so the user can retry straight away.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { otpSentAt: payment.otpSentAt, otpSendCount: { decrement: 1 } },
    });
    throw err;
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      otpHash: hashOtp(payment.id, code),
      otpExpiresAt: otpExpiry(now),
      otpAttempts: 0,
    },
  });
  return { ...toPaymentDto(updated), ...(exposeDevCodes && { devCode: code }) };
}

/** "sha256=<hex HMAC of the raw body>", the format the payment provider sends. */
export function signPayload(rawBody: Buffer | string): string {
  return `sha256=${createHmac('sha256', env.WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
}

export function verifySignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!rawBody || !signature) {
    throw new UnauthorizedError('Missing webhook signature', 'INVALID_SIGNATURE');
  }
  const expected = Buffer.from(signPayload(rawBody));
  const received = Buffer.from(signature);
  // Constant-time comparison so the signature cannot be guessed byte by byte.
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new UnauthorizedError('Invalid webhook signature', 'INVALID_SIGNATURE');
  }
}

/**
 * Creates a pending top-up and texts a confirmation code to the user's verified phone.
 * The wallet balance is NOT changed until the code is verified (or the webhook confirms it).
 */
export async function checkout(userId: string, input: CheckoutInput) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user?.phone) {
    throw new ForbiddenError('Verify your phone number before topping up', 'PHONE_NOT_VERIFIED');
  }
  const wallet = await getWalletByUserId(userId);
  const providerTxId = `tx_${randomBytes(12).toString('hex')}`;

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        providerTxId,
        userId,
        walletId: wallet.id,
        amount: input.amount,
        currency: wallet.currency,
        // Snapshot, so changing the account phone later does not redirect this payment's codes.
        phone: user.phone,
      },
    });
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'INCOME',
        category: 'TOP_UP',
        status: 'PENDING',
        amount: input.amount,
        description: 'Wallet top-up',
        referenceId: providerTxId,
        paymentId: created.id,
      },
    });
    return created;
  });

  try {
    return await sendPaymentOtp(payment);
  } catch (err) {
    // The code never reached the user, so this payment can never be confirmed.
    await processWebhook({ transaction_id: providerTxId, status: 'FAILED' });
    throw err;
  }
}

export async function resendOtp(userId: string, providerTxId: string) {
  const payment = await findOwnPayment(userId, providerTxId);
  assertPending(payment);
  return sendPaymentOtp(payment);
}

/**
 * Confirms a pending top-up with the SMS code and credits the wallet.
 * Each attempt is counted *before* the comparison (conditional update), so parallel
 * guesses cannot exceed OTP_MAX_ATTEMPTS; the last failed attempt cancels the payment.
 */
export async function verifyOtp(userId: string, providerTxId: string, input: VerifyOtpInput) {
  const payment = await findOwnPayment(userId, providerTxId);
  assertPending(payment);
  if (!payment.otpHash || !payment.otpExpiresAt) {
    throw new ValidationError('No confirmation code has been sent for this payment', undefined, 'OTP_NOT_SENT');
  }
  if (payment.otpExpiresAt.getTime() < Date.now()) {
    throw new ValidationError('The code has expired. Request a new one.', undefined, 'OTP_EXPIRED');
  }

  const { count } = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'PENDING', otpAttempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { otpAttempts: { increment: 1 } },
  });
  if (count === 0) {
    await processWebhook({ transaction_id: providerTxId, status: 'FAILED' });
    throw new ValidationError('Too many wrong codes. The payment was cancelled.', undefined, 'OTP_TOO_MANY_ATTEMPTS');
  }

  if (!otpMatches(payment.id, input.code, payment.otpHash)) {
    const { otpAttempts } = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const attemptsLeft = OTP_MAX_ATTEMPTS - otpAttempts;
    if (attemptsLeft <= 0) {
      await processWebhook({ transaction_id: providerTxId, status: 'FAILED' });
      throw new ValidationError('Too many wrong codes. The payment was cancelled.', undefined, 'OTP_TOO_MANY_ATTEMPTS');
    }
    throw new ValidationError(
      `Wrong code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`,
      undefined,
      'INVALID_OTP',
    );
  }

  return processWebhook({ transaction_id: providerTxId, status: 'SUCCESS' });
}

/**
 * Idempotent webhook processing.
 *
 * The key step is a conditional update: status changes only WHERE status = 'PENDING'.
 * PostgreSQL row-locks the payment during that UPDATE, so when the same webhook
 * arrives twice (even at the same moment), the second one waits, re-checks the
 * condition, sees COMPLETED/FAILED and updates 0 rows. Only the request that
 * actually changed the status credits the wallet, in the same DB transaction.
 */
export async function processWebhook(input: WebhookInput) {
  const newStatus = input.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED';

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { providerTxId: input.transaction_id } });
    if (!payment) throw new NotFoundError('Payment not found', 'PAYMENT_NOT_FOUND');

    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: newStatus, processedAt: new Date(), otpHash: null },
    });

    if (count === 0) {
      // Already in a final state: acknowledge without changing anything.
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return { ...toPaymentDto(current), alreadyProcessed: true };
    }

    await tx.transaction.update({
      where: { paymentId: payment.id },
      data: { status: newStatus },
    });

    if (newStatus === 'COMPLETED') {
      await tx.wallet.update({
        where: { id: payment.walletId },
        data: { balance: { increment: payment.amount } },
      });
    }

    const updated = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return { ...toPaymentDto(updated), alreadyProcessed: false };
  });
}

/**
 * Development helper standing in for the payment provider: lets the owner of a
 * pending payment trigger the webhook logic without exposing WEBHOOK_SECRET
 * to the browser. Not mounted in production.
 */
export async function simulateProviderCallback(userId: string, providerTxId: string, status: WebhookStatus) {
  const payment = await prisma.payment.findFirst({ where: { providerTxId, userId } });
  if (!payment) throw new NotFoundError('Payment not found', 'PAYMENT_NOT_FOUND');
  return processWebhook({ transaction_id: providerTxId, status });
}
