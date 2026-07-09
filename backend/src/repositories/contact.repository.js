import Chat from '../models/Chat.js';
import Seller from '../models/Seller.js';

export async function findUserChats(userId, limit = 100) {
  return Chat.find({
    isActive: true,
    $or: [
      { buyerId: userId },
      { sellerId: userId },
      { groupMembers: userId },
    ],
    chatType: { $ne: 'group' },
  })
    .select(
      'buyerId sellerId lastMessageAt buyerSavedSupplierAt sellerSavedBuyerAt buyerFavoriteAt sellerFavoriteAt buyerBlockedAt sellerBlockedAt createdAt updatedAt'
    )
    .populate('buyerId', 'email fullName avatarUrl')
    .populate('sellerId', 'email fullName avatarUrl')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec();
}

export async function findSellersByUserIds(userIds) {
  if (!userIds.length) return [];

  return Seller.find({ userId: { $in: userIds } })
    .select('_id userId companyName')
    .lean()
    .exec();
}


