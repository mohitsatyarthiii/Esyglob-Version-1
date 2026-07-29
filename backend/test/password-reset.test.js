import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPasswordResetEmail, sendPasswordResetOtp } from '../src/services/email.service.js';
import { createPasswordResetService, passwordResetPolicy } from '../src/services/password-reset.service.js';
import { verifyPassword } from '../src/lib/crypto.js';
import { createToken, verifyToken } from '../src/lib/crypto.js';
import { resetPasswordSchema } from '../src/validators/auth.validator.js';
import { config } from '../src/config/env.js';

function fixture({ userExists = true } = {}) {
  let challenge = null;
  let passwordHash = '';
  const sent = [];
  const user = userExists ? { _id: '507f1f77bcf86cd799439011', email: 'buyer@example.com', firstName: 'Buyer' } : null;
  const repository = {
    async findUserForReset() { return user; },
    async findByUserId() { return challenge; },
    async findByPublicId(publicId) { return challenge?.publicId === publicId ? challenge : null; },
    async upsertChallenge(userId, values) {
      challenge = { ...(challenge || {}), userId, failedOtpCycles: challenge?.failedOtpCycles || 0, ...values };
      return challenge;
    },
    async incrementVerificationAttempt(publicId) {
      if (challenge?.publicId !== publicId || challenge.verificationStatus !== 'pending' || challenge.verificationAttempts >= 3) return null;
      challenge.verificationAttempts += 1;
      return challenge;
    },
    async exhaustChallenge(publicId, lockUntil) {
      if (challenge?.publicId !== publicId || challenge.verificationStatus !== 'pending' || challenge.verificationAttempts < 3) return null;
      challenge.failedOtpCycles += 1;
      challenge.verificationStatus = 'exhausted';
      challenge.otpHash = undefined;
      if (lockUntil) {
        challenge.lockStatus = true;
        challenge.lockExpiresAt = lockUntil;
      }
      return challenge;
    },
    async markVerified(publicId, otpHash, values) {
      if (challenge?.publicId !== publicId || challenge.verificationStatus !== 'pending' || challenge.otpHash !== otpHash) return null;
      challenge = { ...challenge, ...values, verificationStatus: 'verified', otpHash: undefined, verifiedAt: new Date() };
      return challenge;
    },
    async consumeReset(publicId, resetTokenHash) {
      if (challenge?.publicId !== publicId || challenge.verificationStatus !== 'verified' || challenge.resetTokenHash !== resetTokenHash) return null;
      challenge.verificationStatus = 'used';
      challenge.resetTokenHash = undefined;
      return challenge;
    },
    async updateUserPassword(_userId, nextHash) { passwordHash = nextHash; },
    async invalidateChallenge() {
      if (challenge) {
        challenge.verificationStatus = 'invalidated';
        challenge.otpHash = undefined;
      }
    },
  };
  const service = createPasswordResetService({
    repository,
    async sendOtp(message) { sent.push(message); },
  });
  return {
    service,
    sent,
    get challenge() { return challenge; },
    get passwordHash() { return passwordHash; },
    allowResend() { if (challenge) challenge.lastSentAt = new Date(Date.now() - 61_000); },
  };
}

async function request(fx) {
  return fx.service.requestOtp({ email: 'buyer@example.com', ipAddress: '127.0.0.1', userAgent: 'test' });
}

async function exhaustCurrentCode(fx, challengeId) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => fx.service.verifyOtp({ challengeId, otp: '000000' }), error => error.code === 'INVALID_RESET_CODE');
  }
  return fx.service.verifyOtp({ challengeId, otp: '000000' });
}

test('unknown emails receive the same generic response without sending mail', async () => {
  const fx = fixture({ userExists: false });
  const result = await request(fx);
  assert.equal(result.message, passwordResetPolicy.GENERIC_MESSAGE);
  assert.match(result.challengeId, /^[0-9a-f-]{36}$/);
  assert.equal(fx.sent.length, 0);
});

test('resend replaces the OTP and keeps one challenge', async () => {
  const fx = fixture();
  const first = await request(fx);
  const firstOtp = fx.sent.at(-1).otp;
  const firstHash = fx.challenge.otpHash;
  fx.allowResend();
  const second = await fx.service.requestOtp({ email: 'buyer@example.com', challengeId: first.challengeId });
  assert.equal(second.challengeId, first.challengeId);
  assert.notEqual(fx.sent.at(-1).otp, firstOtp);
  assert.notEqual(fx.challenge.otpHash, firstHash);
  assert.equal(fx.sent.length, 2);
});

test('three incorrect attempts invalidate the current OTP', async () => {
  const fx = fixture();
  const { challengeId } = await request(fx);
  await assert.rejects(() => exhaustCurrentCode(fx, challengeId), error => error.code === 'RESET_ATTEMPTS_EXHAUSTED');
  assert.equal(fx.challenge.verificationStatus, 'exhausted');
  assert.equal(fx.challenge.otpHash, undefined);
});

test('three exhausted OTP cycles lock only password recovery', async () => {
  const fx = fixture();
  let result = await request(fx);
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await assert.rejects(() => exhaustCurrentCode(fx, result.challengeId), error => error.code === 'RESET_ATTEMPTS_EXHAUSTED');
    fx.allowResend();
    result = await fx.service.requestOtp({ email: 'buyer@example.com', challengeId: result.challengeId });
  }
  await assert.rejects(() => exhaustCurrentCode(fx, result.challengeId), error => error.code === 'PASSWORD_RESET_LOCKED' && error.statusCode === 423);
  assert.equal(fx.challenge.lockStatus, true);
  assert.ok(fx.challenge.lockExpiresAt > new Date());
});

test('valid OTP issues a one-time reset token and stores a bcrypt password', async () => {
  const fx = fixture();
  const { challengeId } = await request(fx);
  const verified = await fx.service.verifyOtp({ challengeId, otp: fx.sent[0].otp });
  assert.ok(verified.resetToken.length >= 32);
  await fx.service.resetPassword({ challengeId, resetToken: verified.resetToken, password: 'StrongPassword!42' });
  assert.equal(fx.challenge.verificationStatus, 'used');
  assert.match(fx.passwordHash, /^\$2[aby]\$/);
  assert.equal(await verifyPassword('StrongPassword!42', fx.passwordHash), true);
  await assert.rejects(() => fx.service.resetPassword({ challengeId, resetToken: verified.resetToken, password: 'AnotherStrong!42' }), error => error.code === 'INVALID_RESET_SESSION');
});

test('expired OTP cannot be verified', async () => {
  const fx = fixture();
  const { challengeId } = await request(fx);
  fx.challenge.otpExpiresAt = new Date(Date.now() - 1000);
  await assert.rejects(() => fx.service.verifyOtp({ challengeId, otp: fx.sent[0].otp }), error => error.code === 'RESET_CODE_EXPIRED');
});

test('password reset email contains branded HTML and a plain-text alternative', () => {
  const email = buildPasswordResetEmail({ name: 'Buyer', otp: '123456', expiresInMinutes: 10 });
  assert.match(email.subject, /EsyGlob/i);
  assert.match(email.text, /123456/);
  assert.match(email.text, /10 minutes/);
  assert.match(email.html, /EsyGlob/);
  assert.match(email.html, /123456/);
  assert.match(email.html, /Security notice/);
});

test('transactional email adapter sends branded HTML and text from info@esyglob.com', async () => {
  const originalFetch = global.fetch;
  const originalKey = config.email.apiKey;
  let request;
  config.email.apiKey = 'test-api-key';
  global.fetch = async (url, options) => {
    request = { url, options, payload: JSON.parse(options.body) };
    return { ok: true, async json() { return { id: 'email-test' }; } };
  };
  try {
    const result = await sendPasswordResetOtp({ to: 'buyer@example.com', name: 'Buyer', otp: '654321', expiresInMinutes: 10 });
    assert.equal(result.id, 'email-test');
    assert.equal(request.payload.from, 'EsyGlob Security <info@esyglob.com>');
    assert.deepEqual(request.payload.to, ['buyer@example.com']);
    assert.match(request.payload.text, /654321/);
    assert.match(request.payload.html, /654321/);
    assert.equal(request.options.headers.Authorization, 'Bearer test-api-key');
  } finally {
    global.fetch = originalFetch;
    config.email.apiKey = originalKey;
  }
});

test('reset validation enforces strength and matching confirmation', () => {
  const base = { challengeId: 'd9428888-122b-11e1-b85c-61cd3cbb3210', resetToken: 'x'.repeat(40) };
  assert.equal(resetPasswordSchema.safeParse({ ...base, password: 'weak', confirmPassword: 'weak' }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ ...base, password: 'StrongPassword!42', confirmPassword: 'different' }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ ...base, password: 'StrongPassword!42', confirmPassword: 'StrongPassword!42' }).success, true);
});

test('session tokens carry a revocable session version', () => {
  const token = createToken('507f1f77bcf86cd799439011', 4);
  const payload = verifyToken(token);
  assert.equal(payload.sub, '507f1f77bcf86cd799439011');
  assert.equal(payload.ver, 4);
});
