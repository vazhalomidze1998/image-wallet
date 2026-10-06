import type { Request, Response } from 'express';
import { getUserId } from '../middleware/authenticate';
import * as paymentService from '../services/payment.service';
import type { CheckoutInput, VerifyOtpInput, WebhookInput, WebhookStatus } from '../schemas/payment.schema';

export async function checkout(req: Request, res: Response) {
  const payment = await paymentService.checkout(getUserId(req), req.body as CheckoutInput);
  res.status(201).json({ success: true, data: payment });
}

export async function verify(req: Request, res: Response) {
  const { transactionId } = req.params as { transactionId: string };
  const result = await paymentService.verifyOtp(getUserId(req), transactionId, req.body as VerifyOtpInput);
  res.json({ success: true, data: result });
}

export async function resendCode(req: Request, res: Response) {
  const { transactionId } = req.params as { transactionId: string };
  const payment = await paymentService.resendOtp(getUserId(req), transactionId);
  res.json({ success: true, data: payment });
}

export async function webhook(req: Request, res: Response) {
  // Always 200 for a valid, known payment (also when already processed),
  // so the provider stops retrying.
  const result = await paymentService.processWebhook(req.body as WebhookInput);
  res.json({ success: true, data: result });
}

export async function simulate(req: Request, res: Response) {
  const { transactionId } = req.params as { transactionId: string };
  const { status } = req.body as { status: WebhookStatus };
  const result = await paymentService.simulateProviderCallback(getUserId(req), transactionId, status);
  res.json({ success: true, data: result });
}
