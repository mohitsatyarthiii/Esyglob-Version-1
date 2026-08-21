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
  if (shipment.trackingNumber || shipment.providerShipmentId) {
    if (!shipment.pickupRequestId && adapter.schedulePickup) {
      try {
        const pickup = await adapter.schedulePickup({ quote: snapshot, shipment });
        shipment.pickupRequestId = pickup.pickupRequestId;
        shipment.status = 'pickup_scheduled';
        shipment.providerPayload = { ...(shipment.providerPayload || {}), pickup: pickup.providerPayload };
        shipment.events.push({ status: 'pickup_scheduled', description: 'Carrier pickup scheduled', occurredAt: new Date() });
        await shipment.save();
        return { shipment, attempted: true, booked: true, pickupScheduled: true };
      } catch (error) {
        return recordPending(shipment, order, 'Shipment has an AWB; carrier pickup scheduling is pending', error.code || 'PICKUP_REQUEST_FAILED', updatedBy, 'pickup_pending');
      }
    }
    return { shipment, attempted: false, alreadyBooked: true, booked: true };
  }
  try {
    const result = await adapter.book({ quote: snapshot, booking: { bookingNumber: order.orderNumber }, order });
    shipment.provider = snapshot.providerKey;
    shipment.courierName = `EsyGlob Shipping${snapshot.serviceName ? ` - ${String(snapshot.serviceName).replace(/^Delhivery\s+/i, '')}` : ''}`;
    shipment.serviceLevel = snapshot.serviceCode || snapshot.serviceName;
    shipment.providerOrderId = result.providerReference;
    shipment.providerShipmentId = result.providerShipmentId || result.providerReference;
    shipment.pickupRequestId = result.pickupRequestId;
    shipment.trackingNumber = result.trackingNumber;
    shipment.awbNumber = result.trackingNumber;
    shipment.trackingUrl = result.trackingUrl;
    shipment.status = result.pickupRequestId ? 'pickup_scheduled' : 'pickup_pending';
    shipment.estimatedDeliveryAt = result.eta || snapshot.estimatedDeliveryAt || shipment.estimatedDeliveryAt;
    shipment.providerPayload = result.providerPayload;
    order.trackingNumber = result.trackingNumber || order.trackingNumber;
    order.timeline.push({ status: 'shipment_booked', timestamp: new Date(), note: 'EsyGlob Shipping booking confirmed', updatedBy });
    await shipment.save();
    return { shipment, attempted: true, booked: true };
  } catch (error) {
    return recordPending(shipment, order, error.publicMessage || 'Shipping provider booking is pending and will need to be retried', error.code || 'PROVIDER_BOOKING_FAILED', updatedBy);
  }
}

async function recordPending(shipment, order, message, code, updatedBy, status = 'pending') {
  shipment.status = status;
  shipment.providerPayload = { ...(shipment.providerPayload || {}), bookingError: { code, message, occurredAt: new Date() } };
  shipment.events.push({ status: 'booking_pending', description: message, occurredAt: new Date() });
  order.timeline.push({ status: 'shipping_booking_pending', timestamp: new Date(), note: message, updatedBy });
  await shipment.save();
  return { shipment, attempted: true, booked: false, error: { code, message } };
}
