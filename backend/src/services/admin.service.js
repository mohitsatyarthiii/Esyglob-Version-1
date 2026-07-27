import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import * as repository from '../repositories/admin.repository.js';
import { reviewVerificationApplication, reviewVerificationDocument } from './supplier.service.js';
import { ensureOrderInvoice } from '../lib/order-lifecycle.js';
import { adminRole, hasAdminPermission } from '../middlewares/admin-permission.middleware.js';
import Category from '../models/Category.js';
import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import GiftCard from '../models/GiftCard.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import Subcategory from '../models/Subcategory.js';
import User from '../models/User.js';
import { createGiftCard } from './promotion.service.js';

const resourcePermission = {
  users: 'users:manage', sellers: 'sellers:manage', verifications: 'verifications:manage',
  products: 'products:manage', categories: 'categories:manage', subcategories: 'categories:manage',
  orders: 'orders:manage', payments: 'payments:manage', coupons: 'coupons:manage',
  'gift-cards': 'gift_cards:manage', activities: 'activity:view',
};

export const getOverview = () => repository.overview();
export const list = (resource, query) => repository.listResource(resource, query);
export const get = (resource, id) => repository.getResource(resource, id);

export async function create(resource, body, admin, request = {}) {
  assertPermission(admin, resource);
  const item = resource === 'coupons'
    ? await Coupon.create({ ...normalizeCouponInput(body), ownerType: 'platform', createdBy: admin.id, scope: body.scope || 'platform' })
    : resource === 'gift-cards'
      ? await createGiftCard(body, admin)
      : await repository.createResource(resource, body);
  const record = item.card || item;
  await log(admin, request, { action: 'created', resource, resourceId: record._id, summary: `Created ${resourceLabel(resource, record)}`, changes: { created: sanitize(body) } });
  return item;
}

export async function update(resource, id, body, admin, request = {}) {
  assertPermission(admin, resource);
  if (resource === 'users' && String(id) === String(admin.id) && body.roles !== undefined) {
    const roles = Array.isArray(body.roles) ? body.roles : String(body.roles).split(',').map((value) => value.trim());
    if (!roles.includes('admin')) throw conflict('You cannot remove your own administrator role');
  }
  if (resource === 'verifications') {
    const before = await repository.getResource(resource, id);
    const result = await reviewVerificationApplication(admin, id, {
      status: body.status,
      sellerFeedback: body.sellerFeedback || body.notes || '',
      internalNote: body.internalNote || '',
      inspectionScheduledAt: body.inspectionScheduledAt,
    });
    await log(admin, request, { action: `verification_${body.status}`, resource, resourceId: id, summary: `Changed verification from ${before.status} to ${body.status}`, reason: body.sellerFeedback || body.notes, changes: { status: { from: before.status, to: body.status }, internalNoteAdded: Boolean(body.internalNote) } });
    return result.verification;
  }
  const before = await repository.getResource(resource, id);
  const item = await repository.updateResource(resource, id, body);
  await log(admin, request, { action: 'updated', resource, resourceId: id, summary: `Updated ${resourceLabel(resource, item)}`, changes: diff(before, item, Object.keys(body)) });
  return item;
}

export async function remove(resource, id, admin, request = {}) {
  assertPermission(admin, resource);
  const before = await repository.getResource(resource, id);
  let item;
  let actionName = 'deleted';
  if (resource === 'gift-cards') {
    item = await GiftCard.findByIdAndUpdate(id, { $set: { status: 'inactive' } }, { new: true }).lean();
    actionName = 'deactivated';
  } else if (resource === 'coupons' && await CouponRedemption.exists({ couponId: id, status: 'redeemed' })) {
    item = await Coupon.findByIdAndUpdate(id, { $set: { status: 'inactive' } }, { new: true }).lean();
    actionName = 'deactivated';
  } else if (resource === 'categories' && (await Product.exists({ categoryId: id }) || await Subcategory.exists({ categoryId: id }))) {
    item = await Category.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    actionName = 'deactivated';
  } else if (resource === 'subcategories' && await Product.exists({ subcategoryId: id })) {
    item = await Subcategory.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    actionName = 'deactivated';
  } else {
    item = await repository.deleteResource(resource, id, admin.id);
  }
  await log(admin, request, { action: actionName, resource, resourceId: id, summary: `${humanize(actionName)} ${resourceLabel(resource, before)}`, changes: { [actionName]: snapshot(item) } });
  return item;
}

export async function reviewDocument(verificationId, documentId, body, admin, request = {}) {
  assertPermission(admin, 'verifications');
  const result = await reviewVerificationDocument(admin, documentId, body);
  if (String(result.verification._id) !== String(verificationId)) throw Object.assign(new Error('Document does not belong to this verification'), { statusCode: 409 });
  await log(admin, request, {
    action: `document_${body.status}`, resource: 'verifications', resourceId: verificationId,
    summary: `${body.status === 'verified' ? 'Approved' : body.status === 'under_review' ? 'Opened review for' : 'Reviewed'} ${result.document.name}`,
    reason: body.reason || body.notes, changes: { documentId, status: body.status },
  });
  return result;
}

export async function action(resource, id, input, admin, request = {}) {
  assertPermission(admin, resource);
  const result = await handlers[resource]?.(id, input, admin);
  if (!result) throw Object.assign(new Error('This action is not supported for the selected resource'), { statusCode: 422 });
  await log(admin, request, {
    action: input.action, resource, resourceId: result._id || id,
    summary: `${humanize(input.action)} ${resourceLabel(resource, result)}`,
    reason: input.reason || input.notes, changes: { action: input.action, status: input.status, amount: input.amount, sortOrder: input.sortOrder },
  });
  return result;
}

const handlers = {
  users: async (id, input) => {
    const updates = input.action === 'activate' ? { isActive: true, isBanned: false, banReason: '' }
      : input.action === 'suspend' ? { isActive: false, isBanned: true, banReason: input.reason }
        : null;
    return updates && User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).lean();
  },
  products: async (id, input, admin) => {
    if (input.action === 'bulk_status') {
      const allowed = new Set(['published', 'paused', 'pending_review']);
      if (!allowed.has(input.status)) throw Object.assign(new Error('Invalid bulk product status'), { statusCode: 422 });
      const result = await Product.updateMany({ _id: { $in: input.ids } }, { $set: { status: input.status, visibility: input.status === 'published' ? 'public' : 'unlisted', reviewedAt: new Date(), reviewedBy: admin.id } });
      return { _id: id, name: `${input.ids.length} products`, updatedCount: result.modifiedCount };
    }
    const product = await Product.findById(id);
    if (!product) throw notFound('Product');
    const updates = {
      approve: { status: 'published', visibility: 'public', statusReason: '', reviewedAt: new Date(), reviewedBy: admin.id },
      reject: { status: 'rejected', statusReason: input.reason, reviewedAt: new Date(), reviewedBy: admin.id },
      suspend: { status: 'paused', visibility: 'unlisted', statusReason: input.reason, reviewedAt: new Date(), reviewedBy: admin.id },
      hide: { visibility: 'private' },
      restore: { status: 'published', visibility: 'public', statusReason: '' },
    }[input.action];
    if (input.action === 'feature') {
      product.tags = [...new Set([...(product.tags || []), 'featured'])];
    } else if (updates) Object.assign(product, updates);
    else return null;
    await product.save();
    return product.toObject();
  },
  categories: async (id, input) => {
    if (input.action === 'bulk_status') {
      await Category.updateMany({ _id: { $in: input.ids } }, { $set: { isActive: input.status === 'active' } });
      return { _id: id, name: `${input.ids.length} categories`, updatedCount: input.ids.length };
    }
    const updates = input.action === 'enable' || input.action === 'restore' ? { isActive: true }
      : input.action === 'disable' || input.action === 'suspend' ? { isActive: false }
        : input.action === 'reorder' ? { 'metadata.sortOrder': input.sortOrder } : null;
    return updates && Category.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true }).lean();
  },
  orders: async (id, input, admin) => {
    const order = await Order.findById(id);
    if (!order) throw notFound('Order');
    if (input.action === 'generate_invoice') {
      const invoice = await ensureOrderInvoice(order); await order.save(); return { ...order.toObject(), invoice };
    }
    if (input.action === 'add_note') {
      order.auditLogs.push({ action: 'admin_note', fromStatus: order.status, toStatus: order.status, actorId: admin.id, actorRole: 'admin', note: input.notes, timestamp: new Date() });
    } else if (input.action === 'update_tracking') {
      order.trackingNumber = input.reference;
      order.timeline.push({ status: 'tracking_updated', note: input.notes || `Tracking number updated to ${input.reference}`, updatedBy: admin.id, timestamp: new Date() });
    } else if (input.action === 'mark_paid') {
      order.paymentStatus = 'paid'; order.status = ['pending', 'pending_payment', 'awaiting_payment'].includes(order.status) ? 'payment_confirmed' : order.status;
      order.timeline.push({ status: 'payment_confirmed', note: input.notes || `Marked paid by admin${input.reference ? ` (${input.reference})` : ''}`, updatedBy: admin.id, timestamp: new Date() });
    } else if (input.action === 'cancel') {
      order.status = 'cancelled'; order.cancelReason = input.reason; order.cancelledAt = new Date();
      order.timeline.push({ status: 'cancelled', note: input.reason, updatedBy: admin.id, timestamp: new Date() });
    } else if (input.action === 'refund') {
      const payment = await refundOrderPayment(order, input);
      const completeRefund = payment.status === 'refunded';
      if (completeRefund) { order.status = 'refunded'; order.paymentStatus = 'refunded'; }
      order.timeline.push({ status: completeRefund ? 'refunded' : 'partial_refund', note: `${input.reason} · ${payment.currency} ${payment.refundAmount} refunded`, updatedBy: admin.id, timestamp: new Date() });
    } else if (input.status) {
      const previousStatus = order.status; order.status = input.status;
      order.timeline.push({ status: input.status, previousStatus, newStatus: input.status, note: input.notes, updatedBy: admin.id, timestamp: new Date() });
    } else return null;
    await order.save();
    return order.toObject();
  },
  payments: async (id, input) => {
    const payment = await Payment.findById(id);
    if (!payment) throw notFound('Payment');
    if (input.action === 'refund') await refundPayment(payment, input);
    else if (input.action === 'retry') {
      if (!['failed', 'cancelled'].includes(payment.status)) throw conflict('Only failed or cancelled payments can be retried');
      payment.status = 'pending'; payment.metadata = { ...(payment.metadata || {}), adminRetryAt: new Date(), previousFailure: payment.gatewayResponse };
    } else if (input.action === 'mark_paid') {
      payment.status = 'completed'; payment.completedAt = new Date(); payment.paidAt = new Date();
      payment.transactionId = input.reference || payment.transactionId || `ADMIN-${Date.now()}`;
      if (payment.orderId) await Order.findByIdAndUpdate(payment.orderId, { $set: { paymentStatus: 'paid' } });
    } else return null;
    await payment.save();
    return payment.toObject();
  },
  coupons: async (id, input, admin) => {
    const coupon = await Coupon.findById(id);
    if (!coupon) throw notFound('Coupon');
    if (input.action === 'duplicate') {
      const copy = coupon.toObject(); delete copy._id; delete copy.createdAt; delete copy.updatedAt;
      copy.code = `${coupon.code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`; copy.name = `${coupon.name} copy`; copy.status = 'draft'; copy.createdBy = admin.id; copy.redemptionCount = 0; copy.totalDiscountDistributed = 0;
      return (await Coupon.create(copy)).toObject();
    }
    if (input.action === 'enable') coupon.status = 'active';
    else if (input.action === 'disable') coupon.status = 'inactive';
    else return null;
    await coupon.save(); return coupon.toObject();
  },
  'gift-cards': async (id, input) => {
    const card = await GiftCard.findById(id);
    if (!card) throw notFound('Gift card');
    if (input.action === 'activate') card.status = card.balance > 0 ? 'active' : 'depleted';
    else if (input.action === 'disable') card.status = 'inactive';
    else return null;
    await card.save(); return card.toObject();
  },
};

async function refundOrderPayment(order, input) {
  const payment = await Payment.findOne({ orderId: order._id, status: 'completed' }).sort({ createdAt: -1 });
  if (!payment) throw Object.assign(new Error('No completed payment exists for this order'), { statusCode: 409 });
  await refundPayment(payment, input);
  await payment.save();
  return payment;
}

async function refundPayment(payment, input) {
  if (payment.status === 'refunded') throw conflict('This payment has already been refunded');
  const amount = Math.min(Number(input.amount || payment.amount), Number(payment.amount));
  if (payment.razorpayPaymentId) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw Object.assign(new Error('Razorpay refund credentials are not configured'), { statusCode: 503 });
    const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const response = await gateway.payments.refund(payment.razorpayPaymentId, { amount: Math.round(amount * 100), notes: { reason: input.reason } });
    payment.gatewayResponse = { ...(payment.gatewayResponse || {}), refund: response };
  } else if (!input.reference) {
    throw Object.assign(new Error('A manual refund reference is required for non-Razorpay payments'), { statusCode: 422 });
  }
  payment.status = amount >= Number(payment.amount) ? 'refunded' : 'completed';
  payment.refundAmount = Number(payment.refundAmount || 0) + amount;
  payment.refundReason = input.reason; payment.refundedAt = new Date();
  payment.metadata = { ...(payment.metadata || {}), refundReference: input.reference };
}

function assertPermission(admin, resource) {
  const permission = resourcePermission[resource];
  if (!permission || !hasAdminPermission(admin, permission)) throw Object.assign(new Error('Your admin role does not permit this operation'), { statusCode: 403, code: 'ADMIN_PERMISSION_REQUIRED' });
}

async function log(admin, request, input) {
  return repository.createActivity({
    actorId: admin.id, actorRole: adminRole(admin), ...input,
    ipAddress: request.ipAddress, userAgent: request.userAgent,
    metadata: { ...(input.metadata || {}), requestId: request.requestId },
  });
}

function resourceLabel(resource, item) {
  return item?.fullName || item?.companyName || item?.name || item?.orderNumber || item?.paymentNumber || item?.code || item?.label || `${resource} record`;
}
function humanize(value) { return String(value).replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }
function sanitize(value) { return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !/password|secret|token|signature/i.test(key))); }
function normalizeCouponInput(body) {
  const normalized = { ...body };
  for (const field of ['productIds', 'categoryIds', 'sellerIds', 'manufacturerIds', 'countryCodes', 'currencyCodes']) {
    if (typeof normalized[field] === 'string') normalized[field] = normalized[field].split(',').map((value) => value.trim()).filter(Boolean);
  }
  return normalized;
}
function snapshot(value) { return sanitize(value?.toObject?.() || value || {}); }
function diff(before, after, keys) {
  return Object.fromEntries(keys.filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).map((key) => [key, { from: before?.[key], to: after?.[key] }]));
}
function notFound(label) { return Object.assign(new Error(`${label} not found`), { statusCode: 404 }); }
function conflict(message) { return Object.assign(new Error(message), { statusCode: 409 }); }
