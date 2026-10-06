import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authRouter } from './auth.routes';
import { imageRouter } from './image.routes';
import { paymentRouter } from './payment.routes';
import { walletRouter } from './wallet.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/images', imageRouter);
apiRouter.use('/wallet', walletRouter);
apiRouter.use('/payments', paymentRouter);

apiRouter.get('/health', async (_req, res) => {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }

  res.status(database === 'up' ? 200 : 503).json({
    success: database === 'up',
    data: { status: database === 'up' ? 'ok' : 'degraded', database, uptime: process.uptime() },
  });
});
