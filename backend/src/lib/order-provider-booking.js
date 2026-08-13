import mongoose from 'mongoose';
import ServiceProviderQuote from '../models/ServiceProviderQuote.js';
import { getServiceProvider } from './service-providers/index.js';

export async function providerBookingSnapshot(userId, quoteId) {
  if (!mongoose.Types.ObjectId.isValid(quoteId)) return null;
  const quote = await ServiceProviderQuote.findOne({ _id: quoteId, userId }).lean().exec();
  if (!quote) return null;
  return {
    providerQuoteId: quote._id,
    providerKey: quote.providerKey,
    providerName: quote.providerName,
    serviceCode: quote.serviceCode,
    serviceName: quote.serviceName,
    routeType: quote.routeType,
    requestSnapshot: quote.requestSnapshot,
    providerPayload: quote.providerPayload,
    amount: quote.amount,
    currency: quote.currency,
    estimatedDeliveryAt: quote.estimatedDeliveryAt,
    estimatedDeliveryText: quote.estimatedDeliveryText,
  };
}

export async function bookPaidOrderWithProvider(order, shipment, updatedBy) {
  if (!order?._id || !shipment?._id || order.paymentStatus !== 'paid') return { shipment, attempted: false };
  if (shipment.trackingNumber || shipment.providerShipmentId) return { shipment, attempted: false, alreadyBooked: true };
  const snapshot = order.tradeInformation?.providerBookingSnapshot;
  if (!snapshot?.providerKey || !snapshot?.requestSnapshot) {
    return recordPending(shipment, order, 'Selected shipping quote is unavailable for provider booking', 'PROVIDER_QUOTE_SNAPSHOT_MISSING', updatedBy);
  }
  const adapter = getServiceProvider(snapshot.providerKey);
  const providerPickup = snapshot.providerKey === 'delhivery'
    ? snapshot.providerPayload?.pickupName
    : snapshot.providerPayload?.pickupLocation;
  if (!adapter.configured || !providerPickup) {
    return recordPending(shipment, order, 'The selected shipping provider pickup location is not configured for booking', 'PROVIDER_PICKUP_NOT_CONFIGURED', updatedBy);
  }
  try {
    const result = await adapter.book({ quote: snapshot, booking: { bookingNumber: order.orderNumber }, order });
    shipment.provider = snapshot.providerKey;
    shipment.courierName = `EsyGlob Shipping${snapshot.serviceName ? ` - ${String(snapshot.serviceName).replace(/^Delhivery\s+/i, '')}` : ''}`;
    shipment.serviceLevel = snapshot.serviceCode || snapshot.serviceName;
    shipment.providerShipmentId = result.providerReference;
    shipment.trackingNumber = result.trackingNumber;
    shipment.status = 'label_created';
    shipment.estimatedDeliveryAt = result.eta || snapshot.estimatedDeliveryAt || shipment.estimatedDeliveryAt;
    shipment.providerPayload = result.providerPayload;
    shipment.events.push({ status: 'label_created', description: 'EsyGlob Shipping booked and tracking created', occurredAt: new Date() });
    order.trackingNumber = result.trackingNumber || order.trackingNumber;
    order.timeline.push({ status: 'shipment_booked', timestamp: new Date(), note: 'EsyGlob Shipping booking confirmed', updatedBy });
    await shipment.save();
    return { shipment, attempted: true, booked: true };
  } catch (error) {
    return recordPending(shipment, order, error.publicMessage || 'Shipping provider booking is pending and will need to be retried', error.code || 'PROVIDER_BOOKING_FAILED', updatedBy);
  }
}

async function recordPending(shipment, order, message, code, updatedBy) {
  shipment.status = 'pending';
  shipment.providerPayload = { ...(shipment.providerPayload || {}), bookingError: { code, message, occurredAt: new Date() } };
  shipment.events.push({ status: 'booking_pending', description: message, occurredAt: new Date() });
  order.timeline.push({ status: 'shipping_booking_pending', timestamp: new Date(), note: message, updatedBy });
  await shipment.save();
  return { shipment, attempted: true, booked: false, error: { code, message } };
}
