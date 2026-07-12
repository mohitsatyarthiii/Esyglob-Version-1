import User from '../models/User.js';
import Seller from '../models/Seller.js';

class ProfileRepository {
  /**
   * Find user by ID (without password)
   */
  static async findUserById(userId) {
    return User.findById(userId).select('-passwordHash -__v').lean().exec();
  }

  /**
   * Find user with password hash
   */
  static async findUserWithPassword(userId) {
    return User.findById(userId).select('+passwordHash').exec();
  }

  /**
   * Find seller profile by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).lean().exec();
  }

  /**
   * Check if email is taken by another user
   */
  static async isEmailTaken(email, excludeUserId) {
    const existing = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: excludeUserId },
    }).select('_id').lean().exec();
    return Boolean(existing);
  }

  /**
   * Update user profile
   */
  static async updateUser(userId, data) {
    return User.findByIdAndUpdate(userId, { $set: data }, { new: true })
      .select('-passwordHash -__v')
      .lean()
      .exec();
  }

  /**
   * Upsert seller profile
   */
  static async upsertSeller(userId, data) {
    return Seller.findOneAndUpdate(
      { userId },
      {
        $set: data,
        $setOnInsert: { userId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
  }

  /**
   * Save user document
   */
  static async saveUser(user) {
    return user.save();
  }

  /**
   * Build profile response from user and seller
   */
  static buildProfileResponse(user, seller) {
    return {
      profile: {
        fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
        companyName: seller?.companyName || user.metadata?.companyName || '',
        email: user.email || '',
        phone: user.phone || seller?.businessPhone || '',
        avatarUrl: user.avatarUrl || '',
        country: seller?.address?.country || user.metadata?.country || '',
        city: seller?.address?.city || user.metadata?.city || '',
        address: seller?.address?.street || user.metadata?.address || '',
        businessType: seller?.companyType || user.metadata?.businessType || '',
        companyDescription: seller?.companyDescription || user.metadata?.companyDescription || '',
        preferredCurrency: user.metadata?.preferredCurrency || 'INR',
        roles: user.roles || [],
        primaryRole: user.primaryRole || 'buyer',
      },
    };
  }
}

export default ProfileRepository;
