import mongoose from 'mongoose';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import RFQ from '../models/RFQ.js';
import User from '../models/User.js';

// ─── Chat Queries ──────────────────────────────────────────
export async function findChatById(chatId, selectFields = '') {
  return Chat.findById(chatId).select(selectFields).exec();
}

export async function findChatByIdLean(chatId) {
  return Chat.findById(chatId).lean().exec();
}

export async function findChatByIdPopulated(chatId, after = false) {
  const query = Chat.findById(chatId);

  if (after) {
    query.select('buyerId sellerId groupMembers chatType');
  } else {
    query
      .populate('buyerId', 'email fullName avatarUrl')
      .populate('sellerId', 'email fullName avatarUrl')
      .populate('groupMembers', 'email fullName avatarUrl')
      .populate('groupCreatedBy', 'email fullName avatarUrl')
      .populate(
        'productId',
        'name images price minimumOrderQuantity samplePrice specifications category subcategory sellerId'
      )
      .populate('orderEligibility.productId', 'name images price minimumOrderQuantity');
  }

  return query.lean().exec();
}

export async function findChatsByUser(userId, query, limit, sort) {
  return Chat.find(query)
    .select(
      'pairKey buyerId sellerId groupName groupMembers groupCreatedBy productId rfqId quotationId chatType orderEligibility lastMessage lastMessageAt buyerUnreadCount sellerUnreadCount buyerArchivedAt sellerArchivedAt buyerPinnedAt sellerPinnedAt buyerMutedAt sellerMutedAt buyerFavoriteAt sellerFavoriteAt buyerSavedSupplierAt sellerSavedBuyerAt buyerLabel sellerLabel buyerBlockedAt sellerBlockedAt createdAt updatedAt'
    )
    .populate('buyerId', 'email fullName avatarUrl')
    .populate('sellerId', 'email fullName avatarUrl')
    .populate('groupMembers', 'email fullName avatarUrl')
    .populate('groupCreatedBy', 'email fullName avatarUrl')
    .populate('productId', 'name images')
    .populate('orderEligibility.productId', 'name images price minimumOrderQuantity')
    .sort(sort)
    .limit(limit)
    .lean()
    .exec();
}

export async function updateChat(chatId, update) {
  return Chat.findByIdAndUpdate(chatId, update, { new: true }).exec();
}

export async function updateChatLean(chatId, update) {
  return Chat.findByIdAndUpdate(chatId, update, { new: true }).lean().exec();
}

// ─── Message Queries ───────────────────────────────────────
export async function findMessages(chatId, options = {}) {
  const { before, after, limit = 30 } = options;
  const filter = { chatId, isDeleted: false };

  if (before) {
    const beforeDate = new Date(before);
    if (!Number.isNaN(beforeDate.getTime())) {
      filter.createdAt = { $lt: beforeDate };
    }
  } else if (after) {
    const afterDate = new Date(after);
    if (!Number.isNaN(afterDate.getTime())) {
      filter.createdAt = { $gt: afterDate };
    }
  }

  const sortDirection = after ? 1 : -1;

  let messages = await Message.find(filter)
    .sort({ createdAt: sortDirection })
    .limit(Math.min(limit, 60))
    .populate('senderId', 'email fullName avatarUrl')
    .lean()
    .exec();

  if (!after) {
    messages = messages.reverse();
  }

  return messages;
}

export async function createMessage(data) {
  return Message.create(data);
}

export async function createMessages(messagesArray) {
  return Message.insertMany(messagesArray);
}

export async function markMessagesAsRead(chatId, userId) {
  return Message.updateMany(
    { chatId, receiverId: userId, isRead: false },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        deliveredAt: new Date(),
        deliveryStatus: 'seen',
      },
    }
  ).exec();
}

export async function markMessagesAsDelivered(chatId, userId) {
  return Message.updateMany(
    { chatId, receiverId: userId, deliveredAt: null },
    {
      $set: {
        deliveredAt: new Date(),
        deliveryStatus: 'delivered',
      },
    }
  ).exec();
}

export async function findLatestIncomingMessage(chatId, userId) {
  return Message.findOne({
    chatId,
    receiverId: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .exec();
}

// ─── Notification Queries ──────────────────────────────────
export async function createNotification(data) {
  return Notification.create(data);
}

// ─── Seller/Product Queries ────────────────────────────────
export async function findSellerByUserId(userId) {
  return Seller.findOne({ userId })
    .select(
      'companyName companyDescription companyType responseRate averageResponseTimeHours address certifications exportMarkets monthlyCapacity productionCapacity factoryProfile paymentMethods yearEstablished employeeCount factoryArea productionLines manufacturingCapabilities'
    )
    .lean()
    .exec();
}

export async function findSellerForChat(userId) {
  return Seller.findOne({ userId })
    .select(
      '_id companyName companyDescription address certifications exportMarkets isVerified'
    )
    .lean()
    .exec();
}

export async function findSellerByUserIdLean(userId) {
  return Seller.findOne({ userId }).select('_id').lean().exec();
}

export async function findProductById(id) {
  return Product.findById(id)
    .select('name price minimumOrderQuantity category subcategory specifications description')
    .lean()
    .exec();
}

export async function findSellerProducts(sellerId, limit = 4) {
  return Product.find({
    sellerId,
    status: { $in: ['active', 'published'] },
  })
    .select('name images price minimumOrderQuantity category subcategory description')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec();
}

export async function findSellerProductsForChat(sellerId, limit = 40) {
  return Product.find({
    sellerId,
    status: { $in: ['active', 'published'] },
  })
    .select('name images price minimumOrderQuantity category subcategory')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec();
}

// ─── RFQ Queries ───────────────────────────────────────────
export async function findRfqProducts(buyerId, sellerUserId, chatId, chatRfqId, limit = 40) {
  const rfqQuery = {
    buyerId,
    sellerUserId,
    productId: { $ne: null },
    status: { $nin: ['draft', 'archived', 'closed', 'rejected', 'expired'] },
    $or: [
      { conversationId: chatId },
      ...(chatRfqId ? [{ _id: chatRfqId }] : []),
    ],
  };

  return RFQ.find(rfqQuery)
    .select('_id title productId quantity unit targetPrice status')
    .populate('productId', 'name images price minimumOrderQuantity category subcategory')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();
}

export async function findRfqById(rfqId) {
  return RFQ.findById(rfqId).exec();
}

// ─── User Queries ──────────────────────────────────────────
export async function findUserById(userId) {
  return User.findById(userId).select('roles primaryRole').lean().exec();
}

export async function findActiveUsers(ids) {
  return User.find({ _id: { $in: ids }, isActive: true }).select('_id').lean().exec();
}