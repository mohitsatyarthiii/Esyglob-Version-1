import Seller from '../models/Seller.js';

export async function ensureSellerDefaults(user) {
  try {
    const seller = await Seller.findOne({ userId: user.id }).lean();

    if (seller) {
      // Seller profile already exists, nothing to seed
      return seller;
    }

    // Create a minimal seller profile for new sellers
    const newSeller = await Seller.create({
      userId: user.id,
      verificationStatus: 'pending',
      isVerified: false,
      isActive: true,
      subscriptionPlan: 'free',
      subscriptionStatus: 'inactive',
    });

    return newSeller;
  } catch (error) {
    console.error('Error ensuring seller defaults:', error);
    return null;
  }
}