import mongoose from 'mongoose';
import Quotation from '../models/Quotation.js';
import RFQ from '../models/RFQ.js';
import Order from '../models/Order.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

// ─── Quotation CRUD ────────────────────────────────────────
export async function findQuotations(query, skip, limit) {
  return Quotation.find(query)
    .select(
      'rfqId sellerId userId productId tradeOrderId unitPrice totalPrice currency pricingTiers minimumOrderQuantity suppliedQuantity leadTime leadTimeUnit paymentTerms incoterms shippingCost shippingEstimate status revisionNumber negotiationHistory sellerMessage buyerMessage agreement tradeDocuments createdAt updatedAt acceptedAt rejectedAt rejectionReason'
    )
    .populate({
      path: 'rfqId',
      select: 'title quantity rfqNumber buyerId',
      populate: { path: 'buyerId', select: 'fullName name companyName email' },
    })
    .populate({
      path: 'sellerId',
      select: 'companyName companyLogo logo logoUrl userId',
      populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
    })
    .populate(
      'userId',
      'email name fullName firstName lastName avatarUrl avatar profileImage'
    )
    .populate('productId', 'name images')
    .populate('tradeOrderId', 'orderNumber status totalPrice')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
}

export async function countQuotations(query) {
  return Quotation.countDocuments(query).exec();
}

export async function findQuotationById(quotationId) {
  return Quotation.findById(quotationId)
    .populate('rfqId')
    .populate({
      path: 'sellerId',
      select: 'companyName companyLogo logo logoUrl userId',
      populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
    })
    .populate(
      'userId',
      'email name fullName firstName lastName avatarUrl avatar profileImage'
    )
    .populate('productId', 'name images price minimumOrderQuantity')
    .populate('tradeOrderId')
    .exec();
}

export async function findQuotationByIdLean(quotationId) {
  return Quotation.findById(quotationId).exec();
}

export async function findExistingQuotation(rfqId, userId) {
  return Quotation.findOne({
    rfqId,
    userId,
    status: { $nin: ['rejected', 'expired'] },
  }).exec();
}

export async function createQuotation(data) {
  return Quotation.create(data);
}

export async function updateQuotationStatuses(rfqId, excludeId, statusUpdate) {
  return Quotation.updateMany(
    {
      rfqId,
      _id: { $ne: excludeId },
      status: { $in: ['pending', 'negotiating', 'revision_requested', 'revised'] },
    },
    { $set: statusUpdate }
  ).exec();
}

// ─── RFQ ───────────────────────────────────────────────────
export async function findRfqById(rfqId) {
  return RFQ.findById(rfqId).exec();
}

export async function findRfqBuyerIds(rfqId, sessionUserId) {
  const rfq = await RFQ.findById(rfqId).select('buyerId').lean().exec();
  if (!rfq) return { rfq: null, buyerIds: [] };

  return {
    rfq,
    buyerIds: rfq.buyerId ? [rfq.buyerId] : [],
  };
}

// ─── Seller ────────────────────────────────────────────────
export async function findSellerByUserId(userId) {
  return Seller.findOne({ userId }).lean().exec();
}

// ─── Product ───────────────────────────────────────────────
export async function findProductById(productId) {
  return Product.findById(productId).lean().exec();
}

// ─── User ──────────────────────────────────────────────────
export async function findUserById(userId) {
  return User.findById(userId).lean().exec();
}

// ─── Order ─────────────────────────────────────────────────
export async function findOrderByQuotationId(quotationId) {
  return Order.findOne({
    quotationId,
    orderSubType: 'trade_order',
  }).exec();
}

export async function createOrder(data) {
  return Order.create(data);
}

// ─── Chat ──────────────────────────────────────────────────
export async function findChatByBuyerSeller(buyerId, sellerId) {
  return Chat.findOne({
    buyerId,
    sellerId,
    isActive: true,
  })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .exec();
}

// ─── Message ───────────────────────────────────────────────
export async function createMessage(data) {
  return Message.create(data).catch(() => null);
}

// ─── Notification ──────────────────────────────────────────
export async function createNotification(data) {
  return Notification.create(data);
}
