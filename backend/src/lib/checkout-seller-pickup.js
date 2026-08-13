import FactoryProfile from '../models/FactoryProfile.js';
import User from '../models/User.js';

function hasPickupAddress(value = {}) {
  return Boolean(
    (value.street || value.address || value.line1)
    && value.city
    && value.state
    && (value.pincode || value.postalCode || value.zipCode)
  );
}

export async function sellerWithCheckoutPickup(seller = {}) {
  if (!seller._id) return seller;
  const [factory, user] = await Promise.all([
    hasPickupAddress(seller.address) || hasPickupAddress(seller.shippingAddress)
      ? null
      : FactoryProfile.findOne({ sellerId: seller._id }).select('address').lean().exec(),
    seller.userId ? User.findById(seller.userId).select('phone email fullName').lean().exec() : null,
  ]);
  return {
    ...seller,
    shippingAddress: factory?.address || seller.shippingAddress,
    businessPhone: seller.businessPhone || user?.phone || '',
    businessEmail: seller.businessEmail || user?.email || '',
    companyName: seller.companyName || user?.fullName || 'EsyGlob seller',
  };
}

export { hasPickupAddress };
