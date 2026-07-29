import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { hashPassword } from '../lib/crypto.js';
import * as repository from '../repositories/password-reset.repository.js';
import { sendPasswordResetOtp } from './email.service.js';

const GENERIC_MESSAGE = 'If an account exists for this email, a verification code has been sent.';
const MAX_ATTEMPTS = 3;
const LOCK_AFTER_FAILED_CYCLES = 3;

const normalizeEmail = email => String(email || '').trim().toLowerCase();
const secondsUntil = date => Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));
const securityHash = value => crypto.createHmac('sha256', config.passwordResetSecret).update(value).digest('base64url');
const safeEqual = (left, right) => {
  const first = Buffer.from(String(left || ''));
  const second = Buffer.from(String(right || ''));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
};

function fail(message, statusCode, code, retryAfter) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (retryAfter) error.retryAfter = retryAfter;
  throw error;
}

function publicResponse(publicId, resendAfterSeconds = config.passwordResetCooldownSeconds) {
  return {
    message: GENERIC_MESSAGE,
    challengeId: publicId,
    expiresInSeconds: config.passwordResetOtpTtlSeconds,
    resendAfterSeconds,
  };
}

export async function requestOtp({ email, challengeId, ipAddress, userAgent }, dependencies = {}) {
  const resetRepository = dependencies.repository || repository;
  const sendOtp = dependencies.sendOtp || sendPasswordResetOtp;
  const normalizedEmail = normalizeEmail(email);
  const user = await resetRepository.findUserForReset(normalizedEmail);
  if (!user) {
    securityHash(`${crypto.randomUUID()}:${crypto.randomInt(100000, 1000000)}`);
    return publicResponse(crypto.randomUUID());
  }

  const existing = await resetRepository.findByUserId(user._id);
  const now = new Date();
  if (existing?.lockStatus && existing.lockExpiresAt > now) {
    if (challengeId && safeEqual(challengeId, existing.publicId)) {
      fail('Password reset is temporarily unavailable for security reasons.', 423, 'PASSWORD_RESET_LOCKED', secondsUntil(existing.lockExpiresAt));
    }
    return publicResponse(existing.publicId);
  }

  if (existing?.lastSentAt) {
    const retryAfter = config.passwordResetCooldownSeconds - Math.floor((Date.now() - existing.lastSentAt.getTime()) / 1000);
    if (retryAfter > 0) return publicResponse(existing.publicId, retryAfter);
  }

  const publicId = existing?.publicId || crypto.randomUUID();
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpExpiresAt = new Date(Date.now() + config.passwordResetOtpTtlSeconds * 1000);
  const purgeAt = new Date(otpExpiresAt.getTime() + 60 * 60 * 1000);
  const challenge = await resetRepository.upsertChallenge(user._id, {
    publicId,
    email: normalizedEmail,
    otpHash: securityHash(`${publicId}:${otp}`),
    otpExpiresAt,
    verificationAttempts: 0,
    verificationStatus: 'pending',
    verifiedAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    lockStatus: false,
    lockExpiresAt: null,
    lastSentAt: now,
    ipAddress: String(ipAddress || '').slice(0, 128),
    userAgent: String(userAgent || '').slice(0, 512),
    purgeAt,
    ...(existing?.lockExpiresAt && existing.lockExpiresAt <= now ? { failedOtpCycles: 0 } : {}),
  });

  void sendOtp({
    to: normalizedEmail,
    name: user.firstName || user.fullName,
    otp,
    expiresInMinutes: Math.ceil(config.passwordResetOtpTtlSeconds / 60),
  }).catch(async error => {
    console.error('Password reset email delivery failed:', error.message);
    await resetRepository.invalidateChallenge(challenge.publicId).catch(() => undefined);
  });

  return publicResponse(challenge.publicId);
}

export async function verifyOtp({ challengeId, otp }, dependencies = {}) {
  const resetRepository = dependencies.repository || repository;
  const challenge = await resetRepository.findByPublicId(challengeId);
  if (!challenge) fail('Verification failed. Request a new code to continue.', 422, 'INVALID_RESET_CHALLENGE');
  if (challenge.lockStatus && challenge.lockExpiresAt > new Date()) {
    fail('Password reset is temporarily unavailable for security reasons.', 423, 'PASSWORD_RESET_LOCKED', secondsUntil(challenge.lockExpiresAt));
  }
  if (challenge.verificationStatus !== 'pending' || !challenge.otpHash) {
    fail('Verification failed. Request a new code to continue.', 422, 'RESET_CODE_UNAVAILABLE');
  }
  if (!challenge.otpExpiresAt || challenge.otpExpiresAt <= new Date()) {
    await resetRepository.invalidateChallenge(challenge.publicId);
    fail('This verification code has expired. Request a new code.', 410, 'RESET_CODE_EXPIRED');
  }

  const candidateHash = securityHash(`${challenge.publicId}:${otp}`);
  if (!safeEqual(candidateHash, challenge.otpHash)) {
    const attempted = await resetRepository.incrementVerificationAttempt(challenge.publicId);
    if (!attempted || attempted.verificationAttempts >= MAX_ATTEMPTS) {
      const shouldLock = Number(attempted?.failedOtpCycles || challenge.failedOtpCycles || 0) + 1 >= LOCK_AFTER_FAILED_CYCLES;
      const lockUntil = shouldLock ? new Date(Date.now() + config.passwordResetLockSeconds * 1000) : null;
      await resetRepository.exhaustChallenge(challenge.publicId, lockUntil);
      if (lockUntil) {
        fail('Password reset is temporarily unavailable for security reasons.', 423, 'PASSWORD_RESET_LOCKED', config.passwordResetLockSeconds);
      }
      fail('Verification failed. Request a new code to continue.', 422, 'RESET_ATTEMPTS_EXHAUSTED');
    }
    fail('The verification code is incorrect.', 422, 'INVALID_RESET_CODE');
  }

  const resetToken = crypto.randomBytes(32).toString('base64url');
  const resetTokenExpiresAt = new Date(Date.now() + config.passwordResetOtpTtlSeconds * 1000);
  const verified = await resetRepository.markVerified(challenge.publicId, challenge.otpHash, {
    resetTokenHash: securityHash(`${challenge.publicId}:${resetToken}`),
    resetTokenExpiresAt,
    purgeAt: new Date(resetTokenExpiresAt.getTime() + 60 * 60 * 1000),
  });
  if (!verified) fail('Verification failed. Request a new code to continue.', 409, 'RESET_CHALLENGE_CHANGED');

  return {
    message: 'Email verified. Create a new password.',
    challengeId: challenge.publicId,
    resetToken,
    expiresInSeconds: config.passwordResetOtpTtlSeconds,
  };
}

export async function resetPassword({ challengeId, resetToken, password }, dependencies = {}) {
  const resetRepository = dependencies.repository || repository;
  const challenge = await resetRepository.findByPublicId(challengeId);
  if (!challenge || challenge.verificationStatus !== 'verified' || !challenge.resetTokenHash) {
    fail('This password reset session is invalid or has already been used.', 422, 'INVALID_RESET_SESSION');
  }
  if (!challenge.resetTokenExpiresAt || challenge.resetTokenExpiresAt <= new Date()) {
    await resetRepository.invalidateChallenge(challenge.publicId);
    fail('This password reset session has expired. Start again.', 410, 'RESET_SESSION_EXPIRED');
  }
  const candidateHash = securityHash(`${challenge.publicId}:${resetToken}`);
  if (!safeEqual(candidateHash, challenge.resetTokenHash)) {
    fail('This password reset session is invalid.', 422, 'INVALID_RESET_SESSION');
  }

  const passwordHash = await hashPassword(password);
  const consumed = await resetRepository.consumeReset(challenge.publicId, challenge.resetTokenHash);
  if (!consumed) fail('This password reset session has already been used.', 409, 'RESET_SESSION_USED');
  await resetRepository.updateUserPassword(challenge.userId, passwordHash);
  return { message: 'Password updated successfully. You can now sign in.' };
}

export const passwordResetPolicy = {
  GENERIC_MESSAGE,
  MAX_ATTEMPTS,
  LOCK_AFTER_FAILED_CYCLES,
};

export function createPasswordResetService(dependencies) {
  return {
    requestOtp: input => requestOtp(input, dependencies),
    verifyOtp: input => verifyOtp(input, dependencies),
    resetPassword: input => resetPassword(input, dependencies),
  };
}
