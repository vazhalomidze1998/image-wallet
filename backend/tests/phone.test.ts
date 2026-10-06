import request from 'supertest';
import { createApp } from '../src/app';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS } from '../src/utils/otp';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { checkout } from './helpers/wallet';

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;

const PHONE = '+995555123456';

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser(app, { verifiedPhone: false });
});
afterAll(() => prisma.$disconnect());

function sendCode(user: TestUser, ...args: [phone?: unknown]) {
  const phone = args.length ? args[0] : PHONE;
  return request(app).post('/api/auth/phone').set(user.auth).send({ phone });
}

function verify(user: TestUser, code: string) {
  return request(app).post('/api/auth/phone/verify').set(user.auth).send({ code });
}

/** Moves the last send into the past so the resend cooldown has elapsed. */
async function skipCooldown(userId: string) {
  await prisma.phoneVerification.update({
    where: { userId },
    data: { sentAt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS - 1000) },
  });
}

function wrongCode(code: string) {
  return code === '000000' ? '111111' : '000000';
}

describe('POST /api/auth/phone', () => {
  it('new users start without a verified phone', async () => {
    const res = await request(app).get('/api/auth/me').set(alice.auth);
    expect(res.body.data.user).toMatchObject({ phone: null, phoneVerified: false });
  });

  it('sends a code to the normalised number and stores only its hash', async () => {
    const res = await sendCode(alice, '+995 555 12-34-56');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      phone: '+995 ••• ••• 456',
      codeExpiresAt: expect.any(String),
      resendAvailableAt: expect.any(String),
      devCode: expect.stringMatching(/^\d{6}$/),
    });
    const row = await prisma.phoneVerification.findUniqueOrThrow({ where: { userId: alice.id } });
    expect(row.phone).toBe(PHONE);
    expect(row.otpHash).toMatch(/^[a-f0-9]{64}$/);

    // Not verified until the code is entered.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect(user.phone).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['without country code', '555123456'],
    ['with letters', '+99555abc123'],
    ['too short', '+99512'],
  ])('rejects a %s phone number', async (_label, phone) => {
    const res = await sendCode(alice, phone);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces a cooldown, also when switching to another number', async () => {
    await sendCode(alice);
    const res = await sendCode(alice, '+995555000111');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('OTP_RESEND_COOLDOWN');
  });

  it('parallel requests send only one code', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => sendCode(alice)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('refuses a number verified on another account', async () => {
    const bob = await createUser(app);
    const res = await sendCode(alice, bob.phone);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('refuses the number already verified on the same account', async () => {
    const bob = await createUser(app);
    const res = await sendCode(bob, bob.phone);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_ALREADY_VERIFIED');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/phone').send({ phone: PHONE });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/phone/verify', () => {
  it('the correct code verifies the phone and enables top-ups', async () => {
    expect((await checkout(app, alice, 10)).body.error.code).toBe('PHONE_NOT_VERIFIED');

    const { body } = await sendCode(alice);
    const res = await verify(alice, body.data.devCode);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ phone: '+995 ••• ••• 456', phoneVerified: true });
    expect(await prisma.phoneVerification.count({ where: { userId: alice.id } })).toBe(0);

    const top = await checkout(app, alice, 10);
    expect(top.status).toBe(201);
    expect(top.body.data.phone).toBe('+995 ••• ••• 456');
  });

  it('a code can be used only once', async () => {
    const { body } = await sendCode(alice);
    await verify(alice, body.data.devCode);
    const again = await verify(alice, body.data.devCode);

    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('OTP_NOT_SENT');
  });

  it('a wrong code is rejected and reports the attempts left', async () => {
    const { body } = await sendCode(alice);
    const res = await verify(alice, wrongCode(body.data.devCode));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_OTP',
      message: `Wrong code. ${OTP_MAX_ATTEMPTS - 1} attempts left.`,
    });
  });

  it(`blocks the code after ${OTP_MAX_ATTEMPTS} wrong attempts until a new one is requested`, async () => {
    const { body } = await sendCode(alice);
    const bad = wrongCode(body.data.devCode);
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await verify(alice, bad)).body.error.code).toBe('INVALID_OTP');
    }
    expect((await verify(alice, bad)).body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    expect((await verify(alice, body.data.devCode)).body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');

    await skipCooldown(alice.id);
    const fresh = await sendCode(alice);
    expect((await verify(alice, fresh.body.data.devCode)).status).toBe(200);
  });

  it('parallel guesses cannot exceed the attempt limit', async () => {
    const { body } = await sendCode(alice);
    const bad = wrongCode(body.data.devCode);
    await Promise.all(Array.from({ length: OTP_MAX_ATTEMPTS + 3 }, () => verify(alice, bad)));

    const row = await prisma.phoneVerification.findUniqueOrThrow({ where: { userId: alice.id } });
    expect(row.attempts).toBe(OTP_MAX_ATTEMPTS);
  });

  it('rejects an expired code', async () => {
    const { body } = await sendCode(alice);
    await prisma.phoneVerification.update({ where: { userId: alice.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await verify(alice, body.data.devCode);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('a new code replaces the previous one', async () => {
    const first = await sendCode(alice, '+995555000111');
    await skipCooldown(alice.id);
    const second = await sendCode(alice);

    if (first.body.data.devCode !== second.body.data.devCode) {
      expect((await verify(alice, first.body.data.devCode)).body.error.code).toBe('INVALID_OTP');
    }
    const res = await verify(alice, second.body.data.devCode);
    expect(res.body.data.user.phone).toBe('+995 ••• ••• 456');
  });

  it("another user's code does not work", async () => {
    const bob = await createUser(app, { verifiedPhone: false });
    const { body } = await sendCode(alice);
    const res = await verify(bob, body.data.devCode);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_NOT_SENT');
  });

  it('fails when another account verified the number first', async () => {
    const bob = await createUser(app, { verifiedPhone: false });
    const a = await sendCode(alice);
    const b = await sendCode(bob);
    await verify(bob, b.body.data.devCode);

    const res = await verify(alice, a.body.data.devCode);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
    expect(user.phone).toBeNull();
  });

  it('changing to a new number keeps the old one until the new one is verified', async () => {
    const bob = await createUser(app);
    const old = bob.phone;
    await sendCode(bob);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
    expect(user.phone).toBe(old);
  });
});
