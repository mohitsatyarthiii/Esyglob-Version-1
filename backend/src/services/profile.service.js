import ProfileRepository from '../repositories/profile.repository.js';
import { profileSchema, passwordSchema } from '../validators/profile.validator.js';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../lib/crypto.js';

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

class ProfileService {
  /**
   * Get user profile
   */
  static async getProfile(userId) {
    const [user, seller] = await Promise.all([
      ProfileRepository.findUserById(userId),
      ProfileRepository.findSellerByUserId(userId),
    ]);

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }

    return ProfileRepository.buildProfileResponse(user, seller);
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId, roles, data) {
    // Validate
    const parsed = profileSchema.parse(data);

    // Check email uniqueness
    const emailTaken = await ProfileRepository.isEmailTaken(parsed.email, userId);
    if (emailTaken) {
      throw Object.assign(new Error('Email is already used by another account'), { statusCode: 409 });
    }

    // Split name
    const { firstName, lastName } = splitName(parsed.fullName);

    // Update user
    const user = await ProfileRepository.updateUser(userId, {
      email: parsed.email.toLowerCase(),
      fullName: parsed.fullName,
      firstName,
      lastName,
      phone: parsed.phone,
      avatarUrl: parsed.avatarUrl,
      'metadata.companyName': parsed.companyName,
      'metadata.country': parsed.country,
      'metadata.city': parsed.city,
      'metadata.address': parsed.address,
      'metadata.businessType': parsed.businessType,
      'metadata.companyDescription': parsed.companyDescription,
    });

    // Update seller profile if user is a seller
    if (roles?.includes('seller')) {
      await ProfileRepository.upsertSeller(userId, {
        companyName: parsed.companyName,
        companyType: parsed.businessType || undefined,
        companyDescription: parsed.companyDescription,
        businessEmail: parsed.email.toLowerCase(),
        businessPhone: parsed.phone,
        companyLogo: parsed.avatarUrl,
        logoUrl: parsed.avatarUrl,
        'address.street': parsed.address,
        'address.city': parsed.city,
        'address.country': parsed.country,
      });
    }

    return { success: true, user };
  }

  /**
   * Change password
   */
  static async changePassword(userId, data) {
    // Validate
    const parsed = passwordSchema.parse(data);

    if (parsed.currentPassword === parsed.newPassword) {
      throw Object.assign(
        new Error('New password must be different from current password'),
        { statusCode: 422 }
      );
    }

    // Get user with password
    const user = await ProfileRepository.findUserWithPassword(userId);
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }

    // Verify current password
    const currentIsValid = await verifyPassword(parsed.currentPassword, user.passwordHash);
    if (!currentIsValid) {
      throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 });
    }

    // Update password
    user.passwordHash = await hashPassword(parsed.newPassword);
    user.metadata = {
      ...(user.metadata || {}),
      passwordUpdatedAt: new Date(),
    };
    await ProfileRepository.saveUser(user);

    return {
      success: true,
      message: 'Password updated successfully',
      passwordUpdatedAt: user.metadata.passwordUpdatedAt,
    };
  }
}

export default ProfileService;
