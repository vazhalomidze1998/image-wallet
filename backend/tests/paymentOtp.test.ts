import request from 'supertest';
import { createApp } from '../src/app';
import { OTP_MAX_ATTEMPTS, OTP_MAX_SENDS, OTP_RESEND_COOLDOWN_MS } from '../src/services/payment.service';
import { createUser } from './helpers/auth';
import { prisma, resetDatabase } from './helpers/db';
import { balanceOf, checkout } from './helpers/wallet';

const app = createApp();

type TestUser = Awaited<ReturnType<typeof createUser>>;
let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await createUser(app);
  bob = await createUser(app);
});
afterAll(() => prisma.$disconnect());

function verify(user: TestUser, txId: string, code: string) {
  return request(app).post(`/api/payments/${txId}/verify`).set(user.auth).send({ code });
}

function resend(user: TestUser, txId: string) {
  return request(app).post(`/api/payments/${txId}/resend-code`).set(user.auth).send();
}

/** Moves the last send into the past so the resend cooldown has elapsed. */
async function skipCooldown(txId: string) {
  await prisma.payment.update({
    where: { providerTxId: txId },
    data: { otpSentAt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS - 1000) },
  });
}

function wrongCode(code: string) {
  return code === '000000' ? '111111' : '000000';
}

describe('POST /api/payments/checkout (SMS code)', () => {
  it("sends a code to the account's verified phone and stores only its hash", async () => {
    await prisma.user.update({ where: { id: alice.id }, data: { phone: '+995555123456' } });
    const res = await checkout(app, alice, 25);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'PENDING',
      phone: '+995 ••• ••• 456',
      codeExpiresAt: expect.any(String),
      resendAvailableAt: expect.any(String),
      devCode: expect.stringMatching(/^\d{6}$/),
    });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerTxId: res.body.data.transaction_id } });
    expect(payment.phone).toBe('+995555123456');
    expect(payment.otpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payment.otpHash).not.toContain(res.body.data.devCode);
    expect(payment.otpSendCount).toBe(1);
  });

  it('refuses a top-up until the phone is verified', async () => {
    const carol = await createUser(app, { verifiedPhone: false });
    const res = await checkout(app, carol, 10);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
    expect(await prisma.payment.count({ where: { userId: carol.id } })).toBe(0);
  });

  it('does not accept a phone number in the request', async () => {
    const res = await request(app).post('/api/payments/checkout').set(alice.auth).send({ amount: 10, phone: '+995555000000' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps sending codes to the number used at checkout after the account phone changes', async () => {
    const { body } = await checkout(app, alice, 10);
    await prisma.user.update({ where: { id: alice.id }, data: { phone: '+995555999999' } });
    await skipCooldown(body.data.transaction_id);

    const res = await resend(alice, body.data.transaction_id);
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe(body.data.phone);
  });
});

describe('POST /api/payments/:transactionId/verify', () => {
  it('the correct code completes the payment and credits the wallet', async () => {
    const { body } = await checkout(app, alice, 40);
    const res = await verify(alice, body.data.transaction_id, body.data.devCode);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'COMPLETED', alreadyProcessed: false });
    expect(await balanceOf(alice.id)).toBe('40.00');

    const tx = await prisma.transaction.findFirstOrThrow({ where: { referenceId: body.data.transaction_id } });
    expect(tx.status).toBe('COMPLETED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerTxId: body.data.transaction_id } });
    expect(payment.otpHash).toBeNull();
  });

  it('a wrong code is rejected and reports the attempts left', async () => {
    const { body } = await checkout(app, alice, 40);
    const res = await verify(alice, body.data.transaction_id, wrongCode(body.data.devCode));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_OTP',
      message: `Wrong code. ${OTP_MAX_ATTEMPTS - 1} attempts left.`,
    });
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it(`cancels the payment after ${OTP_MAX_ATTEMPTS} wrong codes`, async () => {
    const { body } = await checkout(app, alice, 40);
    const txId = body.data.transaction_id;
    const bad = wrongCode(body.data.devCode);

    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await verify(alice, txId, bad)).body.error.code).toBe('INVALID_OTP');
    }
    const last = await verify(alice, txId, bad);
    expect(last.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');

    // Even the right code no longer works.
    const after = await verify(alice, txId, body.data.devCode);
    expect(after.status).toBe(409);
    expect(after.body.error.code).toBe('PAYMENT_NOT_PENDING');
    expect(await balanceOf(alice.id)).toBe('0.00');
    const tx = await prisma.transaction.findFirstOrThrow({ where: { referenceId: txId } });
    expect(tx.status).toBe('FAILED');
  });

  it('parallel guesses cannot exceed the attempt limit', async () => {
    const { body } = await checkout(app, alice, 40);
    const txId = body.data.transaction_id;
    const bad = wrongCode(body.data.devCode);

    await Promise.all(Array.from({ length: OTP_MAX_ATTEMPTS + 3 }, () => verify(alice, txId, bad)));

    const payment = await prisma.payment.findUniqueOrThrow({ where: { providerTxId: txId } });
    expect(payment.otpAttempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
    expect(payment.status).toBe('FAILED');
  });

  it('rejects an expired code', async () => {
    const { body } = await checkout(app, alice, 40);
    await prisma.payment.update({
      where: { providerTxId: body.data.transaction_id },
      data: { otpExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await verify(alice, body.data.transaction_id, body.data.devCode);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it('a completed payment cannot be confirmed twice', async () => {
    const { body } = await checkout(app, alice, 40);
    await verify(alice, body.data.transaction_id, body.data.devCode);
    const again = await verify(alice, body.data.transaction_id, body.data.devCode);

    expect(again.status).toBe(409);
    expect(await balanceOf(alice.id)).toBe('40.00');
  });

  it("does not let another user confirm someone else's payment", async () => {
    const { body } = await checkout(app, alice, 40);
    const res = await verify(bob, body.data.transaction_id, body.data.devCode);

    expect(res.status).toBe(404);
    expect(await balanceOf(alice.id)).toBe('0.00');
  });

  it.each([['12345'], ['1234567'], ['abcdef']])('rejects a malformed code %s', async (code) => {
    const { body } = await checkout(app, alice, 40);
    const res = await verify(alice, body.data.transaction_id, code);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/payments/:transactionId/resend-code', () => {
  it('enforces a cooldown between codes', async () => {
    const { body } = await checkout(app, alice, 40);
    const res = await resend(alice, body.data.transaction_id);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('OTP_RESEND_COOLDOWN');
  });

  it('issues a new code and invalidates the old one', async () => {
    const { body } = await checkout(app, alice, 40);
    const txId = body.data.transaction_id;
    await skipCooldown(txId);

    const res = await resend(alice, txId);
    expect(res.status).toBe(200);
    const newCode = res.body.data.devCode;
    expect(newCode).toMatch(/^\d{6}$/);

    if (newCode !== body.data.devCode) {
      expect((await verify(alice, txId, body.data.devCode)).body.error.code).toBe('INVALID_OTP');
    }
    expect((await verify(alice, txId, newCode)).body.data.status).toBe('COMPLETED');
  });

  it(`allows at most ${OTP_MAX_SENDS} codes per payment`, async () => {
    const { body } = await checkout(app, alice, 40);
    const txId = body.data.transaction_id;
    for (let i = 1; i < OTP_MAX_SENDS; i++) {
      await skipCooldown(txId);
      expect((await resend(alice, txId)).status).toBe(200);
    }
    await skipCooldown(txId);
    const res = await resend(alice, txId);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('OTP_SEND_LIMIT');
  });
});
