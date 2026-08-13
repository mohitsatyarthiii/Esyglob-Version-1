export const PUBLIC_SELLER_ELIGIBILITY = Object.freeze({
  isActive: true,
  isSuspended: { $ne: true },
  isVerified: true,
  verificationStatus: { $in: ['approved', 'verified'] },
});

// Public marketplace products must be usable listings, not merely records
// that happen to have a published status. Internal seller/admin queries do
// not use this filter and therefore continue to show drafts and incomplete
// catalogue entries.
export const PUBLIC_PRODUCT_ELIGIBILITY = Object.freeze({
  status: { $in: ['active', 'published'] },
  visibility: 'public',
  isVerifiedSeller: true,
  sellerId: { $exists: true, $ne: null },
  name: { $exists: true, $type: 'string', $nin: ['', 'Untitled product draft'] },
  category: { $exists: true, $type: 'string', $ne: '' },
  subcategory: { $exists: true, $type: 'string', $ne: '' },
  description: { $exists: true, $type: 'string', $ne: '' },
  price: { $gt: 0 },
  images: {
    $elemMatch: {
      $type: 'string',
      $regex: /^(?:https?:\/\/|\/api\/|\/storage\/|storage\/).+/i,
    },
  },
});

export function publicSellerQuery(extra = {}) {
  return { ...extra, ...PUBLIC_SELLER_ELIGIBILITY };
}

export function publicProductQuery(extra = {}, verifiedSellerIds) {
  const query = { ...extra, ...PUBLIC_PRODUCT_ELIGIBILITY };
  if (verifiedSellerIds) query.sellerId = { $in: verifiedSellerIds };
  return query;
}
