import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Shipment from '../models/Shipment.js';
import Seller from '../models/Seller.js';
import Notification from '../models/Notification.js';
import Message from '../models/Message.js';
import SupportTicket from '../models/SupportTicket.js';
import { getServiceProvider } from '../lib/service-providers/index.js';
import { bookPaidOrderWithProvider } from '../lib/order-provider-booking.js';
import { ensureOrderShipment, pushTimeline } from '../lib/order-lifecycle.js';
import { getIO } from '../lib/socket.js';

const TERMINAL = new Set(['delivered', 'rto_delivered', 'cancelled', 'returned']);
const ORDER_STATUS = {
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  delayed: 'delayed',
  exception: 'delayed',
  cancelled: 'cancelled',
  rto_initiated: 'returned',
  rto_in_transit: 'returned',
  rto_delivered: 'returned',
};
const LABELS = {
  ready_for_shipment: 'Ready for shipment',
  shipment_booked: 'Shipment booked',
  label_created: 'Tracking number generated',
  pickup_scheduled: 'Pickup scheduled',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delayed: 'Shipment delayed',
  delivery_attempted: 'Delivery attempted',
  exception: 'Shipment exception',
  rto_initiated: 'Return initiated',
  rto_in_transit: 'Return in transit',
  rto_delivered: 'Return delivered',
  cancelled: 'Shipment cancelled',
};

function id(value) {
  return String(value?._id || value?.id || value || '');
}

function cleanDate(value, fallback = new Date()) {
  const result = value ? new Date(value) : fallback;
  return Number.isNaN(result.getTime()) ? fallback : result;
}

function eventKey(provider, event) {
  if (event.eventKey) return String(event.eventKey);
  return crypto.createHash('sha256').update(JSON.stringify([
    provider || 'esyglob',
    event.status || '',
    event.providerStatus || '',
    cleanDate(event.occurredAt).toISOString(),
    event.location || '',
    event.description || event.message || '',
  ])).digest('hex');
}

function publicTracking(order, shipment) {
  const events = [...(shipment?.events || [])]
    .map(event => ({
      id: id(event._id) || event.eventKey,
      status: event.status,
      description: event.description,
      location: event.location,
      timestamp: event.occurredAt,
      providerStatus: event.providerStatus,
      source: event.source,
    }))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  return {
    order: {
      id: id(order._id),
      orderNumber: order.orderNumber,
      orderType: order.orderType === 'sample' || order.orderSubType === 'sample_order' ? 'sample' : 'trade',
      status: order.status,
      paymentStatus: order.paymentStatus,
      product: order.productId || order.products?.[0] || null,
      products: order.products || [],
      seller: order.sellerId,
      buyer: order.buyerId || order.userId,
      createdAt: order.createdAt,
    },
    tracking: {
      shipmentId: id(shipment?._id),
      provider: shipment?.provider || '',
      shippingPartner: shipment?.provider ? String(shipment.provider).replace(/^./, character => character.toUpperCase()) : '',
      service: shipment?.courierName || 'EsyGlob Logistics — Standard',
      providerService: shipment?.serviceLevel || '',
      trackingNumber: shipment?.trackingNumber || shipment?.awbNumber || '',
      awb: shipment?.awbNumber || shipment?.trackingNumber || '',
      providerShipmentId: shipment?.providerShipmentId || '',
      trackingUrl: shipment?.trackingUrl || '',
      status: shipment?.status || (order.paymentStatus === 'paid' ? 'pending' : 'order_confirmed'),
      currentLocation: shipment?.currentLocation || '',
      estimatedDelivery: shipment?.estimatedDeliveryAt || order.estimatedDeliveryDate || null,
      lastUpdatedAt: shipment?.lastUpdatedAt || shipment?.updatedAt || order.updatedAt,
      refreshStopped: TERMINAL.has(shipment?.status),
      bookingError: shipment?.providerPayload?.bookingError?.message || '',
      events,
    },
  };
}

async function authorizedOrder(userId, roles, orderId, { buyerOnly = false, sellerOnly = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  const order = await Order.findById(orderId)
    .populate('buyerId', 'fullName email')
    .populate({ path: 'sellerId', select: 'companyName userId businessEmail businessPhone address', populate: { path: 'userId', select: 'fullName email' } })
    .populate('productId', 'name images unit')
    .exec();
  if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  const buyer = id(order.buyerId || order.userId) === String(userId);
  const seller = id(order.sellerId?.userId) === String(userId);
  const admin = roles?.includes('admin');
  if ((!buyer && !seller && !admin) || (buyerOnly && !buyer && !admin) || (sellerOnly && !seller && !admin)) {
    throw Object.assign(new Error('You do not have access to this order tracking'), { statusCode: 403 });
  }
  return { order, buyer, seller, admin };
}

async function notifyMilestone(order, status, shipment, description) {
  const buyerId = order.buyerId?._id || order.buyerId || order.userId;
  const title = {
    ready_for_shipment: 'Your order is ready for shipment',
    shipment_booked: 'Your shipment has been booked',
    label_created: 'Your tracking number is available',
    picked_up: 'Your order has been picked up',
    in_transit: 'Your shipment is in transit',
    out_for_delivery: 'Your order is out for delivery',
    delivered: 'Your order has been delivered',
    delayed: 'Your shipment is delayed',
    exception: 'Your shipment needs attention',
  }[status];
  if (!title) return;
  const notificationType = status === 'delivered' ? 'shipment_delivered'
    : status === 'in_transit' || status === 'picked_up' || status === 'out_for_delivery' ? 'shipment_in_transit'
      : status === 'shipment_booked' || status === 'label_created' ? 'shipment_booked' : 'shipment_created';
  await Notification.create({
    eventKey: `tracking:${id(order._id)}:${status}`,
    userId: buyerId,
    notificationType,
    title,
    description: description || `Order #${order.orderNumber}: ${LABELS[status] || status}`,
    data: { relatedId: order._id, relatedModel: 'Order', actionUrl: `/orders/${order._id}/tracking` },
    priority: ['delayed', 'exception'].includes(status) ? 'high' : 'medium',
  }).catch(error => {
    if (error?.code !== 11000) console.error('Tracking notification error:', error);
  });

  if (!order.chatId || !order.sellerId?.userId || !['shipment_booked', 'label_created', 'picked_up', 'out_for_delivery', 'delivered'].includes(status)) return;
  const trackingLine = shipment.trackingNumber ? `\n\nTracking number: ${shipment.trackingNumber}` : '';
  await Message.create({
    deliveryKey: `tracking:${id(order._id)}:${status}`,
    chatId: order.chatId,
    senderId: order.sellerId.userId,
    receiverId: buyerId,
    content: `${title}.${trackingLine}\n\nTrack your shipment → /orders/${order._id}/tracking`,
    messageType: 'system',
    orderDetails: { orderId: order._id, orderNumber: order.orderNumber, orderStatus: order.status, actionUrl: `/orders/${order._id}/tracking` },
  }).catch(error => {
    if (error?.code !== 11000) console.error('Tracking message error:', error);
  });
}

async function appendEvent(order, shipment, rawEvent, source = 'provider_api') {
  const occurredAt = cleanDate(rawEvent.occurredAt);
  const event = {
    eventKey: eventKey(shipment.provider, { ...rawEvent, occurredAt }),
    status: rawEvent.status || shipment.status,
    description: String(rawEvent.message || rawEvent.description || LABELS[rawEvent.status] || 'Shipment update').slice(0, 500),
    location: String(rawEvent.location || '').slice(0, 240),
    occurredAt,
    provider: shipment.provider,
    providerStatus: String(rawEvent.providerStatus || '').slice(0, 160),
    source,
    providerPayload: rawEvent.providerPayload,
  };
  if (shipment.events.some(item => item.eventKey === event.eventKey)) return false;
  shipment.events.push(event);
  shipment.status = event.status || shipment.status;
  shipment.currentLocation = event.location || shipment.currentLocation;
  shipment.lastUpdatedAt = occurredAt;
  const mapped = ORDER_STATUS[event.status];
  if (mapped && order.paymentStatus === 'paid') {
    order.status = mapped;
    pushTimeline(order, mapped, event.description);
    if (mapped === 'delivered') {
      shipment.deliveredAt = occurredAt;
      order.deliveredAt = order.deliveredAt || occurredAt;
      order.actualDelivery = order.actualDelivery || occurredAt;
    }
  }
  await notifyMilestone(order, event.status, shipment, event.description);
  return true;
}

export async function applyTrackingEvent(order, shipment, rawEvent, source = 'provider_api') {
  return appendEvent(order, shipment, rawEvent, source);
}

function readyValidation(order, shipment) {
  const missing = [];
  if (order.paymentStatus !== 'paid') missing.push('Payment must be successfully verified.');
  if (['cancelled', 'refunded', 'failed', 'returned', 'delivered'].includes(order.status)) missing.push('This order is not eligible for shipment.');
  const address = order.shippingAddress || {};
  if (!(address.address && address.city && address.state && address.country && (address.postalCode || address.zipCode) && address.phone)) missing.push('The buyer shipping address is incomplete.');
  const snapshot = order.tradeInformation?.providerBookingSnapshot;
  if (!snapshot?.providerKey || !snapshot?.requestSnapshot) missing.push('A valid shipping provider and service must be selected.');
  const packageInfo = snapshot?.requestSnapshot?.shipment;
  if (!(Number(packageInfo?.weightKg) > 0 && Number(packageInfo?.lengthCm) > 0 && Number(packageInfo?.widthCm) > 0 && Number(packageInfo?.heightCm) > 0)) missing.push('Package weight and dimensions are required.');
  if (!shipment) missing.push('The shipment record is unavailable.');
  return missing;
}

export default class OrderTrackingService {
  static async get(userId, roles, orderId, { refresh = false } = {}) {
    const { order } = await authorizedOrder(userId, roles, orderId);
    let shipment = await Shipment.findOne({ orderId: order._id });
    if (refresh && shipment?.trackingNumber && !TERMINAL.has(shipment.status)) {
      const age = Date.now() - new Date(shipment.lastProviderRefreshAt || 0).getTime();
      if (age >= 60_000) {
        try { ({ shipment } = await this.refreshProvider(order, shipment)); }
        catch (error) {
          shipment.providerPayload = { ...(shipment.providerPayload || {}), trackingError: { code: error.code || 'TRACKING_UNAVAILABLE', message: 'Live tracking is temporarily unavailable', occurredAt: new Date() } };
          shipment.lastProviderRefreshAt = new Date();
          await shipment.save();
        }
      }
    }
    return publicTracking(order, shipment);
  }

  static async markReady(userId, roles, orderId) {
    const { order } = await authorizedOrder(userId, roles, orderId, { sellerOnly: true });
    let shipment = await Shipment.findOne({ orderId: order._id });
    if (!shipment && order.paymentStatus === 'paid') shipment = await ensureOrderShipment(order, { status: 'pending', updatedBy: userId });
    const missing = readyValidation(order, shipment);
    if (missing.length) throw Object.assign(new Error(missing.join(' ')), { statusCode: 409, code: 'SHIPMENT_NOT_READY', details: missing });

    if (!shipment.events.some(event => event.status === 'ready_for_shipment')) {
      shipment.status = 'ready_for_shipment';
      await appendEvent(order, shipment, { status: 'ready_for_shipment', description: 'Seller marked the order ready for shipment', occurredAt: new Date() }, 'seller');
    }
    order.status = 'ready_to_ship';
    pushTimeline(order, 'ready_to_ship', 'Seller marked the order ready for shipment', userId);
    await Promise.all([shipment.save(), order.save()]);

    const booking = await bookPaidOrderWithProvider(order, shipment, userId);
    if (booking.booked || booking.alreadyBooked) {
      shipment = booking.shipment;
      shipment.trackingUrl = shipment.trackingUrl || booking.trackingUrl || shipment.providerPayload?.trackingUrl;
      if (!shipment.events.some(event => event.status === 'shipment_booked')) await appendEvent(order, shipment, { status: 'shipment_booked', description: 'EsyGlob Logistics shipment booked', occurredAt: new Date() }, 'system');
      if (shipment.trackingNumber && !shipment.events.some(event => event.status === 'label_created')) await appendEvent(order, shipment, { status: 'label_created', description: 'Carrier tracking number generated', occurredAt: new Date() }, 'system');
      if (shipment.pickupRequestId && !shipment.events.some(event => event.status === 'pickup_scheduled')) await appendEvent(order, shipment, { status: 'pickup_scheduled', description: 'Carrier pickup scheduled', occurredAt: new Date() }, 'system');
      order.status = shipment.pickupRequestId ? 'pickup_scheduled' : 'ready_to_ship';
      await Promise.all([shipment.save(), order.save()]);
    }
    const io = getIO();
    if (io) {
      io.to(`user_${id(order.buyerId || order.userId)}`).emit('order_updated', { orderId: id(order._id), status: order.status });
      io.to(`user_${id(order.sellerId?.userId)}`).emit('order_updated', { orderId: id(order._id), status: order.status });
    }
    return { ...publicTracking(order, shipment), booking: { success: Boolean(booking.booked || booking.alreadyBooked), pending: !booking.booked && !booking.alreadyBooked, message: booking.error?.message || '' } };
  }

  static async refreshProvider(order, shipment) {
    if (!shipment.trackingNumber) return { order, shipment };
    const adapter = getServiceProvider(shipment.provider);
    if (!adapter.configured) throw Object.assign(new Error('Tracking provider is not configured'), { statusCode: 503, code: 'PROVIDER_NOT_CONFIGURED' });
    const result = await adapter.track(shipment.trackingNumber);
    for (const event of [...(result.events || [])].sort((a, b) => cleanDate(a.occurredAt) - cleanDate(b.occurredAt))) {
      await appendEvent(order, shipment, event, 'provider_api');
    }
    if (result.status && !result.events?.some(event => event.status === result.status)) {
      await appendEvent(order, shipment, { status: result.status, providerStatus: result.providerStatus, location: result.currentLocation, description: LABELS[result.status], occurredAt: new Date() }, 'provider_api');
    }
    shipment.status = result.status || shipment.status;
    shipment.currentLocation = result.currentLocation || shipment.currentLocation;
    shipment.estimatedDeliveryAt = result.eta || shipment.estimatedDeliveryAt;
    shipment.lastProviderRefreshAt = new Date();
    shipment.lastUpdatedAt = new Date();
    shipment.providerPayload = { ...(shipment.providerPayload || {}), tracking: result.providerPayload };
    order.trackingNumber = shipment.trackingNumber;
    order.estimatedDeliveryDate = shipment.estimatedDeliveryAt || order.estimatedDeliveryDate;
    await Promise.all([shipment.save(), order.save()]);
    return { order, shipment };
  }

  static async createQuery(userId, roles, orderId, data = {}) {
    const { order } = await authorizedOrder(userId, roles, orderId, { buyerOnly: true });
    const shipment = await Shipment.findOne({ orderId: order._id });
    const category = String(data.category || '').trim();
    const allowed = ['tracking_issue', 'shipment_delayed', 'delivery_issue', 'wrong_tracking_information', 'damaged_shipment', 'other'];
    if (!allowed.includes(category)) throw Object.assign(new Error('Please select a valid query category'), { statusCode: 422 });
    const message = String(data.message || '').trim();
    if (message.length < 10 || message.length > 4000) throw Object.assign(new Error('Please enter a message between 10 and 4000 characters'), { statusCode: 422 });
    const ticket = await SupportTicket.create({
      userId,
      roleContext: 'buyer',
      issueType: category === 'damaged_shipment' ? 'complaint' : 'shipping',
      subject: `${LABELS[shipment?.status] || 'Shipment'} — order #${order.orderNumber}`.slice(0, 140),
      description: message,
      relatedModel: 'Order',
      relatedId: order._id,
      source: 'manual',
      priority: ['shipment_delayed', 'delivery_issue', 'damaged_shipment'].includes(category) ? 'high' : 'medium',
      metadata: { category, orderId: order._id, shipmentId: shipment?._id, trackingNumber: shipment?.trackingNumber || '', buyerId: userId, sellerId: order.sellerId?._id || order.sellerId },
    });
    return { ticket: { id: ticket._id, status: ticket.status, subject: ticket.subject, createdAt: ticket.createdAt } };
  }
}
