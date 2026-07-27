import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import GiftCard from '../models/GiftCard.js';
import GiftCardTransaction from '../models/GiftCardTransaction.js';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const COUNTRY_CODES = {
  INDIA: 'IN', 'UNITED STATES': 'US', USA: 'US', 'UNITED KINGDOM': 'GB', UK: 'GB',
  'UNITED ARAB EMIRATES': 'AE', UAE: 'AE', CHINA: 'CN', JAPAN: 'JP', CANADA: 'CA',
  AUSTRALIA: 'AU', GERMANY: 'DE', FRANCE: 'FR', ITALY: 'IT', SPAIN: 'ES',
  SINGAPORE: 'SG', MALAYSIA: 'MY', THAILAND: 'TH', INDONESIA: 'ID', VIETNAM: 'VN',
  'SAUDI ARABIA': 'SA', QATAR: 'QA', KUWAIT: 'KW', BAHRAIN: 'BH', OMAN: 'OM',
  BRAZIL: 'BR', MEXICO: 'MX', TURKEY: 'TR', RUSSIA: 'RU', EGYPT: 'EG',
  PAKISTAN: 'PK', BANGLADESH: 'BD', NEPAL: 'NP', 'SRI LANKA': 'LK',
  'SOUTH AFRICA': 'ZA', NIGERIA: 'NG', KENYA: 'KE',
};
const ids = values => (values || []).map(value => String(value?._id || value));
const includesId = (values, candidate) => !values?.length || ids(values).includes(String(candidate?._id || candidate || ''));
const codeOf = value => String(value || '').trim().toUpperCase();
const hashGiftCode = code => crypto.createHmac(
  'sha256',
  process.env.GIFT_CARD_HASH_SECRET || process.env.RAZORPAY_KEY_SECRET || process.env.JWT_SECRET || 'esyglob-gift-card',
).update(codeOf(code)).digest('hex');

function error(message, statusCode = 422, code = 'PROMOTION_INVALID') {
  return Object.assign(new Error(message), { statusCode, code });
}

export function normalizePricingTiers(input = [], baseMinimum = 1) {
  if (!Array.isArray(input)) throw error('Pricing tiers must be an array');
  if (input.length > 3) throw error('A maximum of three pricing tiers is allowed');
  let nextMinimum = Math.max(1, Number(baseMinimum || 1));
  return input.map((row, index) => {
    const minimumQuantity = Number(row.minimumQuantity || nextMinimum);
    const maximumQuantity = row.maximumQuantity === '' || row.maximumQuantity === null || row.maximumQuantity === undefined
      ? null
      : Number(row.maximumQuantity);
    const unitPrice = Number(row.unitPrice);
    if (!Number.isInteger(minimumQuantity) || minimumQuantity !== nextMinimum) {
      throw error(`Tier ${index + 1} must start at quantity ${nextMinimum}`);
    }
    if (maximumQuantity !== null && (!Number.isInteger(maximumQuantity) || maximumQuantity < minimumQuantity)) {
      throw error(`Tier ${index + 1} maximum must be at least ${minimumQuantity}`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw error(`Tier ${index + 1} requires a valid unit price`);
    if (maximumQuantity === null && index !== input.length - 1) throw error('Only the final pricing tier can have no maximum');
    if (maximumQuantity !== null) nextMinimum = maximumQuantity + 1;
    return { minimumQuantity, maximumQuantity, unitPrice: roundMoney(unitPrice) };
  });
}

export function productPriceForQuantity(product, quantity, now = new Date()) {
  const qty = Math.max(1, Number(quantity || 1));
  const tier = [...(product?.priceTiers || [])]
    .sort((a, b) => Number(a.minimumQuantity) - Number(b.minimumQuantity))
    .find(row => qty >= Number(row.minimumQuantity) && (row.maximumQuantity == null || qty <= Number(row.maximumQuantity)));
  const originalUnitPrice = Number(tier?.unitPrice ?? product?.price ?? 0);
  const discount = product?.discount || {};
  const scheduled = ['active', 'scheduled'].includes(discount.status)
    && (!discount.startsAt || new Date(discount.startsAt) <= now)
    && (!discount.expiresAt || new Date(discount.expiresAt) > now);
  let discountedUnitPrice = originalUnitPrice;
  if (scheduled) {
    if (discount.type === 'percentage') discountedUnitPrice = originalUnitPrice * (1 - Number(discount.value || 0) / 100);
    if (discount.type === 'fixed_amount') discountedUnitPrice = originalUnitPrice - Number(discount.value || 0);
    if (!tier && Number.isFinite(Number(discount.discountedPrice))) discountedUnitPrice = Number(discount.discountedPrice);
  }
  discountedUnitPrice = roundMoney(Math.max(0, discountedUnitPrice));
  const savingsPerUnit = roundMoney(Math.max(0, originalUnitPrice - discountedUnitPrice));
  return {
    tier: tier || null,
    originalUnitPrice: roundMoney(originalUnitPrice),
    unitPrice: discountedUnitPrice,
    savingsPerUnit,
    discountPercentage: originalUnitPrice ? roundMoney(savingsPerUnit / originalUnitPrice * 100) : 0,
    productDiscount: scheduled ? {
      type: discount.type,
      value: discount.value,
      label: discount.label || 'Product discount',
      startsAt: discount.startsAt,
      expiresAt: discount.expiresAt,
    } : null,
  };
}

async function validateCoupon(coupon, context) {
  const now = new Date();
  if (coupon.status !== 'active') throw error(`${coupon.code} is not active`);
  if (coupon.startsAt && coupon.startsAt > now) throw error(`${coupon.code} is not active yet`);
  if (coupon.expiresAt && coupon.expiresAt <= now) throw error(`${coupon.code} has expired`);
  if (coupon.currencyCodes?.length && !coupon.currencyCodes.includes(context.currency)) throw error(`${coupon.code} is not valid for ${context.currency}`);
  const rawCountry = codeOf(context.country);
  const countryCandidates = new Set([rawCountry, COUNTRY_CODES[rawCountry]].filter(Boolean));
  if (coupon.countryCodes?.length && !coupon.countryCodes.some(code => countryCandidates.has(codeOf(code)))) throw error(`${coupon.code} is not valid for this delivery country`);
  if (context.productTotal < Number(coupon.minimumOrderValue || 0)) throw error(`${coupon.code} requires a minimum order value of ${coupon.minimumOrderValue} ${context.currency}`);
  if (coupon.ownerType === 'seller' && String(coupon.sellerId) !== String(context.sellerId)) throw error(`${coupon.code} does not apply to this seller`);
  if (!includesId(coupon.productIds, context.productId)) throw error(`${coupon.code} does not apply to this product`);
  if (!includesId(coupon.categoryIds, context.categoryId)) throw error(`${coupon.code} does not apply to this category`);
  if (!includesId(coupon.sellerIds, context.sellerId)) throw error(`${coupon.code} does not apply to this seller`);
  if (!includesId(coupon.manufacturerIds, context.sellerId)) throw error(`${coupon.code} does not apply to this manufacturer`);
  const used = await CouponRedemption.countDocuments({ couponId: coupon._id, status: { $in: ['reserved', 'redeemed'] } });
  if (coupon.usageLimit && used >= coupon.usageLimit) throw error(`${coupon.code} has reached its usage limit`);
  const userUsed = await CouponRedemption.countDocuments({ couponId: coupon._id, userId: context.userId, status: { $in: ['reserved', 'redeemed'] } });
  if (coupon.perUserUsageLimit && userUsed >= coupon.perUserUsageLimit) throw error(`You have already used ${coupon.code}`);
  if (coupon.firstOrderOnly || coupon.campaignType === 'first_order') {
    const previousOrders = await Order.countDocuments({
      $or: [{ buyerId: context.userId }, { userId: context.userId }],
      paymentStatus: 'paid',
    });
    if (previousOrders) throw error(`${coupon.code} is available only on the first order`);
  }
}

function couponAmount(coupon, base, shipping) {
  if (coupon.discountType === 'free_shipping') return roundMoney(shipping);
  let amount = coupon.discountType === 'percentage' ? base * Number(coupon.value) / 100 : Number(coupon.value);
  if (coupon.maximumDiscount != null) amount = Math.min(amount, Number(coupon.maximumDiscount));
  return roundMoney(Math.max(0, Math.min(base, amount)));
}

export async function calculatePromotions({
  userId,
  product,
  seller,
  quantity,
  productTotal,
  shipping,
  couponCodes = [],
  giftCardCode,
  currency,
  country,
}) {
  const requestedCodes = [...new Set((Array.isArray(couponCodes) ? couponCodes : [couponCodes]).map(codeOf).filter(Boolean))];
  const coupons = requestedCodes.length
    ? await Coupon.find({ code: { $in: requestedCodes } }).sort({ ownerType: 1, priority: -1 }).lean()
    : [];
  const missing = requestedCodes.filter(code => !coupons.some(coupon => coupon.code === code));
  if (missing.length) throw error(`Coupon ${missing[0]} was not found`, 404);
  const context = {
    userId,
    productId: product?._id,
    categoryId: product?.categoryId,
    sellerId: seller?._id || product?.sellerId?._id || product?.sellerId,
    productTotal,
    currency: codeOf(currency || product?.currency || 'INR'),
    country: codeOf(country),
  };
  for (const coupon of coupons) await validateCoupon(coupon, context);
  let selected = coupons;
  if (coupons.some(coupon => !coupon.stackable)) {
    selected = [coupons.sort((a, b) => {
      if (a.ownerType !== b.ownerType) return a.ownerType === 'platform' ? -1 : 1;
      return Number(b.priority) - Number(a.priority);
    })[0]];
  }
  const seenGroups = new Set();
  selected = selected.filter(coupon => coupon.stackable ? !seenGroups.has(coupon.stackGroup) && seenGroups.add(coupon.stackGroup) : true);
  let runningProduct = roundMoney(productTotal);
  let runningShipping = roundMoney(shipping);
  const appliedCoupons = selected.map(coupon => {
    const amount = couponAmount(coupon, runningProduct, runningShipping);
    if (coupon.discountType === 'free_shipping') runningShipping = Math.max(0, runningShipping - amount);
    else runningProduct = Math.max(0, runningProduct - amount);
    return {
      couponId: coupon._id,
      code: coupon.code,
      name: coupon.name,
      ownerType: coupon.ownerType,
      discountType: coupon.discountType,
      amount,
      priority: coupon.priority,
    };
  });
  const couponDiscount = roundMoney(appliedCoupons.reduce((sum, item) => sum + item.amount, 0));
  let giftCard = null;
  if (giftCardCode) {
    const card = await GiftCard.findOne({ codeHash: hashGiftCode(giftCardCode) }).lean();
    if (!card) throw error('Gift card was not found', 404, 'GIFT_CARD_INVALID');
    if (card.status !== 'active' || (card.expiresAt && card.expiresAt <= new Date())) throw error('Gift card is inactive or expired', 422, 'GIFT_CARD_INVALID');
    if (card.currency !== context.currency) throw error(`Gift card is valid only in ${card.currency}`, 422, 'GIFT_CARD_CURRENCY');
    if (card.ownerId && String(card.ownerId) !== String(userId)) throw error('This gift card belongs to another account', 403, 'GIFT_CARD_OWNER');
    const payableBeforeGift = roundMoney(runningProduct + runningShipping);
    giftCard = {
      giftCardId: card._id,
      codeLast4: card.codeLast4,
      availableBalance: card.balance,
      amount: roundMoney(Math.min(card.balance, payableBeforeGift)),
      remainingBalance: roundMoney(Math.max(0, card.balance - payableBeforeGift)),
    };
  }
  return {
    appliedCoupons,
    couponDiscount,
    giftCard,
    giftCardAmount: giftCard?.amount || 0,
    productAfterDiscount: runningProduct,
    shippingAfterDiscount: runningShipping,
  };
}

export async function reserveOrderPromotions(order) {
  const snapshot = order?.promotionSnapshot;
  if (!snapshot || !order?._id) return;
  for (const item of snapshot.appliedCoupons || []) {
    await CouponRedemption.updateOne(
      { couponId: item.couponId, orderId: order._id },
      { $setOnInsert: {
        couponId: item.couponId, couponCode: item.code, userId: order.buyerId || order.userId,
        orderId: order._id, sellerId: order.sellerId, currency: order.currency,
        orderAmount: order.subtotal, discountAmount: item.amount, status: 'reserved',
      } },
      { upsert: true },
    );
  }
  if (snapshot.giftCard?.giftCardId && snapshot.giftCard.amount > 0) {
    const card = await GiftCard.findOneAndUpdate(
      { _id: snapshot.giftCard.giftCardId, status: 'active', balance: { $gte: snapshot.giftCard.amount } },
      { $inc: { balance: -snapshot.giftCard.amount } },
      { returnDocument: 'after' },
    );
    if (!card) throw error('Gift card balance changed before the order was created', 409, 'GIFT_CARD_BALANCE_CHANGED');
    await GiftCardTransaction.create({
      giftCardId: card._id, userId: order.buyerId || order.userId, orderId: order._id,
      type: 'reserve', amount: snapshot.giftCard.amount, balanceAfter: card.balance,
      currency: order.currency, status: 'reserved', note: `Reserved for ${order.orderNumber}`,
    });
  }
}

export async function commitOrderPromotions(order) {
  if (!order?._id) return;
  const redemptions = await CouponRedemption.find({ orderId: order._id, status: 'reserved' });
  for (const redemption of redemptions) {
    redemption.status = 'redeemed';
    redemption.redeemedAt = new Date();
    await redemption.save();
    await Coupon.updateOne({ _id: redemption.couponId }, {
      $inc: { redemptionCount: 1, totalDiscountDistributed: redemption.discountAmount },
    });
  }
  await GiftCardTransaction.updateMany(
    { orderId: order._id, type: 'reserve', status: 'reserved' },
    { $set: { type: 'redeem', status: 'completed', note: `Redeemed on ${order.orderNumber}` } },
  );
  const giftCardId = order.promotionSnapshot?.giftCard?.giftCardId;
  if (giftCardId) await GiftCard.updateOne({ _id: giftCardId, balance: 0 }, { $set: { status: 'depleted' } });
}

export async function releaseOrderPromotions(order) {
  if (!order?._id) return;
  await CouponRedemption.updateMany({ orderId: order._id, status: 'reserved' }, { $set: { status: 'released', releasedAt: new Date() } });
  const reservation = await GiftCardTransaction.findOne({ orderId: order._id, type: 'reserve', status: 'reserved' });
  if (reservation) {
    const card = await GiftCard.findByIdAndUpdate(reservation.giftCardId, { $inc: { balance: reservation.amount }, $set: { status: 'active' } }, { returnDocument: 'after' });
    reservation.type = 'release'; reservation.status = 'released'; reservation.balanceAfter = card?.balance || reservation.balanceAfter;
    reservation.note = `Released from ${order.orderNumber}`; await reservation.save();
  }
}

export async function resolveSellerForManager(user) {
  if (user.roles?.includes('admin')) return null;
  const seller = await Seller.findOne({ userId: user._id }).lean();
  if (!seller || !seller.isVerified) throw error('Only verified sellers can manage seller coupons', 403);
  return seller;
}

export async function createGiftCard(input, user) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw error('Gift card amount must be greater than zero');
  const code = codeOf(input.code || `ESY-${crypto.randomBytes(6).toString('hex')}`);
  let ownerId = input.ownerId || null;
  if (!ownerId && input.recipientEmail) {
    ownerId = (await User.findOne({ email: String(input.recipientEmail).trim().toLowerCase() }).select('_id').lean())?._id || null;
  }
  if (!ownerId && !input.recipientEmail) ownerId = user._id;
  const card = await GiftCard.create({
    codeHash: hashGiftCode(code), codeLast4: code.slice(-4), label: input.label,
    kind: input.kind || (user.roles?.includes('admin') ? 'admin_generated' : 'purchased'),
    originalBalance: amount, balance: amount, currency: codeOf(input.currency || 'INR'),
    purchaserId: input.purchaserId || user._id, ownerId,
    recipientEmail: input.recipientEmail, createdBy: user._id, expiresAt: input.expiresAt,
  });
  await GiftCardTransaction.create({
    giftCardId: card._id, userId: card.ownerId || user._id, type: 'issue', amount,
    balanceAfter: amount, currency: card.currency, status: 'completed', note: 'Gift card issued',
  });
  return { card, code };
}

export { hashGiftCode };
