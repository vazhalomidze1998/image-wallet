import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as phoneService from '../services/phone.service';
import { getUserId } from '../middleware/authenticate';
import type { LoginInput, RegisterInput, SendPhoneCodeInput, VerifyPhoneInput } from '../schemas/auth.schema';

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json({ success: true, data: result });
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body as LoginInput);
  res.json({ success: true, data: result });
}

export async function me(req: Request, res: Response) {
  const user = await authService.getCurrentUser(getUserId(req));
  res.json({ success: true, data: { user } });
}

export async function sendPhoneCode(req: Request, res: Response) {
  const result = await phoneService.sendPhoneCode(getUserId(req), req.body as SendPhoneCodeInput);
  res.json({ success: true, data: result });
}

export async function verifyPhone(req: Request, res: Response) {
  const user = await phoneService.verifyPhone(getUserId(req), req.body as VerifyPhoneInput);
  res.json({ success: true, data: { user } });
}
