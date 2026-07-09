import User from '../models/User.js';
import Seller from '../models/Seller.js';
import SellerVerification from '../models/SellerVerification.js';

export async function findUserByEmail(email, includePassword = false) {
  const query = User.findOne({ email });

  if (includePassword) {
    query.select('+passwordHash');
  }

  return query.lean().exec();
}

export async function findUserById(userId) {
  return User.findById(userId).select('-passwordHash -__v').lean().exec();
}

export async function checkExistingEmail(email) {
  const user = await User.findOne({ email }).select('_id').lean().exec();
  return !!user;
}

export async function getUserCount() {
  return User.countDocuments().exec();
}

export async function createUser(userData) {
  return User.create(userData);
}

export async function updateLastLogin(userId) {
  return User.findByIdAndUpdate(
    userId,
    { $set: { lastLoginAt: new Date() } },
    { new: true }
  )
    .select('-passwordHash -__v')
    .lean()
    .exec();
}

export async function createSellerProfile(userId) {
  return Seller.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        verificationStatus: 'pending',
        isVerified: false,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  ).exec();
}

export async function createSellerVerification(sellerId, userId, completion) {
  return SellerVerification.findOneAndUpdate(
    { sellerId },
    {
      $set: {
        sellerId,
        userId,
        status: 'pending',
        onboardingCompleted: false,
        completedFields: completion.completedFields,
        remainingFields: completion.remainingFields,
        completedFieldCount: completion.completedCount,
        totalFieldCount: completion.totalCount,
        priority: 'medium',
      },
      $setOnInsert: {
        submittedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  ).exec();
}