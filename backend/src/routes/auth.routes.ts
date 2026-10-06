import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { loginLimiter, phoneCodeLimiter, phoneVerifyLimiter, registerLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { loginSchema, registerSchema, sendPhoneCodeSchema, verifyPhoneSchema } from '../schemas/auth.schema';

export const authRouter = Router();

authRouter.post('/register', registerLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
authRouter.get('/me', authenticate, authController.me);

// Phone verification: the verified number receives the top-up confirmation codes.
authRouter.post('/phone', authenticate, phoneCodeLimiter, validate({ body: sendPhoneCodeSchema }), authController.sendPhoneCode);
authRouter.post('/phone/verify', authenticate, phoneVerifyLimiter, validate({ body: verifyPhoneSchema }), authController.verifyPhone);
