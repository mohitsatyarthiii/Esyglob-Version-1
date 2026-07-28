import { ServiceProviderAdapter, dimensions, futurePickupDate, normalizeTracking } from './adapter.js';

export class DelhiveryAdapter extends ServiceProviderAdapter {
  constructor() { super('delhivery', 'Delhivery'); this.baseURL = process.env.DELHIVERY_API_BASE_URL || 'https://track.delhivery.com'; }
  get configured() { return Boolean(process.env.DELHIVERY_API_TOKEN && process.env.DELHIVERY_PICKUP_NAME); }
  get capabilities() {
    return { services: ['domestic_shipping_india'], operations: ['rates', 'serviceability', 'booking', 'tracking', 'pickup'] };
  }
  api() { return this.client({ baseURL: this.baseURL, headers: { Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`, Accept: 'application/json' } }); }
  async search(input) {
    try {
      const { pickup, destination, shipment } = input;
      const api = this.api();
      const [originPinResponse, destinationPinResponse, rateResponse] = await Promise.all([
        api.get('/c/api/pin-codes/json/', { params: { filter_codes: pickup.postalCode } }),
        api.get('/c/api/pin-codes/json/', { params: { filter_codes: destination.postalCode } }),
        api.get('/api/kinko/v1/invoice/charges/.json', { params: { md: 'S', ss: 'Delivered', d_pin: destination.postalCode, o_pin: pickup.postalCode, cgm: Math.ceil(shipment.weightKg * 1000) } }),
      ]);
      const originPostal = originPinResponse.data.delivery_codes?.[0]?.postal_code;
      const destinationPostal = destinationPinResponse.data.delivery_codes?.[0]?.postal_code;
      const serviceable = originPostal && destinationPostal
        && originPostal.pickup !== 'N'
        && destinationPostal.pre_paid !== 'N';
      const rate = Array.isArray(rateResponse.data) ? rateResponse.data[0] : rateResponse.data;
      const amount = Number(rate?.total_amount || rate?.gross_amount || rate?.charge || 0);
      if (!serviceable || amount <= 0) return [];
      return [{
        providerKey: this.key, providerName: this.name,
        serviceCode: String(rate?.service_type || 'DELHIVERY_SURFACE'),
        serviceName: rate?.service_type === 'E' ? 'Delhivery Express' : 'Delhivery Surface',
        currency: 'INR', amount,
        estimatedDeliveryAt: null,
        estimatedDeliveryText: destinationPostal?.estimated_delivery_days ? `${destinationPostal.estimated_delivery_days} days` : 'ETA after booking',
        trackingAvailable: true, insuranceAvailable: Boolean(rate?.insurance), pickupAvailable: true,
        features: ['Shipment tracking', 'Courier pickup', rate?.insurance && 'Insurance available'].filter(Boolean),
        providerPayload: { serviceType: rate?.service_type || 'S' },
      }];
    } catch (error) { throw this.providerError(error, 'serviceability search'); }
  }
  async book({ quote, booking }) {
    try {
      const { pickup, destination, shipment } = quote.requestSnapshot;
      const waybillResponse = await this.api().get('/waybill/api/bulk/json/', { params: { count: 1 } });
      const waybill = String(waybillResponse.data).split(',')[0].trim();
      const payload = {
        shipments: [{
          name: destination.contactName, add: [destination.line1, destination.line2].filter(Boolean).join(', '),
          pin: destination.postalCode, city: destination.city, state: destination.state, country: destination.country,
          phone: destination.phone, order: booking.bookingNumber, payment_mode: 'Prepaid',
          products_desc: shipment.description, total_amount: shipment.declaredValue,
          quantity: shipment.quantity, weight: Math.ceil(shipment.weightKg * 1000),
          shipment_width: dimensions(shipment).width, shipment_height: dimensions(shipment).height,
          shipment_length: dimensions(shipment).length, waybill, shipping_mode: quote.providerPayload?.serviceType || 'Surface',
          pickup_date: futurePickupDate(quote.requestSnapshot),
        }],
        pickup_location: { name: process.env.DELHIVERY_PICKUP_NAME, add: pickup.line1, city: pickup.city, pin_code: pickup.postalCode, country: pickup.country, phone: pickup.phone },
      };
      const body = new URLSearchParams({ format: 'json', data: JSON.stringify(payload) });
      const { data } = await this.api().post('/api/cmu/create.json', body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (data.success === false) throw new Error(data.rmk || 'Delhivery rejected the shipment');
      return { providerReference: data.packages?.[0]?.refnum || booking.bookingNumber, trackingNumber: data.packages?.[0]?.waybill || waybill, trackingUrl: `https://www.delhivery.com/track/package/${waybill}`, status: 'confirmed', providerPayload: data };
    } catch (error) { throw this.providerError(error, 'booking'); }
  }
  async track(trackingNumber) {
    try {
      const { data } = await this.api().get('/api/v1/packages/json/', { params: { waybill: trackingNumber, verbose: 2 } });
      const shipment = data.ShipmentData?.[0]?.Shipment || {};
      return { status: normalizeTracking(shipment.Status?.Status || shipment.Status?.StatusType), eta: shipment.ExpectedDeliveryDate || null, events: (shipment.Scans || []).map(item => ({ status: normalizeTracking(item.ScanDetail?.Scan), message: item.ScanDetail?.Instructions || item.ScanDetail?.Scan, location: item.ScanDetail?.ScannedLocation, occurredAt: item.ScanDetail?.ScanDateTime })), providerPayload: data };
    } catch (error) { throw this.providerError(error, 'tracking'); }
  }
}
