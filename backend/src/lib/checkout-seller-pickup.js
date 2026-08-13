import FactoryProfile from '../models/FactoryProfile.js';

function hasPickupAddress(value = {}) {
  return Boolean(
    (value.street || value.address || value.line1)
    && value.city
    && value.state
    && (value.pincode || value.postalCode || value.zipCode)
  );
}

export async function sellerWithCheckoutPickup(seller = {}) {
  if (hasPickupAddress(seller.address) || hasPickupAddress(seller.shippingAddress)) return seller;
  if (!seller._id) return seller;
  const factory = await FactoryProfile.findOne({ sellerId: seller._id })
    .select('address')
    .lean()
    .exec();
  return factory?.address ? { ...seller, shippingAddress: factory.address } : seller;
}

export { hasPickupAddress };
