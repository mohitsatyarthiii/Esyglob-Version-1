import Invoice from '../models/Invoice.js';
import Notification from '../models/Notification.js';
import Shipment from '../models/Shipment.js';
import Seller from '../models/Seller.js';

export const ORDER_STATUS = {
  DRAFT: 'draft',
  PENDING_PAYMENT: 'pending_payment',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  ORDER_CONFIRMED: 'confirmed',
  PREPARING_SHIPMENT: 'preparing_shipment',
  PICKUP_SCHEDULED: 'pickup_scheduled',
  PICKED_UP: 'picked_up',
  WAREHOUSE_PROCESSING: 'warehouse_processing',
  IN_TRANSIT: 'in_transit',
  CUSTOM_CLEARANCE: 'custom_clearance',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  FAILED: 'failed',
  RETURNED: 'returned',
};

export const ORDER_STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Pending',
  pending_approval: 'Pending Approval',
  awaiting_payment: 'Awaiting Payment',
  pending_payment: 'Pending Payment',
  payment_success: 'Payment Success',
  payment_confirmed: 'Payment Confirmed',
  confirmed: 'Order Confirmed',
  processing: 'Seller Processing',
  production: 'Production',
  ready_to_ship: 'Ready To Ship',
  preparing_shipment: 'Preparing Shipment',
  pickup_scheduled: 'Pickup Scheduled',
  picked_up: 'Picked Up',
  warehouse_processing: 'Warehouse Processing',
  in_transit: 'In Transit',
  custom_clearance: 'Custom Clearance',
  out_for_delivery: 'Out For Delivery',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
  returned: 'Returned',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

export const SHIPMENT_STATUS_BY_ORDER_STATUS = {
  preparing_shipment: 'pending',
  pickup_scheduled: 'pickup_scheduled',
  picked_up: 'picked_up',
  warehouse_processing: 'warehouse_processing',
  in_transit: 'in_transit',
  custom_clearance: 'custom_clearance',
  out_for_delivery: 'out_for_delivery',
  shipped: 'in_transit',
  delivered: 'delivered',
  completed: 'delivered',
  cancelled: 'cancelled',
  returned: 'returned',
};

export const ORDER_STATUS_SEQUENCE = [
  'draft', 'pending_payment', 'payment_success', 'payment_confirmed',
  'confirmed', 'preparing_shipment', 'pickup_scheduled', 'picked_up',
  'warehouse_processing', 'in_transit', 'custom_clearance',
  'out_for_delivery', 'delivered', 'completed',
];

function hasTimelineStatus(order, status) {
  return order?.timeline?.some(event => event.status === status);
}

export function pushTimeline(order, status, note, updatedBy) {
  if (!order?.timeline) order.timeline = [];
  if (hasTimelineStatus(order, status)) return;
  order.timeline.push({ status, timestamp: new Date(), note, updatedBy });
}

export function buildInvoiceLineItems(order) {
  if (order?.products?.length) {
    return order.products.map(item => ({
      description: item.name || `Order ${order.orderNumber}`,
      quantity: Number(item.quantity || order.quantity || 1),
      unit: item.unit || order.unit || '',
      unitPrice: Number(item.unitPrice || order.pricePerUnit || 0),
      total: Number(item.totalPrice || 0),
    }));
  }

  return [{
    description: `Order ${order.orderNumber}`,
    quantity: Number(order.quantity || 1),
    unit: order.unit || '',
    unitPrice: Number(order.pricePerUnit || 0),
    total: Number(order.subtotal || order.totalPrice || order.totalAmount || 0),
  }];
}

export async function ensureOrderInvoice(order) {
  if (!order?._id) return null;

  const seller = await Seller.findById(order.sellerId)
    .select('userId companyName businessEmail businessPhone address gstNumber businessRegistrationNumber')
    .lean();

  const invoice = await Invoice.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(order.orderNumber || order._id).replace(/[^A-Z0-9]/gi, '').slice(-10)}`,
        orderId: order._id,
        buyerId: order.buyerId || order.userId,
        sellerId: order.sellerId,
        sellerUserId: seller?.userId,
        currency: order.currency || 'INR',
        status: order.paymentStatus === 'paid' ? 'paid' : 'issued',
        issuedAt: new Date(),
        dueAt: order.estimatedDeliveryDate || undefined,
        lineItems: buildInvoiceLineItems(order),
      },
      $set: {
        subtotal: Number(order.subtotal || order.totalPrice || order.totalAmount || 0),
        taxAmount: Number(order.taxAmount || 0),
        shippingAmount: Number(order.shippingCost || 0),
        discountAmount: Number(order.discount || 0),
        totalAmount: Number(order.totalAmount || order.totalPrice || 0),
        paymentStatus: order.paymentStatus || 'pending',
        buyerSnapshot: order.buyerCompany || order.shippingAddress || {},
        sellerSnapshot: order.sellerCompany || seller || {},
        shipmentSnapshot: {
          trackingNumber: order.trackingNumber || '',
          shippingMethod: order.shippingMethod || '',
          estimatedDelivery: order.estimatedDeliveryDate || null,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (String(order.invoiceId || '') !== String(invoice._id)) {
    order.invoiceId = invoice._id;
  }

  return invoice;
}

export async function ensureOrderShipment(order, { status = 'pending', updatedBy } = {}) {
  if (!order?._id) return null;

  const seller = await Seller.findById(order.sellerId)
    .select('userId address companyName businessEmail businessPhone')
    .lean();

  const selected = order.tradeInformation?.logistics?.selected || {};
  const provider = selected.providerKey || 'manual';

  const event = {
    status,
    description: status === 'pending'
      ? 'Shipment created after payment confirmation'
      : `Shipment ${ORDER_STATUS_LABELS[status] || status}`,
    occurredAt: new Date(),
  };

  const shipment = await Shipment.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        orderId: order._id,
        buyerId: order.buyerId || order.userId,
        sellerId: order.sellerId,
        sellerUserId: seller?.userId,
        provider,
        courierName: selected.label || order.shippingMethod || 'EsyGlob Logistics',
        serviceLevel: selected.mode || order.shippingMethod || 'standard',
        sellerAddress: seller?.address || {},
        insuranceStatus: Number(order.insuranceCost || selected.internalBreakdown?.insurance || 0) > 0 ? 'included' : 'not_applicable',
      },
      $set: {
        status,
        trackingNumber: order.trackingNumber || undefined,
        estimatedDeliveryAt: order.estimatedDeliveryDate || undefined,
        buyerAddress: order.shippingAddress || {},
        cost: Number(order.shippingCost || selected.amount || 0),
      },
      $push: { events: event },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (String(order.shipmentId || '') !== String(shipment._id)) {
    order.shipmentId = shipment._id;
  }
  if (shipment.trackingNumber && !order.trackingNumber) {
    order.trackingNumber = shipment.trackingNumber;
  }
  pushTimeline(order, status === 'pending' ? 'preparing_shipment' : status, event.description, updatedBy);

  return shipment;
}

export async function markOrderPaymentSucceeded({ order, payment, updatedBy }) {
  if (!order?._id) return { order, invoice: null, shipment: null };

  const wasPaid = order.paymentStatus === 'paid';
  order.status = wasPaid ? order.status : 'payment_confirmed';
  order.paymentStatus = 'paid';
  order.paymentId = payment?._id || order.paymentId;
  order.paymentMethod = payment?.paymentMethod || payment?.method || order.paymentMethod || 'razorpay';

  pushTimeline(order, 'payment_success', 'Payment captured successfully', updatedBy);
  pushTimeline(order, 'payment_confirmed', 'Payment received and verified', updatedBy);
  pushTimeline(order, 'confirmed', 'Order confirmed and released to seller processing', updatedBy);

  if (!wasPaid && order.status === 'payment_confirmed') {
    order.status = 'confirmed';
  }

  const invoice = await ensureOrderInvoice(order);
  pushTimeline(order, 'invoice_generated', `Invoice ${invoice.invoiceNumber} generated automatically`, updatedBy);

  const shipment = await ensureOrderShipment(order, { status: 'pending', updatedBy });
  pushTimeline(order, 'preparing_shipment', 'Shipment record created and awaiting seller dispatch', updatedBy);

  order.platformServices = (order.platformServices || []).map(service => {
    if (service.key === 'gst_invoice' || service.key === 'invoice_generation') return { ...service, status: 'issued' };
    if (service.key === 'shipment_tracking') return { ...service, status: 'preparing_shipment' };
    if (service.key === 'escrow') return { ...service, status: 'funded' };
    return service;
  });

  await order.save();
  return { order, invoice, shipment };
}

export async function syncShipmentFromOrderStatus(order, { status, trackingNumber, estimatedDeliveryDate, updatedBy } = {}) {
  const shipmentStatus = SHIPMENT_STATUS_BY_ORDER_STATUS[status];
  if (!shipmentStatus && !trackingNumber && !estimatedDeliveryDate) return null;

  const shipment = await ensureOrderShipment(order, { status: shipmentStatus || 'pending', updatedBy });

  if (trackingNumber) shipment.trackingNumber = trackingNumber;
  if (estimatedDeliveryDate) shipment.estimatedDeliveryAt = estimatedDeliveryDate;

  if (shipmentStatus) {
    shipment.status = shipmentStatus;
    shipment.events.push({
      status: shipmentStatus,
      description: ORDER_STATUS_LABELS[status] || `Shipment ${shipmentStatus}`,
      occurredAt: new Date(),
    });
  }

  if (shipmentStatus === 'delivered') {
    shipment.deliveredAt = shipment.deliveredAt || new Date();
    order.actualDelivery = order.actualDelivery || shipment.deliveredAt;
  }

  await shipment.save();
  order.shipmentId = shipment._id;
  if (shipment.trackingNumber) order.trackingNumber = shipment.trackingNumber;
  if (shipment.estimatedDeliveryAt) order.estimatedDeliveryDate = shipment.estimatedDeliveryAt;

  return shipment;
}

export async function notifyOrderStatus(order, { status, userId }) {
  const statusText = String(status || order.status || '').replace(/_/g, ' ');
  const notificationType =
    status === 'delivered' || status === 'completed' ? 'order_delivered' :
    status === 'in_transit' || status === 'shipped' ? 'order_shipped' :
    'order_confirmed';

  await Notification.create({
    userId: order.buyerId || order.userId,
    notificationType,
    title: `Order ${statusText}`,
    description: `Order #${order.orderNumber} is now ${statusText}`,
    data: {
      relatedId: order._id,
      relatedModel: 'Order',
      actionUrl: `/dashboard/buyer/orders/${order._id}`,
      updatedBy: userId,
    },
  }).catch(error => console.error('Order status notification error:', error));
}

export async function getOrderFulfillment(orderId) {
  const [shipment, invoice] = await Promise.all([
    Shipment.findOne({ orderId }).sort({ createdAt: -1 }).lean(),
    Invoice.findOne({ orderId }).sort({ createdAt: -1 }).lean(),
  ]);
  return { shipment, invoice };
}