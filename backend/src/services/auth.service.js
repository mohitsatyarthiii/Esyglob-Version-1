import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { serializeUser } from '../lib/session.js';
import { ensureSellerDefaults } from '../lib/account-defaults.js';
import { getDashboardPath } from '../lib/role-routing.js';
import { getSellerCompletionSummary } from '../lib/seller-verification.js';
import * as authRepository from '../repositories/auth.repository.js';

export async function loginUser(email, password) {
  // Find user with password hash
  const user = await authRepository.findUserByEmail(email, true);

  // Verify password
  const isValidPassword = await verifyPassword(password, user?.passwordHash);

  // Validate user state
  if (!user || !isValidPassword || !user.isActive || user.isBanned) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Update last login timestamp
  await authRepository.updateLastLogin(user._id);

  // Ensure seller defaults if user has seller role
  const serializedUser = serializeUser(user);

  if (user.roles?.includes('seller')) {
    await ensureSellerDefaults(serializedUser);
  }

  return {
    user: serializedUser,
    redirectTo: getDashboardPath(serializedUser),
  };
}

export async function signupUser(userData) {
  const { firstName, lastName, email, password, role } = userData;

  // Check if email already exists
  const emailExists = await authRepository.checkExistingEmail(email);
  if (emailExists) {
    const error = new Error('An account already exists with this email');
    error.statusCode = 409;
    throw error;
  }

  // Determine roles
  const userCount = await authRepository.getUserCount();
  const roles = [role];

  // First user becomes admin
  if (userCount === 0) {
    roles.push('admin');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await authRepository.createUser({
    email,
    passwordHash,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    roles: [...new Set(roles)],
    primaryRole: role,
    isActive: true,
    hasCompletedOnboarding: role !== 'seller',
    lastLoginAt: new Date(),
  });

  // Handle seller-specific setup
  if (role === 'seller') {
    const seller = await authRepository.createSellerProfile(user._id);
    const completion = getSellerCompletionSummary(seller);

    await authRepository.createSellerVerification(seller._id, user._id, completion);
  }

  return {
    user: serializeUser(user),
    redirectTo: role === 'seller' ? '/dashboard/seller' : '/dashboard/buyer',
  };
}