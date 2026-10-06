import bcrypt from 'bcrypt';
import { Prisma, type User } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { signAccessToken } from '../utils/jwt';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema';
import { maskPhone } from './sms.service';

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  /** Masked verified number, e.g. "+995 ••• ••• 456"; null until verified. */
  phone: string | null;
  phoneVerified: boolean;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone ? maskPhone(user.phone) : null,
    phoneVerified: user.phone !== null,
    createdAt: user.createdAt,
  };
}

// Compared against when the email is unknown so both failure paths take the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy-password', 10);

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true },
  });
  if (existing) throw duplicateError(existing.email === input.email ? 'email' : 'username');

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  try {
    // Nested create runs in a single DB transaction: User and Wallet are created together or not at all.
    const user = await prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        wallet: { create: {} },
      },
    });
    return { user: toPublicUser(user), token: signAccessToken(user.id) };
  } catch (err) {
    // Another request registered the same email/username between the check and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      throw duplicateError(target.includes('email') ? 'email' : 'username');
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  return { user: toPublicUser(user), token: signAccessToken(user.id) };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  return toPublicUser(user);
}

function duplicateError(field: 'email' | 'username') {
  return field === 'email'
    ? new ConflictError('Email is already registered', 'EMAIL_TAKEN')
    : new ConflictError('Username is already taken', 'USERNAME_TAKEN');
}
