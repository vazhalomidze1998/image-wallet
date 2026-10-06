import { Router, type RequestHandler } from 'express';
import { isProduction } from '../config/env';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middleware/authenticate';
import { paymentLimiter, webhookLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  checkoutSchema,
  paymentParamsSchema,
  simulateBodySchema,
  simulateParamsSchema,
  verifyOtpSchema,
  webhookSchema,
} from '../schemas/payment.schema';
import { SIGNATURE_HEADER, verifySignature } from '../services/payment.service';

const verifyWebhookSignature: RequestHandler = (req, _res, next) => {
  verifySignature(req.rawBody, req.get(SIGNATURE_HEADER));
  next();
};

export const paymentRouter = Router();

paymentRouter.post('/checkout', authenticate, paymentLimiter, validate({ body: checkoutSchema }), paymentController.checkout);

// SMS confirmation of a pending top-up.
paymentRouter.post(
  '/:transactionId/verify',
  authenticate,
  paymentLimiter,
  validate({ params: paymentParamsSchema, body: verifyOtpSchema }),
  paymentController.verify,
);
paymentRouter.post(
  '/:transactionId/resend-code',
  authenticate,
  paymentLimiter,
  validate({ params: paymentParamsSchema }),
  paymentController.resendCode,
);

// Called by the payment provider: authenticated by HMAC signature, not by JWT.
paymentRouter.post(
  '/webhook',
  webhookLimiter,
  verifyWebhookSignature,
  validate({ body: webhookSchema }),
  paymentController.webhook,
);

if (!isProduction) {
  paymentRouter.post(
    '/:transactionId/simulate',
    authenticate,
    paymentLimiter,
    validate({ params: simulateParamsSchema, body: simulateBodySchema }),
    paymentController.simulate,
  );
}
