import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { formatMoney } from '../utils/money';
import type { TransferInput } from '../schemas/wallet.schema';

export async function getWalletByUserId(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: { user: { select: { id: true, username: true, email: true } } },
  });
  if (!wallet) throw new NotFoundError('Wallet not found', 'WALLET_NOT_FOUND');
  return wallet;
}

export async function getWallet(userId: string) {
  const wallet = await getWalletByUserId(userId);
  return {
    walletId: wallet.id,
    balance: formatMoney(wallet.balance),
    currency: wallet.currency,
    user: wallet.user,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

/**
 * P2P transfer. Everything happens in one DB transaction:
 *
 * 1. Both wallet rows are locked with SELECT ... FOR UPDATE. Concurrent transfers
 *    touching the same wallet wait for each other, so the balance check below
 *    always sees the latest committed balance (no double spending).
 * 2. Rows are locked in a fixed order (by id), so A→B and B→A running at the
 *    same time cannot deadlock.
 * 3. Any error rolls back the debit, credit and both ledger entries together.
 * 4. CHECK (balance >= 0) in the database is a final safety net.
 */
export async function transfer(senderUserId: string, input: TransferInput) {
  const receiver = await prisma.user.findUnique({
    where: { email: input.receiver_email },
    select: { id: true, username: true, email: true, wallet: { select: { id: true } } },
  });
  if (!receiver?.wallet) throw new NotFoundError('Receiver not found', 'RECEIVER_NOT_FOUND');
  if (receiver.id === senderUserId) {
    throw new ValidationError('You cannot transfer money to yourself', undefined, 'SELF_TRANSFER');
  }

  const senderWallet = await getWalletByUserId(senderUserId);
  const receiverWalletId = receiver.wallet.id;
  const amount = input.amount;
  const referenceId = `trf_${randomUUID().replace(/-/g, '')}`;
  const description = input.description || null;

  const result = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal; currency: string }[]>`
        SELECT id, balance, currency FROM wallets
        WHERE id IN (${senderWallet.id}::uuid, ${receiverWalletId}::uuid)
        ORDER BY id
        FOR UPDATE`;

      const sender = locked.find((w) => w.id === senderWallet.id);
      const target = locked.find((w) => w.id === receiverWalletId);
      if (!sender || !target) throw new NotFoundError('Wallet not found', 'WALLET_NOT_FOUND');

      if (sender.currency !== target.currency) {
        throw new ValidationError('Wallet currencies do not match', undefined, 'CURRENCY_MISMATCH');
      }
      if (new Prisma.Decimal(sender.balance).lt(amount)) {
        throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Insufficient balance');
      }

      const updatedSender = await tx.wallet.update({
        where: { id: sender.id },
        data: { balance: { decrement: amount } },
      });
      await tx.wallet.update({
        where: { id: target.id },
        data: { balance: { increment: amount } },
      });

      await tx.transaction.createMany({
        data: [
          {
            walletId: sender.id,
            type: 'EXPENSE',
            category: 'TRANSFER',
            status: 'COMPLETED',
            amount,
            description,
            referenceId,
            counterpartyWalletId: target.id,
          },
          {
            walletId: target.id,
            type: 'INCOME',
            category: 'TRANSFER',
            status: 'COMPLETED',
            amount,
            description,
            referenceId,
            counterpartyWalletId: sender.id,
          },
        ],
      });

      return { balance: updatedSender.balance, currency: updatedSender.currency };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 10_000 },
  );

  return {
    transferId: referenceId,
    amount: formatMoney(amount),
    currency: result.currency,
    description,
    receiver: { username: receiver.username, email: receiver.email },
    balance: formatMoney(result.balance),
    status: 'COMPLETED' as const,
  };
}
