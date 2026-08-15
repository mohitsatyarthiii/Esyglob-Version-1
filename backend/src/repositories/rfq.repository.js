import mongoose from 'mongoose';
import RFQ from '../models/RFQ.js';
import Quotation from '../models/Quotation.js';
import Chat from '../models/Chat.js';
import Seller from '../models/Seller.js';
import Notification from '../models/Notification.js';
import { OPEN_RFQ_STATUSES } from '../lib/rfq-helpers.js';

// ─── RFQ CRUD ──────────────────────────────────────────────
export async function findRfqs(query, sort, skip, limit) {
  return RFQ.find(query)
    .select(
      'buyerId sellerId sellerUserId conversationId productId rfqType title description category subcategory specifications items quantity minimumOrderQuantity unit targetPrice currency deliveryCountry deliveryPort deliveryTimeline deliveryDate shippingPreference incoterms attachments images documents status quotationCount viewedBySellerIds repliedBySellerIds visibility isVerifiedSuppliersOnly lastQuotedAt expiresAt tradeOrderId acceptedQuotationId createdAt updatedAt'
    )
    .populate(
      'buyerId',
      'name fullName firstName lastName avatarUrl avatar profileImage'
    )
    .populate('sellerId', 'companyName companyLogo logo logoUrl userId')
    .populate(
      'sellerUserId',
      'name fullName firstName lastName avatarUrl avatar profileImage'
    )
    .populate('conversationId', '_id lastMessageAt')
    .populate('productId', 'name images price samplePrice minimumOrderQuantity')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
}

export async function countRfqs(query) {
  return RFQ.countDocuments(query).exec();
}

export async function findRfqById(rfqId) {
  return RFQ.findById(rfqId)
    .populate(
      'buyerId',
      'email name fullName firstName lastName avatarUrl avatar profileImage'
    )
    .populate('sellerId', 'companyName companyLogo logo logoUrl userId')
    .populate(
      'sellerUserId',
      'email name fullName firstName lastName avatarUrl avatar profileImage'
    )
    .populate('conversationId', '_id lastMessage lastMessageAt')
    .populate('productId', 'name images price samplePrice minimumOrderQuantity')
    .populate('acceptedQuotationId')
    .populate('tradeOrderId')
    .populate('specificSupplierIds', 'companyName')
    .exec();
}

export async function findRfqByIdLean(rfqId) {
  return RFQ.findById(rfqId).exec();
}

export async function createRfq(data) {
  try {
    return await RFQ.create(data);
  } catch (error) {
    if (error?.code !== 11000 || !data.idempotencyKey) throw error;
    const existing = await RFQ.findOne({ buyerId: data.buyerId, idempotencyKey: data.idempotencyKey }).exec();
    if (!existing) throw error;
    existing.$locals.idempotencyReused = true;
    return existing;
  }
}

export async function findRfqByIdempotencyKey(buyerId, idempotencyKey) {
  return RFQ.findOne({ buyerId, idempotencyKey }).exec();
}

export async function updateRfq(rfqId, update) {
  return RFQ.findByIdAndUpdate(rfqId, update, { new: true }).exec();
}

// ─── Seller ────────────────────────────────────────────────
export async function findSellerByUserId(userId) {
  return Seller.findOne({ userId }).lean().exec();
}

export async function findSellerById(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) return null;
  return Seller.findOne({
    _id: sellerId,
    isActive: true,
    isSuspended: { $ne: true },
  }).lean().exec();
}

export async function findSellersForNotification(query, limit = 50) {
  return Seller.find(query).select('userId').limit(limit).lean().exec();
}

// ─── Quotations ────────────────────────────────────────────
export async function findQuotationsByRfq(rfqId, userId = null) {
  const query = { rfqId };
  if (userId) query.userId = userId;
  else query.status = { $ne: 'draft' };

  return Quotation.find(query)
    .populate({
      path: 'sellerId',
      select: 'companyName companyLogo logo logoUrl userId',
      populate: {
        path: 'userId',
        select: 'fullName avatarUrl avatar profileImage',
      },
    })
    .populate('userId', 'email name')
    .populate('productId', 'name images')
    .populate('tradeOrderId', 'orderNumber status totalPrice')
    .sort({ createdAt: -1 })
    .exec();
}

// ─── Chats ─────────────────────────────────────────────────
export async function findRfqChats(rfqId, userId) {
  return Chat.find({
    rfqId,
    $or: [{ buyerId: userId }, { sellerId: userId }],
  })
    .select('_id buyerId sellerId lastMessage lastMessageAt quotationId')
    .sort({ lastMessageAt: -1 })
    .lean()
    .exec();
}

export async function chatExistsForRfq(rfqId, buyerId, sellerUserId) {
  return Chat.exists({
    rfqId,
    buyerId,
    sellerId: sellerUserId,
    isActive: true,
  });
}

// ─── Notifications ─────────────────────────────────────────
export async function createNotifications(notifications) {
  if (!notifications.length) return [];
  const operations = notifications.map((notification) => notification.eventKey ? {
    updateOne: {
      filter: { userId: notification.userId, eventKey: notification.eventKey },
      update: { $setOnInsert: notification },
      upsert: true,
    },
  } : { insertOne: { document: notification } });
  await Notification.bulkWrite(operations, { ordered: false });
  return notifications;
}

export async function createNotification(notification) {
  return Notification.create(notification);
}
