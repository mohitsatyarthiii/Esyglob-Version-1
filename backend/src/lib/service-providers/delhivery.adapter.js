import { ServiceProviderAdapter, dimensions, futurePickupDate, normalizeTracking } from './adapter.js';

export class DelhiveryAdapter extends ServiceProviderAdapter {
  constructor() { super('delhivery', 'Delhivery'); this.baseURL = process.env.DELHIVERY_API_BASE_URL || 'https://track.delhivery.com'; }
  get configured() { return Boolean(process.env.DELHIVERY_API_TOKEN); }
  get pickupConfigured() { return Boolean(process.env.DELHIVERY_PICKUP_NAME); }
  get bookingConfigured() { return this.configured && this.pickupConfigured; }
  get capabilities() {
    return { services: ['domestic_shipping_india'], operations: ['rates', 'serviceability', 'booking', 'tracking', 'pickup'] };
  }
  api() { return this.client({ baseURL: this.baseURL, headers: { Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`, Accept: 'application/json' } }); }
  async health() {
    if (!this.configured) return super.health();
    const startedAt = Date.now();
    try {
      const origin = String(process.env.DELHIVERY_HEALTH_PINCODE || '110001').trim();
      const destination = String(process.env.DELHIVERY_HEALTH_DESTINATION_PINCODE || '400001').trim();
      const { data } = await this.api().get('/api/kinko/v1/invoice/charges/.json', { params: { md: 'S', ss: 'Delivered', o_pin: origin, d_pin: destination, cgm: 500 } });
      const connected = data !== undefined && data !== null && !data?.error;
      return { provider: this.key, name: this.name, status: connected ? 'connected' : 'failed', configured: true, bookingConfigured: this.bookingConfigured, pickupConnected: this.pickupConfigured, durationMs: Date.now() - startedAt, code: connected ? undefined : 'UNEXPECTED_HEALTH_RESPONSE' };
    } catch (error) {
      const wrapped = this.providerError(error, 'health check');
      return { provider: this.key, name: this.name, status: 'failed', configured: true, pickupConnected: false, durationMs: Date.now() - startedAt, code: wrapped.code };
    }
  }
  async findPickupLocation(_address, mapping = {}) {
    if (mapping.status === 'active' && mapping.locationName) return { locationName: mapping.locationName, locationId: mapping.locationId || '' };
    return null;
  }
  async registerPickup({ sellerId, address }) {
    if (!this.configured) throw Object.assign(new Error('Delhivery credentials are not configured'), { code: 'PROVIDER_NOT_CONFIGURED' });
    const name = `ESY${String(sellerId).slice(-8)}${String(address.postalCode).slice(-6)}`;
    const { data } = await this.api().post('/api/backend/clientwarehouse/create/', {
      name, registered_name: name, phone: address.phone, email: address.email,
      address: address.line1, city: address.city, state: address.state, pin: address.postalCode, country: address.country || 'India',
      return_address: address.line1, return_city: address.city, return_state: address.state,
      return_pin: address.postalCode, return_country: address.country || 'India',
    });
    if (data?.success === false || data?.error) throw Object.assign(new Error('Delhivery rejected the pickup warehouse'), { code: 'PROVIDER_PICKUP_REGISTRATION_FAILED' });
    return { locationName: name, locationId: String(data?.id || data?.warehouse_id || ''), metadata: { responseStatus: 'created' } };
  }
  async search(input, context = {}) {
    try {
      const { pickup, destination, shipment } = input;
      const api = this.api();
      const packageDimensions = dimensions(shipment);
      const volumetricWeightKg = (packageDimensions.length * packageDimensions.width * packageDimensions.height / 5000)
        * Math.max(1, Number(shipment.packageCount || 1));
      const chargeableWeightGrams = Math.ceil(Math.max(Number(shipment.weightKg), volumetricWeightKg) * 1000);
      const [originPinResponse, destinationPinResponse, ...rateResponses] = await Promise.all([
        api.get('/c/api/pin-codes/json/', { params: { filter_codes: pickup.postalCode } }),
        api.get('/c/api/pin-codes/json/', { params: { filter_codes: destination.postalCode } }),
        ...['E', 'S'].map(mode => api.get('/api/kinko/v1/invoice/charges/.json', { params: { md: mode, ss: 'Delivered', pt: 'Pre-paid', d_pin: destination.postalCode, o_pin: pickup.postalCode, cgm: chargeableWeightGrams } }).then(response => ({ mode, data: response.data })).catch(error => ({ mode, error }))),
      ]);
      const originPostal = originPinResponse.data.delivery_codes?.[0]?.postal_code;
      const destinationPostal = destinationPinResponse.data.delivery_codes?.[0]?.postal_code;
      const serviceable = originPostal && destinationPostal
        && originPostal.pickup !== 'N'
        && destinationPostal.pre_paid !== 'N';
      if (!serviceable) return [];
      if (rateResponses.every(result => result.error)) throw rateResponses[0].error;
      const mappedPickup = context.requireSellerMapping ? String(context.pickupMapping?.name || '') : process.env.DELHIVERY_PICKUP_NAME;
      return rateResponses.flatMap(({ mode, data }) => {
        const rates = Array.isArray(data) ? data : [data];
        return rates.map(rate => ({
        providerKey: this.key, providerName: this.name,
        serviceCode: `DELHIVERY_${mode === 'E' ? 'EXPRESS' : 'SURFACE'}`,
        serviceName: mode === 'E' ? 'Delhivery Express' : 'Delhivery Surface',
        serviceType: mode === 'E' ? 'Express' : 'Surface',
        currency: 'INR', amount: Number(rate?.total_amount || rate?.gross_amount || rate?.charge || 0),
        estimatedDeliveryAt: null,
        estimatedDeliveryText: destinationPostal?.estimated_delivery_days ? `${destinationPostal.estimated_delivery_days} days` : '',
        trackingAvailable: true, insuranceAvailable: Boolean(rate?.insurance), pickupAvailable: true,
        pickupLocation: mappedPickup,
        bookingAvailable: Boolean(mappedPickup && shipment.hsCode && shipment.sellerGstNumber),
        bookingUnavailableReason: !mappedPickup
          ? 'Seller pickup location is not mapped with Delhivery.'
          : !shipment.hsCode
            ? 'The seller must add the product HSN code before Delhivery booking can be selected.'
            : !shipment.sellerGstNumber
              ? 'The seller must add a GST number before Delhivery booking can be selected.'
              : '',
        deliveryType: mode === 'E' ? 'Express' : 'Surface',
        features: ['Shipment tracking', 'Courier pickup', rate?.insurance && 'Insurance available'].filter(Boolean),
        providerPayload: { serviceType: mode, pickupName: mappedPickup, pickupMappingId: context.pickupMapping?.mappingId },
      })).filter(item => item.amount > 0);
      });
    } catch (error) { throw this.providerError(error, 'serviceability search'); }
  }
  async book({ quote, booking }) {
    try {
      if (!this.configured || !quote.providerPayload?.pickupName) throw Object.assign(new Error('Delhivery pickup location is not mapped for booking'), { code: 'PROVIDER_PICKUP_NOT_CONFIGURED' });
      const { pickup, destination, shipment } = quote.requestSnapshot;
      if (!shipment.hsCode || !shipment.sellerGstNumber) throw Object.assign(new Error('Delhivery manifestation requires seller GST and product HSN details'), { code: 'PROVIDER_MANDATORY_SHIPMENT_DATA_MISSING' });
      const waybillResponse = await this.api().get('/waybill/api/bulk/json/', { params: { count: 1 } });
      const waybill = String(waybillResponse.data).split(',')[0].trim();
      const payload = {
        shipments: [{
          name: destination.contactName, add: [destination.line1, destination.line2].filter(Boolean).join(', '),
          pin: destination.postalCode, city: destination.city, state: destination.state, country: destination.country,
          phone: destination.phone, order: booking.bookingNumber, payment_mode: 'Prepaid',
          products_desc: shipment.description, total_amount: shipment.declaredValue,
          hsn_code: shipment.hsCode, seller_gst_tin: shipment.sellerGstNumber,
          quantity: shipment.quantity, weight: Math.ceil(shipment.weightKg * 1000),
          shipment_width: dimensions(shipment).width, shipment_height: dimensions(shipment).height,
          shipment_length: dimensions(shipment).length, waybill, shipping_mode: quote.providerPayload?.serviceType || 'Surface',
          pickup_date: futurePickupDate(quote.requestSnapshot),
        }],
        pickup_location: { name: quote.providerPayload?.pickupName || process.env.DELHIVERY_PICKUP_NAME },
      };
      const body = new URLSearchParams({ format: 'json', data: JSON.stringify(payload) });
      const { data } = await this.api().post('/api/cmu/create.json', body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (data.success === false) throw new Error(data.rmk || 'Delhivery rejected the shipment');
      const trackingNumber = data.packages?.[0]?.waybill || waybill;
      if (!trackingNumber) throw new Error('Delhivery did not confirm a waybill');
      let pickupResult = null; let pickupError = null;
      try { pickupResult = await this.schedulePickup({ quote, packageCount: Math.max(1, Number(shipment.packageCount || 1)) }); }
      catch (error) { pickupError = { code: error.code || 'PICKUP_REQUEST_FAILED', message: 'Pickup scheduling is pending' }; }
      return { providerReference: data.packages?.[0]?.refnum || booking.bookingNumber, providerShipmentId: trackingNumber, pickupRequestId: pickupResult?.pickupRequestId || '', trackingNumber, trackingUrl: `https://www.delhivery.com/track/package/${trackingNumber}`, status: pickupResult ? 'pickup_scheduled' : 'confirmed', providerPayload: { manifestation: data, pickup: pickupResult?.providerPayload, pickupError } };
    } catch (error) { throw this.providerError(error, 'booking'); }
  }
  async schedulePickup({ quote, packageCount = 1 }) {
    const pickupLocation = quote.providerPayload?.pickupName;
    if (!pickupLocation) throw Object.assign(new Error('Delhivery pickup location is missing'), { code: 'PROVIDER_PICKUP_NOT_CONFIGURED' });
    const pickupDate = futurePickupDate(quote.requestSnapshot);
    const { data } = await this.api().post('/fm/request/new/', {
      pickup_date: pickupDate, pickup_time: '14:00:00', pickup_location: pickupLocation,
      expected_package_count: Math.max(1, Number(packageCount || quote.requestSnapshot?.shipment?.packageCount || 1)),
    });
    return { pickupRequestId: String(data?.pickup_id || data?.request_id || data?.pr_exist || `${pickupLocation}:${pickupDate}`), providerPayload: data };
  }
  async track(trackingNumber) {
    try {
      const { data } = await this.api().get('/api/v1/packages/json/', { params: { waybill: trackingNumber, verbose: 2 } });
      const shipment = data.ShipmentData?.[0]?.Shipment || {};
      const providerStatus = shipment.Status?.Status || shipment.Status?.StatusType;
      return { status: normalizeTracking(providerStatus), providerStatus, currentLocation: shipment.Status?.StatusLocation, eta: shipment.ExpectedDeliveryDate || null, events: (shipment.Scans || []).map(item => ({ status: normalizeTracking(item.ScanDetail?.Scan), providerStatus: item.ScanDetail?.Scan, message: item.ScanDetail?.Instructions || item.ScanDetail?.Scan, location: item.ScanDetail?.ScannedLocation, occurredAt: item.ScanDetail?.ScanDateTime, providerPayload: item.ScanDetail })), providerPayload: data };
    } catch (error) { throw this.providerError(error, 'tracking'); }
  }
}
