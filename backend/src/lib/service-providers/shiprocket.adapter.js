import { ServiceProviderAdapter, dimensions, futurePickupDate, normalizeTracking } from './adapter.js';

let tokenCache;
function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickupLocations(data) {
  return data?.data?.shipping_address || data?.shipping_address || [];
}

function pickupNameForPostalCode(locations, postalCode) {
  const target = String(postalCode || '').trim();
  const match = locations.find(item => String(item.pin_code || item.pincode || item.postal_code || '').trim() === target);
  return String(match?.pickup_location || match?.name || '').trim();
}

function pickupRecordForPostalCode(locations, postalCode, preferredName = '') {
  const target = String(postalCode || '').trim();
  const candidates = locations.filter(item => String(item.pin_code || item.pincode || item.postal_code || '').trim() === target);
  const preferred = String(preferredName || '').trim().toLowerCase();
  return candidates.find(item => String(item.pickup_location || item.name || '').trim().toLowerCase() === preferred) || candidates[0];
}

export class ShiprocketAdapter extends ServiceProviderAdapter {
  constructor() { super('shiprocket', 'Shiprocket'); this.baseURL = process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in/v1/external'; }
  get configured() { return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD); }
  get pickupConfigured() { return Boolean(process.env.SHIPROCKET_PICKUP_LOCATION); }
  get bookingConfigured() { return this.configured && this.pickupConfigured; }
  get capabilities() {
    return { services: ['domestic_shipping_india'], operations: ['rates', 'serviceability', 'booking', 'tracking', 'pickup'] };
  }
  async token() {
    if (tokenCache?.expiresAt > Date.now() + 60000) return tokenCache.value;
    const { data } = await this.client({ baseURL: this.baseURL }).post('/auth/login', { email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD });
    if (!data?.token) throw Object.assign(new Error('Shiprocket authentication did not return a token'), { code: 'PROVIDER_AUTHENTICATION_FAILED' });
    tokenCache = { value: data.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
    return tokenCache.value;
  }
  async api() { return this.client({ baseURL: this.baseURL, headers: { Authorization: `Bearer ${await this.token()}` } }); }
  async health() {
    if (!this.configured) return super.health();
    const startedAt = Date.now();
    try {
      const api = await this.api();
      const { data } = await api.get('/settings/company/pickup');
      const locations = pickupLocations(data);
      const pickupName = String(process.env.SHIPROCKET_PICKUP_LOCATION || '').trim().toLowerCase();
      const pickupConnected = Boolean(pickupName) && locations.some(item => String(item.pickup_location || item.name || '').trim().toLowerCase() === pickupName);
      return { provider: this.key, name: this.name, status: 'connected', configured: true, bookingConfigured: pickupConnected, pickupConnected, durationMs: Date.now() - startedAt, code: pickupName && !pickupConnected ? 'PICKUP_LOCATION_NOT_FOUND' : undefined };
    } catch (error) {
      const wrapped = this.providerError(error, 'health check');
      return { provider: this.key, name: this.name, status: 'failed', configured: true, pickupConnected: false, durationMs: Date.now() - startedAt, code: wrapped.code };
    }
  }
  async findPickupLocation(address, mapping = {}) {
    if (!this.configured) return null;
    const api = await this.api();
    const { data } = await api.get('/settings/company/pickup');
    const match = pickupRecordForPostalCode(pickupLocations(data), address.postalCode, mapping.locationName);
    if (!match) return null;
    return {
      locationName: String(match.pickup_location || match.name || '').trim(),
      locationId: String(match.id || match.pickup_location_id || ''),
      metadata: { postalCode: String(match.pin_code || match.pincode || match.postal_code || '') },
    };
  }
  async registerPickup({ sellerId, address }) {
    if (!this.configured) throw Object.assign(new Error('Shiprocket credentials are not configured'), { code: 'PROVIDER_NOT_CONFIGURED' });
    const pickupLocation = `ESY${String(sellerId).slice(-8)}${String(address.postalCode).slice(-6)}`.slice(0, 36);
    const api = await this.api();
    const { data } = await api.post('/settings/company/addpickup', {
      pickup_location: pickupLocation,
      name: address.contactName,
      email: address.email,
      phone: address.phone,
      address: address.line1,
      address_2: address.line2 || '',
      city: address.city,
      state: address.state,
      country: address.country || 'India',
      pin_code: Number(address.postalCode),
    });
    if (data?.success === false || data?.status_code >= 400) throw Object.assign(new Error('Shiprocket rejected the pickup location'), { code: 'PROVIDER_PICKUP_REGISTRATION_FAILED' });
    return { locationName: pickupLocation, locationId: String(data?.pickup_id || data?.id || ''), metadata: { responseStatus: data?.status_code || 200 } };
  }
  async search(input, context = {}) {
    try {
      const { pickup, destination, shipment } = input;
      const api = await this.api();
      const [{ data }, locationsResponse] = await Promise.all([
        api.get('/courier/serviceability/', { params: {
          pickup_postcode: pickup.postalCode,
          delivery_postcode: destination.postalCode,
          weight: shipment.weightKg,
          length: dimensions(shipment).length,
          breadth: dimensions(shipment).width,
          height: dimensions(shipment).height,
          cod: 0,
          declared_value: shipment.declaredValue,
          is_return: 0,
        } }),
        api.get('/settings/company/pickup').catch(() => ({ data: {} })),
      ]);
      const pickupLocation = context.requireSellerMapping
        ? String(context.pickupMapping?.name || '')
        : pickupNameForPostalCode(pickupLocations(locationsResponse.data), pickup.postalCode);
      return (data.data?.available_courier_companies || []).map(courier => ({
        providerKey: this.key, providerName: this.name,
        serviceCode: String(courier.courier_company_id || courier.id),
        serviceName: courier.courier_name || 'Shiprocket Courier',
        serviceType: courier.mode || (courier.is_surface ? 'Surface' : 'Courier'),
        currency: 'INR', amount: Number(courier.rate || courier.freight_charge || 0),
        estimatedDeliveryAt: validDate(courier.etd),
        estimatedDeliveryText: courier.estimated_delivery_days ? `${courier.estimated_delivery_days} days` : courier.etd,
        trackingAvailable: courier.tracking_performance !== 0,
        insuranceAvailable: Boolean(courier.coverage_charges || courier.insurance),
        // Shiprocket already returns this collection as available couriers. Its
        // pickup_availability field can be the string "0" even for priced,
        // serviceable prepaid couriers, so it must not discard those rates.
        pickupAvailable: true,
        bookingAvailable: Boolean(pickupLocation),
        pickupLocation,
        deliveryType: courier.mode || (courier.is_surface ? 'Surface' : 'Standard'),
        features: ['Shipment tracking', 'Courier pickup', courier.insurance && 'Insurance available'].filter(Boolean),
        providerPayload: { courierCompanyId: courier.courier_company_id, courierName: courier.courier_name, pickupLocation, pickupAvailability: courier.pickup_availability },
      })).filter(item => item.amount > 0);
    } catch (error) { throw this.providerError(error, 'serviceability search'); }
  }
  async book({ quote, booking }) {
    try {
      const pickupLocation = String(quote.providerPayload?.pickupLocation || '').trim();
      if (!this.configured || !pickupLocation) throw Object.assign(new Error('Shiprocket pickup location is not mapped for this seller origin'), { code: 'PROVIDER_PICKUP_NOT_CONFIGURED' });
      const { pickup, destination, shipment } = quote.requestSnapshot;
      const api = await this.api();
      const { data: order } = await api.post('/orders/create/adhoc', {
        order_id: booking.bookingNumber,
        order_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        pickup_location: pickupLocation,
        billing_customer_name: destination.contactName,
        billing_address: destination.line1,
        billing_address_2: destination.line2,
        billing_city: destination.city,
        billing_pincode: destination.postalCode,
        billing_state: destination.state,
        billing_country: destination.country,
        billing_email: destination.email,
        billing_phone: destination.phone,
        shipping_is_billing: true,
        order_items: [{ name: shipment.description, sku: booking.bookingNumber, units: shipment.quantity, selling_price: Math.max(1, shipment.declaredValue / shipment.quantity) }],
        payment_method: 'Prepaid',
        sub_total: shipment.declaredValue,
        length: dimensions(shipment).length,
        breadth: dimensions(shipment).width,
        height: dimensions(shipment).height,
        weight: shipment.weightKg,
      });
      const shipmentId = order.shipment_id;
      const { data: assign } = await api.post('/courier/assign/awb', { shipment_id: shipmentId, courier_id: Number(quote.serviceCode) });
      const response = assign.response?.data || assign;
      if (!shipmentId || !response.awb_code) throw new Error('Shiprocket did not confirm an AWB for the selected courier');
      let pickupResult = null; let pickupError = null;
      try { pickupResult = (await api.post('/courier/generate/pickup', { shipment_id: [shipmentId] })).data; }
      catch (error) { pickupError = { code: error.code || 'PICKUP_REQUEST_FAILED', message: 'Pickup scheduling is pending' }; }
      const pickupRequestId = pickupResult?.pickup_status || pickupResult?.response?.pickup_token_number || pickupResult?.pickup_token_number || '';
      return { providerReference: String(order.order_id || shipmentId), providerShipmentId: String(shipmentId), pickupRequestId: String(pickupRequestId), trackingNumber: response.awb_code, trackingUrl: response.awb_code ? `https://shiprocket.co/tracking/${response.awb_code}` : '', status: pickupResult ? 'pickup_scheduled' : 'confirmed', providerPayload: { order, assign, pickup: pickupResult, pickupError } };
    } catch (error) { throw this.providerError(error, 'booking'); }
  }
  async schedulePickup({ shipment }) {
    if (!shipment.providerShipmentId) throw Object.assign(new Error('Shiprocket shipment ID is missing'), { code: 'PROVIDER_SHIPMENT_ID_MISSING' });
    const { data } = await (await this.api()).post('/courier/generate/pickup', { shipment_id: [Number(shipment.providerShipmentId)] });
    return { pickupRequestId: String(data?.pickup_status || data?.response?.pickup_token_number || data?.pickup_token_number || ''), providerPayload: data };
  }
  async track(trackingNumber) {
    try {
      const api = await this.api();
      const { data } = await api.get(`/courier/track/awb/${encodeURIComponent(trackingNumber)}`);
      const tracking = data.tracking_data || data;
      return { status: normalizeTracking(tracking.shipment_status || tracking.track_status), eta: tracking.etd || null, events: (tracking.shipment_track_activities || []).map(event => ({ status: normalizeTracking(event['sr-status-label'] || event.activity), message: event.activity, location: event.location, occurredAt: event.date })), providerPayload: data };
    } catch (error) { throw this.providerError(error, 'tracking'); }
  }
}
