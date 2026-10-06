import type { Request, RequestHandler } from 'express';
import { prisma } from '../config/prisma';
import { UnauthorizedError } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  const userId = verifyAccessToken(token);

  // A still-valid token may outlive its user (account deleted, DB reset).
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw new UnauthorizedError('User no longer exists', 'INVALID_TOKEN');

  req.user = { id: userId };
  next();
};

/** For handlers mounted behind `authenticate`. */
export function getUserId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}
