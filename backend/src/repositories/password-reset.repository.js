import PasswordReset from '../models/PasswordReset.js';
import User from '../models/User.js';

const secrets = '+otpHash +resetTokenHash +ipAddress +userAgent';

export function findUserForReset(email) {
  return User.findOne({ email, isActive: true, isBanned: { $ne: true } })
    .select('_id email firstName fullName isActive isBanned')
    .lean()
    .exec();
}

export function findByUserId(userId) {
  return PasswordReset.findOne({ userId }).select(secrets).exec();
}

export function findByPublicId(publicId) {
  return PasswordReset.findOne({ publicId }).select(secrets).exec();
}

export function upsertChallenge(userId, values) {
  const { publicId, ...mutableValues } = values;
  return PasswordReset.findOneAndUpdate(
    { userId },
    {
      $set: mutableValues,
      $setOnInsert: { userId, publicId },
    },
    { new: true, upsert: true, runValidators: true }
  ).select(secrets).exec();
}

export function incrementVerificationAttempt(publicId) {
  return PasswordReset.findOneAndUpdate(
    { publicId, verificationStatus: 'pending', verificationAttempts: { $lt: 3 } },
    { $inc: { verificationAttempts: 1 }, $set: { lastAttemptAt: new Date() } },
    { new: true }
  ).select(secrets).exec();
}

export function exhaustChallenge(publicId, lockUntil) {
  const purgeAt = lockUntil || new Date(Date.now() + 24 * 60 * 60 * 1000);
  const update = {
    $inc: { failedOtpCycles: 1 },
    $unset: { otpHash: 1, resetTokenHash: 1, resetTokenExpiresAt: 1 },
    $set: { verificationStatus: 'exhausted', purgeAt },
  };
  if (lockUntil) update.$set = { ...update.$set, lockStatus: true, lockExpiresAt: lockUntil };
  return PasswordReset.findOneAndUpdate(
    { publicId, verificationStatus: 'pending', verificationAttempts: { $gte: 3 } },
    update,
    { new: true }
  ).select(secrets).exec();
}

export function markVerified(publicId, otpHash, values) {
  return PasswordReset.findOneAndUpdate(
    { publicId, verificationStatus: 'pending', otpHash },
    {
      $set: { ...values, verificationStatus: 'verified', verifiedAt: new Date() },
      $unset: { otpHash: 1 },
    },
    { new: true }
  ).select(secrets).exec();
}

export function consumeReset(publicId, resetTokenHash) {
  return PasswordReset.findOneAndUpdate(
    { publicId, verificationStatus: 'verified', resetTokenHash },
    {
      $set: { verificationStatus: 'used', purgeAt: new Date() },
      $unset: { otpHash: 1, resetTokenHash: 1, resetTokenExpiresAt: 1 },
    },
    { new: true }
  ).exec();
}

export function updateUserPassword(userId, passwordHash) {
  return User.findByIdAndUpdate(userId, {
    $set: { passwordHash, passwordChangedAt: new Date() },
    $inc: { sessionVersion: 1 },
  }).exec();
}

export function invalidateChallenge(publicId) {
  return PasswordReset.findOneAndUpdate(
    { publicId },
    {
      $set: { verificationStatus: 'invalidated', purgeAt: new Date() },
      $unset: { otpHash: 1, resetTokenHash: 1, resetTokenExpiresAt: 1 },
    }
  ).exec();
}
