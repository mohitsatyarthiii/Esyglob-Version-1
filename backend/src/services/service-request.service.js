import crypto from 'crypto';
import Razorpay from 'razorpay';
import ServiceRequest from '../models/ServiceRequest.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';

const BASE_PRICES = {
  shipping: 1499, 'customs-brokerage': 2499, warehousing: 999,
  'documentation-support': 799, insurance: 1199, consulting: 1999,
  'quality-inspection': 3499, escrow: 999, 'trade-financing': 2499,
  'trade-assurance': 1299, 'dispute-resolution': 1999, 'seller-verification': 999,
};

const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;

function quote(serviceKey, requirements = {}) {
  const baseCost = BASE_PRICES[serviceKey] ?? 999;
  const quantity = Math.max(1, Number(requirements.quantity || 1));
  const additionalCharges = Math.min(baseCost * 2, Math.max(0, quantity - 1) * Math.round(baseCost * 0.05));
  const platformFee = Math.round((baseCost + additionalCharges) * 0.02);
  const gstRate = 18;
  const gstAmount = Math.round((baseCost + additionalCharges + platformFee) * gstRate) / 100;
  const totalPayable = Math.round((baseCost + additionalCharges + platformFee + gstAmount) * 100) / 100;
  return { currency: 'INR', baseCost, additionalCharges, taxAmount: 0, gstRate, gstAmount, discount: 0, platformFee, totalPayable };
}

function ownedQuery(userId, id) { return { _id: id, userId }; }

class ServiceRequestService {
  static getQuote(serviceKey, requirements) { return quote(serviceKey, requirements); }

  static async list(userId, query = {}) {
    const filter = { userId };
    if (query.role) filter.role = query.role;
    if (query.serviceKey) filter.serviceKey = query.serviceKey;
    if (query.status) filter.status = query.status;
    const requests = await ServiceRequest.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(query.limit) || 50, 100)).lean();
    return { requests };
  }

  static async get(userId, id) {
    const request = await ServiceRequest.findOne(ownedQuery(userId, id)).populate('paymentId invoiceId').lean();
    if (!request) throw Object.assign(new Error('Service request not found'), { statusCode: 404 });
    return { request };
  }

  static async create(userId, data) {
    const pricing = quote(data.serviceKey, data.requirements);
    const request = await ServiceRequest.create({ ...data, userId, pricing, paymentStatus: pricing.totalPayable ? 'pending' : 'paid', history: [{ status: 'submitted', note: 'Booking submitted' }] });
    return { request };
  }

  static async cancel(userId, id) {
    const request = await ServiceRequest.findOne(ownedQuery(userId, id));
    if (!request) throw Object.assign(new Error('Service request not found'), { statusCode: 404 });
    if (!['draft', 'submitted', 'under_review'].includes(request.status) || request.paymentStatus === 'paid') throw Object.assign(new Error('This request can no longer be cancelled'), { statusCode: 409 });
    request.status = 'cancelled'; request.paymentStatus = 'cancelled'; request.progress = 0;
    request.history.push({ status: 'cancelled', note: 'Cancelled by customer' }); await request.save();
    return { request };
  }

  static async initiatePayment(userId, id) {
    if (!razorpay) throw Object.assign(new Error('Payment service not configured'), { statusCode: 503 });
    const request = await ServiceRequest.findOne(ownedQuery(userId, id));
    if (!request) throw Object.assign(new Error('Service request not found'), { statusCode: 404 });
    if (request.paymentStatus === 'paid') throw Object.assign(new Error('Service is already paid'), { statusCode: 409 });
    const amount = Math.round(request.pricing.totalPayable * 100);
    const order = await razorpay.orders.create({ amount, currency: request.pricing.currency, receipt: `service_${request.requestNumber}`, notes: { serviceRequestId: String(request._id) } });
    const payment = await Payment.create({ userId, amount: request.pricing.totalPayable, currency: request.pricing.currency, paymentFor: 'service', entityType: 'service', entityId: request._id, type: 'other', razorpayOrderId: order.id, status: 'initiated', description: request.serviceTitle });
    request.paymentId = payment._id; request.paymentStatus = 'processing'; await request.save();
    return { razorpayOrderId: order.id, amount: order.amount, currency: order.currency, paymentId: payment._id, keyId: process.env.RAZORPAY_KEY_ID, requestNumber: request.requestNumber };
  }

  static async verifyPayment(userId, id, body) {
    if (!razorpay) throw Object.assign(new Error('Payment service not configured'), { statusCode: 503 });
    const request = await ServiceRequest.findOne(ownedQuery(userId, id));
    const payment = request?.paymentId ? await Payment.findOne({ _id: request.paymentId, userId }) : null;
    if (!request || !payment) throw Object.assign(new Error('Payment session not found'), { statusCode: 404 });
    if (payment.status === 'completed') return { success: true, request };
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${body.razorpayOrderId}|${body.razorpayPaymentId}`).digest('hex');
    if (expected.length !== String(body.razorpaySignature || '').length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(body.razorpaySignature))) throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
    const gatewayPayment = await razorpay.payments.fetch(body.razorpayPaymentId);
    if (gatewayPayment.status !== 'captured' || gatewayPayment.order_id !== payment.razorpayOrderId || gatewayPayment.amount !== Math.round(payment.amount * 100)) throw Object.assign(new Error('Payment verification failed'), { statusCode: 400 });
    Object.assign(payment, { status: 'completed', razorpayPaymentId: body.razorpayPaymentId, razorpaySignature: body.razorpaySignature, transactionId: body.razorpayPaymentId, paidAt: new Date() }); await payment.save();
    const invoice = await Invoice.create({ invoiceNumber: `ESY-SRV-${Date.now()}`, serviceRequestId: request._id, buyerId: userId, currency: request.pricing.currency, subtotal: request.pricing.baseCost + request.pricing.additionalCharges, taxAmount: request.pricing.gstAmount + request.pricing.taxAmount, discountAmount: request.pricing.discount, totalAmount: request.pricing.totalPayable, status: 'paid', paymentStatus: 'paid', issuedAt: new Date(), transactionId: payment.transactionId, paymentMethod: 'Razorpay', paymentDate: payment.paidAt, lineItems: [{ description: request.serviceTitle, quantity: 1, unit: 'service', unitPrice: request.pricing.baseCost, total: request.pricing.baseCost }], serviceSnapshot: { requestNumber: request.requestNumber, serviceKey: request.serviceKey, serviceTitle: request.serviceTitle, pricing: request.pricing }, terms: ['Services are subject to the accepted booking terms.'] });
    request.paymentStatus = 'paid'; request.invoiceId = invoice._id; request.status = 'under_review'; request.progress = 25; request.history.push({ status: 'payment_verified', note: `Payment verified: ${payment.transactionId}` }); await request.save();
    return { success: true, request, payment, invoice };
  }

  static async setPaymentStatus(userId, id, status) {
    if (!['failed', 'cancelled', 'pending'].includes(status)) throw Object.assign(new Error('Invalid payment status'), { statusCode: 422 });
    const request = await ServiceRequest.findOne(ownedQuery(userId, id));
    if (!request) throw Object.assign(new Error('Service request not found'), { statusCode: 404 });
    if (request.paymentStatus === 'paid') throw Object.assign(new Error('Verified payment status cannot be changed'), { statusCode: 409 });
    request.paymentStatus = status;
    request.history.push({ status: `payment_${status}`, note: `Payment ${status} by customer checkout` });
    await request.save();
    if (request.paymentId) await Payment.updateOne({ _id: request.paymentId, userId, status: { $ne: 'completed' } }, { status });
    return { request };
  }
}

export default ServiceRequestService;
