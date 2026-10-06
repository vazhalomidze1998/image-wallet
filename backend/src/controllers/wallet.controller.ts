import type { Request, Response } from 'express';
import { getUserId } from '../middleware/authenticate';
import * as walletService from '../services/wallet.service';
import type { TransferInput } from '../schemas/wallet.schema';
import type { ExportQuery, TransactionsQuery } from '../schemas/transaction.schema';
import * as transactionService from '../services/transaction.service';

export async function getWallet(req: Request, res: Response) {
  const wallet = await walletService.getWallet(getUserId(req));
  res.json({ success: true, data: wallet });
}

export async function transfer(req: Request, res: Response) {
  const result = await walletService.transfer(getUserId(req), req.body as TransferInput);
  res.status(201).json({ success: true, data: result });
}

export async function listTransactions(req: Request, res: Response) {
  const { page, limit, type, from, toExclusive } = req.query as unknown as TransactionsQuery;
  const result = await transactionService.listTransactions(getUserId(req), { type, from, toExclusive }, page, limit);
  res.json({ success: true, ...result });
}

export async function analytics(req: Request, res: Response) {
  const result = await transactionService.getAnalytics(getUserId(req));
  res.json({ success: true, data: result });
}

export async function exportTransactions(req: Request, res: Response) {
  const { type, from, toExclusive } = req.query as unknown as ExportQuery;
  const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  await transactionService.exportTransactionsCsv(getUserId(req), { type, from, toExclusive }, res);
}
