import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { prisma, resetDatabase } from './helpers/db';

const app = createApp();

const validUser = {
  username: 'user1',
  email: 'user1@example.com',
  password: 'password123',
};

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('POST /api/auth/register', () => {
  it('creates a user with a zero-balance wallet and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      username: 'user1',
      email: 'user1@example.com',
      phone: null,
      phoneVerified: false,
      createdAt: expect.any(String),
    });
    expect(res.body.data.token).toEqual(expect.any(String));

    const wallet = await prisma.wallet.findUnique({ where: { userId: res.body.data.user.id } });
    expect(wallet).not.toBeNull();
    expect(wallet!.balance.toFixed(2)).toBe('0.00');
    expect(wallet!.currency).toBe('USD');
  });

  it('never returns the password or its hash', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('$2b$');
  });

  it('stores a bcrypt hash, not the plain password', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: validUser.email } });
    expect(user.passwordHash).not.toBe(validUser.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('normalizes email to lowercase', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: '  User1@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('user1@example.com');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, username: 'other' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'EMAIL_TAKEN', message: 'Email is already registered' },
    });
  });

  it('rejects a duplicate username with 409 USERNAME_TAKEN', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('does not create a second user or wallet on duplicate', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    await request(app).post('/api/auth/register').send(validUser);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.wallet.count()).toBe(1);
  });

  it.each([
    ['invalid email', { ...validUser, email: 'not-an-email' }, 'body.email'],
    ['short password', { ...validUser, password: 'short' }, 'body.password'],
    ['short username', { ...validUser, username: 'ab' }, 'body.username'],
    ['bad username chars', { ...validUser, username: 'bad name!' }, 'body.username'],
    ['missing username', { email: validUser.email, password: validUser.password }, 'body.username'],
  ])('rejects %s with 400', async (_label, body, field) => {
    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('returns user and JWT for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: validUser.password });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me (protected route)', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token signed with another secret', async () => {
    const forged = jwt.sign({}, 'some-other-secret-that-is-long-enough!!', { subject: 'x' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({}, process.env.JWT_SECRET!, { subject: 'x', expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const reg = await request(app).post('/api/auth/register').send(validUser);
    await resetDatabase();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns the current user for a valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(reg.body.data.user.id);
  });
});
