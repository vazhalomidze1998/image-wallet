import { rateLimit, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { isTest } from '../config/env';




function createLimiter(options: Partial<Options> & { message: string }) {
  const { message, ...rest } = options;
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => isTest && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true',
    handler: (_req, res, _next, opts) => {
      res.status(opts.statusCode).json({
        success: false,
        error: { code: 'RATE_LIMITED', message },
      });
    },
    ...rest,
  });
}

export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many accounts created from this IP, try again later',
});

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Only failed attempts count towards the limit (brute-force protection).
  skipSuccessfulRequests: true,
  message: 'Too many failed login attempts, try again later',
});

/** For routes behind `authenticate`: limit per user, not per IP. */
function userKey(req: Request): string {
  return req.user?.id ?? 'anonymous';
}

export const imageUploadLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: userKey,
  message: 'Too many uploads, try again in a minute',
});

export const transformLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: userKey,
  message: 'Too many transformation requests, try again in a minute',
});

export const paymentLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: userKey,
  message: 'Too many payment requests, try again in a minute',
});

/** Each request may send an SMS, so this is stricter than the in-service cooldown alone. */
export const phoneCodeLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: userKey,
  message: 'Too many verification codes requested, try again later',
});

export const phoneVerifyLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: userKey,
  message: 'Too many verification attempts, try again in a minute',
});

export const transferLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: userKey,
  message: 'Too many transfers, try again in a minute',
});

/** Webhooks come from the provider's servers, so limit per IP. */
export const webhookLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 60,
  message: 'Too many webhook requests',
});

export const exportLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 5,
  keyGenerator: userKey,
  message: 'Too many exports, try again in a minute',
});
