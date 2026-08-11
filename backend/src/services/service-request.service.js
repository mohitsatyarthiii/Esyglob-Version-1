import crypto from 'crypto';
import Razorpay from 'razorpay';
import ServiceRequest from '../models/ServiceRequest.js';
import Payment from '../models/Payment.js';
import Invoice from '../models/Invoice.js';
import ServiceEngineService from './service-engine.service.js';
import { operationalLog } from '../lib/operational-log.js';

const BASE_PRICES = {
  shipping: 1499, 'customs-brokerage': 2499, warehousing: 999, insurance: 1199, consulting: 1999,
  'quality-inspection': 3499, escrow: 999, 'trade-financing': 2499,
  'trade-assurance': 1299, 'dispute-resolution': 1999, 
};
const razorpayKeyId = process.env.RAZORPAY_KEY_ID?.trim() || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
const razorpaySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
const razorpay = razorpayKeyId && razorpaySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpaySecret }) : null;

function quote(serviceKey, requirements = {}) {
  if (serviceKey === 'shipping') throw Object.assign(new Error('Search live shipping providers to receive a quote'), { statusCode: 422, code: 'PROVIDER_SEARCH_REQUIRED' });
  const baseCost = Math.round(BASE_PRICES[serviceKey] ?? 999);
  const quantity = Math.max(1, Number(requirements.quantity || 1));
  const additionalCharges = Math.min(baseCost * 2, Math.max(0, quantity - 1) * Math.round(baseCost * 0.05));
  const platformFee = Math.round((baseCost + additionalCharges) * 0.02);
  const gstRate = 18;
  const gstAmount = Math.round((baseCost + additionalCharges + platformFee) * gstRate) / 100;
  const totalPayable = Math.round((baseCost + additionalCharges + platformFee + gstAmount) * 100) / 100;
  return { currency: 'INR', baseCost, additionalCharges, taxAmount: 0, gstRate, gstAmount, discount: 0, platformFee, totalPayable };
}

function ownedQuery(userId, id) { return { _id: id, userId }; }

async function finalizeVerifiedServicePayment(request, payment, userId) {
  let invoice = request.invoiceId ? await Invoice.findById(request.invoiceId) : await Invoice.findOne({ serviceRequestId: request._id, paymentStatus: 'paid' });
  if (!invoice) {
    const downloadToken = crypto.randomBytes(24).toString('hex');
    invoice = await Invoice.create({ invoiceNumber: `ESY-SRV-${Date.now()}-${String(request._id).slice(-4)}`, serviceRequestId: request._id, buyerId: userId, currency: request.pricing.currency, subtotal: request.pricing.baseCost + request.pricing.additionalCharges, taxAmount: request.pricing.gstAmount + request.pricing.taxAmount, discountAmount: request.pricing.discount, totalAmount: request.pricing.totalPayable, status: 'paid', paymentStatus: 'paid', issuedAt: new Date(), transactionId: payment.transactionId, paymentMethod: 'Razorpay', paymentDate: payment.paidAt, downloadToken, documentUrl: `/api/invoices/public/${downloadToken}.pdf`, lineItems: [{ description: request.provider?.serviceName || request.serviceTitle, quantity: 1, unit: 'service', unitPrice: request.pricing.baseCost, total: request.pricing.baseCost }], serviceSnapshot: { requestNumber: request.requestNumber, serviceKey: request.serviceKey, serviceTitle: request.serviceTitle, provider: request.provider, pricing: request.pricing }, terms: ['Services are subject to the accepted booking terms.'] });
  }
  request.paymentStatus = 'paid'; request.invoiceId = invoice._id;
  let booking = null;
  if (request.serviceKey === 'shipping') {
    booking = await ServiceEngineService.bookPaidRequest(request);
    request.bookingId = booking._id;
    request.status = booking.status === 'confirmed' ? 'confirmed' : 'booking_pending';
    request.provider.referenceNumber = booking.providerReference;
    request.provider.trackingNumber = booking.trackingNumber;
    request.provider.trackingUrl = booking.trackingUrl;
    request.provider.eta = booking.eta;
  } else request.status = 'under_review';
  request.progress = Math.max(25, Number(request.progress || 0));
  if (!request.history.some(item => item.status === 'payment_verified')) request.history.push({ status: 'payment_verified', note: `Payment verified: ${payment.transactionId}` });
  await request.save();
  return { success: true, request, payment, invoice, booking };
}

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
    const request = await ServiceRequest.findOne(ownedQuery(userId, id)).populate('paymentId invoiceId bookingId').lean();
    if (!request) throw Object.assign(new Error('Service request not found'), { statusCode: 404 });
    return { request };
  }

  static async create(userId, data) {
    if (data.termsAccepted !== true) throw Object.assign(new Error('Service terms must be accepted before payment'), { statusCode: 400 });
    const providerQuote = data.serviceKey === 'shipping'
      ? await ServiceEngineService.consumeQuote(userId, data.providerQuoteId, data.serviceKey)
      : null;
    const pricing = providerQuote ? ServiceEngineService.pricingFromQuote(providerQuote) : quote(data.serviceKey, data.requirements);
    const requiresPayment = pricing.totalPayable > 0;
    const request = await ServiceRequest.create({
      ...data,
      userId,
      requirements: providerQuote?.requestSnapshot || data.requirements,
      pricing,
      providerQuoteId: providerQuote?._id,
      provider: providerQuote ? {
        key: providerQuote.providerKey,
        name: providerQuote.providerName,
        serviceCode: providerQuote.serviceCode,
        serviceName: providerQuote.serviceName,
        routeType: providerQuote.routeType,
        eta: providerQuote.estimatedDeliveryAt,
      } : undefined,
      status: requiresPayment ? 'draft' : 'submitted',
      paymentStatus: requiresPayment ? 'pending' : 'paid',
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: 'service-terms-v1',
      history: [{ status: requiresPayment ? 'payment_pending' : 'submitted', note: requiresPayment ? 'Booking details saved; secure payment required' : 'Booking submitted' }],
    });
    if (providerQuote) {
      operationalLog('shipping_selection', { requestId: String(request._id), provider: providerQuote.providerKey, status: 'selected' });
      const booking = await ServiceEngineService.ensureBooking(request, providerQuote);
      request.bookingId = booking._id;
      await request.save();
    }
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
    if (!request.pricing?.totalPayable) request.pricing = quote(request.serviceKey, request.requirements);
    const amount = Math.round(Number(request.pricing.totalPayable) * 100);
    if (!Number.isSafeInteger(amount) || amount < 100) throw Object.assign(new Error('Service quote is invalid. Refresh pricing and retry.'), { statusCode: 422 });
    let payment = request.paymentId ? await Payment.findById(request.paymentId) : null;
    if (
      payment?.razorpayOrderId &&
      ['initiated', 'pending', 'processing'].includes(payment.status) &&
      Math.round(Number(payment.amount || 0) * 100) === amount
    ) {
      request.paymentStatus = 'processing';
      await request.save();
      return { razorpayOrderId: payment.razorpayOrderId, amount, currency: payment.currency || 'INR', paymentId: payment._id, keyId: razorpayKeyId, requestNumber: request.requestNumber, reused: true };
    }

    let order;
    try {
      order = await razorpay.orders.create({ amount, currency: request.pricing.currency || 'INR', receipt: `srv_${String(request._id)}`, notes: { serviceRequestId: String(request._id), requestNumber: request.requestNumber } });
    } catch (error) {
      console.error('[ServicePayment-RazorpayOrder]', { statusCode: error?.statusCode, description: error?.error?.description || error?.message });
      throw Object.assign(new Error(error?.error?.description || 'Razorpay could not create the checkout order'), { statusCode: error?.statusCode === 401 ? 503 : 502 });
    }
    payment = payment || new Payment({ userId, paymentFor: 'service', entityType: 'service', entityId: request._id, type: 'other', method: 'razorpay', paymentMethod: 'razorpay', gateway: 'razorpay' });
    Object.assign(payment, { amount: request.pricing.totalPayable, currency: request.pricing.currency, razorpayOrderId: order.id, razorpayPaymentId: undefined, razorpaySignature: undefined, transactionId: undefined, status: 'initiated', paymentDate: new Date(), description: request.serviceTitle });
    await payment.save();
    request.paymentId = payment._id; request.paymentStatus = 'processing'; await request.save();
    return { razorpayOrderId: order.id, amount: order.amount, currency: order.currency, paymentId: payment._id, keyId: razorpayKeyId, requestNumber: request.requestNumber };
  }

  static async verifyPayment(userId, id, body) {
    if (!razorpay) throw Object.assign(new Error('Payment service not configured'), { statusCode: 503 });
    const request = await ServiceRequest.findOne(ownedQuery(userId, id));
    let payment = request?.paymentId ? await Payment.findOne({ _id: request.paymentId, userId }) : null;
    if (!request || !payment) throw Object.assign(new Error('Payment session not found'), { statusCode: 404 });
    if (payment.status === 'completed') return finalizeVerifiedServicePayment(request, payment, userId);
    if (!body?.razorpayPaymentId || !body?.razorpayOrderId || !body?.razorpaySignature || body.razorpayOrderId !== payment.razorpayOrderId) throw Object.assign(new Error('Incomplete or mismatched payment verification payload'), { statusCode: 422 });
    const expected = crypto.createHmac('sha256', razorpaySecret).update(`${body.razorpayOrderId}|${body.razorpayPaymentId}`).digest('hex');
    if (expected.length !== String(body.razorpaySignature || '').length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(body.razorpaySignature))) throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
    let gatewayPayment;
    try { gatewayPayment = await razorpay.payments.fetch(body.razorpayPaymentId); } catch (error) { console.error('[ServicePayment-RazorpayVerify]', { statusCode: error?.statusCode, description: error?.error?.description || error?.message }); throw Object.assign(new Error('Razorpay payment verification is temporarily unavailable'), { statusCode: 502 }); }
    if (gatewayPayment.status !== 'captured' || gatewayPayment.order_id !== payment.razorpayOrderId || gatewayPayment.amount !== Math.round(payment.amount * 100)) throw Object.assign(new Error('Payment verification failed'), { statusCode: 400 });
    const staleProcessing = new Date(Date.now() - 5 * 60 * 1000);
    payment = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: { $ne: 'completed' },
        $or: [{ status: { $ne: 'processing' } }, { status: 'processing', updatedAt: { $lt: staleProcessing } }],
      },
      { $set: { status: 'processing', updatedAt: new Date() } },
      { new: true }
    );
    if (!payment) {
      const current = await Payment.findById(request.paymentId);
      if (current?.status === 'completed') return finalizeVerifiedServicePayment(request, current, userId);
      throw Object.assign(new Error('Payment confirmation is already being processed'), { statusCode: 409 });
    }
    Object.assign(payment, { status: 'completed', razorpayPaymentId: body.razorpayPaymentId, gatewayPaymentId: body.razorpayPaymentId, razorpaySignature: body.razorpaySignature, transactionId: body.razorpayPaymentId, gatewayResponse: gatewayPayment, paidAt: new Date(), completedAt: new Date() }); await payment.save();
    return finalizeVerifiedServicePayment(request, payment, userId);
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
