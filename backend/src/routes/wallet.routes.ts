import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller';
import { authenticate } from '../middleware/authenticate';
import { exportLimiter, transferLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { exportQuerySchema, transactionsQuerySchema } from '../schemas/transaction.schema';
import { transferSchema } from '../schemas/wallet.schema';

export const walletRouter = Router();

walletRouter.use(authenticate);

walletRouter.get('/', walletController.getWallet);
walletRouter.post('/transfer', transferLimiter, validate({ body: transferSchema }), walletController.transfer);
walletRouter.get('/transactions', validate({ query: transactionsQuerySchema }), walletController.listTransactions);
walletRouter.get(
  '/transactions/export',
  exportLimiter,
  validate({ query: exportQuerySchema }),
  walletController.exportTransactions,
);
walletRouter.get('/analytics', walletController.analytics);
