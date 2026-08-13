import crypto from 'node:crypto';
import Order from '../models/Order.js';
import Shipment from '../models/Shipment.js';
import { normalizeTracking } from '../lib/service-providers/adapter.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function value(body, paths) {
  for (const path of paths) {
    const result = path.split('.').reduce((current, key) => current?.[key], body);
    if (result !== undefined && result !== null && String(result)) return result;
  }
  return '';
}

export async function receiveProviderWebhook(provider, headers, body) {
  if (!['delhivery', 'shiprocket'].includes(provider)) throw Object.assign(new Error('Unsupported provider webhook'), { statusCode: 404 });
  const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`] || process.env.SHIPPING_WEBHOOK_SECRET;
  if (!secret) throw Object.assign(new Error('Provider webhook is not configured'), { statusCode: 503, code: 'WEBHOOK_NOT_CONFIGURED' });
  const received = headers['x-webhook-secret'] || headers['x-api-key'] || String(headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(secret, received)) throw Object.assign(new Error('Invalid webhook signature'), { statusCode: 401, code: 'INVALID_WEBHOOK_SIGNATURE' });

  const trackingNumber = String(value(body, ['awb', 'awb_code', 'tracking_number', 'Shipment.AWB', 'shipment.awb']) || '').trim();
  const providerShipmentId = String(value(body, ['shipment_id', 'shipment.id', 'Shipment.ShipmentId']) || '').trim();
  if (!trackingNumber && !providerShipmentId) return { ignored: true };
  const shipment = await Shipment.findOne({ provider, $or: [
    ...(trackingNumber ? [{ trackingNumber }, { awbNumber: trackingNumber }] : []),
    ...(providerShipmentId ? [{ providerShipmentId }] : []),
  ] });
  if (!shipment) return { ignored: true };

  const providerEventId = String(value(body, ['event_id', 'id', 'scan_id']) || crypto.createHash('sha256').update(JSON.stringify([trackingNumber, value(body, ['status', 'current_status', 'Shipment.Status.Status']), value(body, ['timestamp', 'event_time', 'Shipment.Status.StatusDateTime'])])).digest('hex'));
  const seen = shipment.providerPayload?.webhookEventIds || [];
  if (seen.includes(providerEventId)) return { accepted: true, duplicate: true };
  const rawStatus = value(body, ['status', 'current_status', 'shipment_status', 'Shipment.Status.Status', 'shipment.status']);
  const status = normalizeTracking(rawStatus);
  const occurredAt = new Date(value(body, ['timestamp', 'event_time', 'updated_at', 'Shipment.Status.StatusDateTime']) || Date.now());
  shipment.status = status === 'failed' ? 'exception' : status;
  shipment.events.push({ status: shipment.status, description: `EsyGlob Shipping ${String(rawStatus || status).replaceAll('_', ' ')}`, location: value(body, ['location', 'current_location', 'Shipment.Status.StatusLocation']), occurredAt });
  shipment.providerPayload = { ...(shipment.providerPayload || {}), webhookEventIds: [...seen, providerEventId].slice(-100), lastWebhookAt: new Date() };
  if (shipment.status === 'delivered') shipment.deliveredAt = occurredAt;
  await shipment.save();

  const orderStatus = ({ pickup_scheduled: 'pickup_scheduled', picked_up: 'picked_up', in_transit: 'in_transit', out_for_delivery: 'out_for_delivery', delivered: 'delivered', returned: 'returned', cancelled: 'cancelled' })[shipment.status];
  if (orderStatus) await Order.findByIdAndUpdate(shipment.orderId, { $set: { status: orderStatus, trackingNumber: shipment.trackingNumber }, $push: { timeline: { status: orderStatus, timestamp: occurredAt, note: `EsyGlob Shipping ${orderStatus.replaceAll('_', ' ')}` } } });
  return { accepted: true };
}
