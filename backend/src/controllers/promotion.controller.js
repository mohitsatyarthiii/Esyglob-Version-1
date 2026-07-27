import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import GiftCard from '../models/GiftCard.js';
import GiftCardTransaction from '../models/GiftCardTransaction.js';
import {
  createGiftCard,
  hashGiftCode,
  resolveSellerForManager,
} from '../services/promotion.service.js';
import Razorpay from 'razorpay';
import crypto from 'node:crypto';

const couponFields = [
  'code', 'name', 'description', 'discountType', 'value', 'maximumDiscount', 'minimumOrderValue',
  'currency', 'scope', 'productIds', 'categoryIds', 'sellerIds', 'manufacturerIds', 'countryCodes',
  'currencyCodes', 'firstOrderOnly', 'referralOnly', 'campaignType', 'startsAt', 'expiresAt',
  'usageLimit', 'perUserUsageLimit', 'priority', 'stackable', 'stackGroup', 'status',
];

function pick(input, fields) {
  return Object.fromEntries(fields.filter(field => input[field] !== undefined).map(field => [field, input[field]]));
}

function sendError(res, error) {
  return res.status(error.statusCode || (error.name === 'ValidationError' ? 422 : error.name === 'CastError' ? 400 : 500)).json({
    error: error.message || 'Promotion request failed',
    code: error.code,
  });
}

function couponQuery(user, seller) {
  return user.roles?.includes('admin') ? {} : { ownerType: 'seller', sellerId: seller._id };
}

export async function listCoupons(req, res) {
  try {
    const seller = await resolveSellerForManager(req.user);
    const filter = couponQuery(req.user, seller);
    if (req.query.status) filter.status = req.query.status;
    const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ coupons });
  } catch (error) { return sendError(res, error); }
}

export async function createCoupon(req, res) {
  try {
    const seller = await resolveSellerForManager(req.user);
    const input = pick(req.body || {}, couponFields);
    const isAdmin = req.user.roles?.includes('admin');
    const coupon = await Coupon.create({
      ...input,
      ownerType: isAdmin ? 'platform' : 'seller',
      sellerId: isAdmin ? undefined : seller._id,
      createdBy: req.user._id,
      scope: isAdmin ? input.scope || 'platform' : input.scope === 'product' ? 'product' : 'seller',
      sellerIds: isAdmin ? input.sellerIds : [seller._id],
    });
    return res.status(201).json({ coupon });
  } catch (error) { return sendError(res, error); }
}

export async function updateCoupon(req, res) {
  try {
    const seller = await resolveSellerForManager(req.user);
    const coupon = await Coupon.findOne({ _id: req.params.couponId, ...couponQuery(req.user, seller) });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    const input = pick(req.body || {}, couponFields.filter(field => field !== 'code'));
    if (!req.user.roles?.includes('admin')) {
      delete input.sellerIds;
      delete input.manufacturerIds;
      if (!['product', 'seller'].includes(input.scope)) input.scope = 'seller';
    }
    Object.assign(coupon, input);
    await coupon.save();
    return res.json({ coupon });
  } catch (error) { return sendError(res, error); }
}

export async function deleteCoupon(req, res) {
  try {
    const seller = await resolveSellerForManager(req.user);
    const coupon = await Coupon.findOne({ _id: req.params.couponId, ...couponQuery(req.user, seller) });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    const used = await CouponRedemption.exists({ couponId: coupon._id, status: 'redeemed' });
    if (used) {
      coupon.status = 'inactive';
      await coupon.save();
      return res.json({ deleted: false, deactivated: true, coupon });
    }
    await coupon.deleteOne();
    return res.json({ deleted: true });
  } catch (error) { return sendError(res, error); }
}

export async function couponAnalytics(req, res) {
  try {
    const seller = await resolveSellerForManager(req.user);
    const filter = couponQuery(req.user, seller);
    const couponIds = await Coupon.find(filter).distinct('_id');
    const [summary] = await CouponRedemption.aggregate([
      { $match: { couponId: { $in: couponIds }, status: 'redeemed' } },
      { $group: { _id: null, redemptions: { $sum: 1 }, totalDiscount: { $sum: '$discountAmount' }, orderValue: { $sum: '$orderAmount' } } },
    ]);
    const history = await CouponRedemption.find({ couponId: { $in: couponIds } })
      .populate('couponId', 'code name').populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ summary: summary || { redemptions: 0, totalDiscount: 0, orderValue: 0 }, history });
  } catch (error) { return sendError(res, error); }
}

export async function issueGiftCard(req, res) {
  try {
    const result = await createGiftCard(req.body || {}, req.user);
    return res.status(201).json(result);
  } catch (error) { return sendError(res, error); }
}

export async function listGiftCards(req, res) {
  try {
    const isAdmin = req.user.roles?.includes('admin');
    const filter = isAdmin && req.query.all === 'true' ? {} : { $or: [{ ownerId: req.user._id }, { purchaserId: req.user._id }] };
    const cards = await GiftCard.find(filter).sort({ createdAt: -1 }).lean();
    const transactions = await GiftCardTransaction.find({
      giftCardId: { $in: cards.map(card => card._id) },
    }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ cards, transactions });
  } catch (error) { return sendError(res, error); }
}

export async function updateGiftCard(req, res) {
  try {
    const update = pick(req.body || {}, ['label', 'status', 'expiresAt', 'ownerId', 'recipientEmail']);
    const card = await GiftCard.findByIdAndUpdate(req.params.giftCardId, { $set: update }, { returnDocument: 'after', runValidators: true });
    if (!card) return res.status(404).json({ error: 'Gift card not found' });
    return res.json({ card });
  } catch (error) { return sendError(res, error); }
}

export async function purchaseGiftCard(req, res) {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Gift card payments are not configured' });
    }
    const amount = Math.round(Number(req.body.amount || 0) * 100) / 100;
    const currency = String(req.body.currency || 'INR').toUpperCase();
    if (amount < 100) return res.status(422).json({ error: 'Minimum gift card value is 100' });
    const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await gateway.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt: `gift_${Date.now()}`,
      notes: { userId: String(req.user._id), purpose: 'gift_card' },
    });
    const card = await GiftCard.create({
      codeHash: crypto.randomBytes(32).toString('hex'),
      codeLast4: 'PEND',
      label: req.body.label || 'EsyGlob Gift Card',
      kind: 'purchased',
      originalBalance: amount,
      balance: 0,
      currency,
      purchaserId: req.user._id,
      ownerId: req.user._id,
      recipientEmail: req.body.recipientEmail,
      createdBy: req.user._id,
      status: 'inactive',
      purchaseStatus: 'pending',
      gatewayOrderId: order.id,
      expiresAt: req.body.expiresAt || null,
    });
    return res.status(201).json({
      giftCardId: card._id,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) { return sendError(res, error); }
}

export async function verifyGiftCardPurchase(req, res) {
  try {
    const { giftCardId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(String(razorpaySignature || ''), 'hex');
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return res.status(400).json({ error: 'Invalid gift card payment signature' });
    const card = await GiftCard.findOne({
      _id: giftCardId, purchaserId: req.user._id, gatewayOrderId: razorpayOrderId, purchaseStatus: 'pending',
    }).select('+gatewayOrderId +gatewayPaymentId +codeHash');
    if (!card) return res.status(404).json({ error: 'Pending gift card purchase not found' });
    const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const payment = await gateway.payments.fetch(razorpayPaymentId);
    if (payment.status !== 'captured' || payment.order_id !== razorpayOrderId || Number(payment.amount) !== Math.round(card.originalBalance * 100)) {
      return res.status(409).json({ error: 'Gift card payment was not captured correctly' });
    }
    const code = `ESY-${crypto.randomBytes(7).toString('hex').toUpperCase()}`;
    card.codeHash = hashGiftCode(code);
    card.codeLast4 = code.slice(-4);
    card.balance = card.originalBalance;
    card.status = 'active';
    card.purchaseStatus = 'paid';
    card.gatewayPaymentId = razorpayPaymentId;
    card.activatedAt = new Date();
    if (card.recipientEmail) card.ownerId = null;
    await card.save();
    await GiftCardTransaction.create({
      giftCardId: card._id, userId: req.user._id, type: 'issue', amount: card.originalBalance,
      balanceAfter: card.balance, currency: card.currency, status: 'completed', note: 'Purchased gift card activated',
    });
    return res.json({ card, code });
  } catch (error) { return sendError(res, error); }
}
