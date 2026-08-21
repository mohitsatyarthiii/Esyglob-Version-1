import axios from 'axios';

export class ServiceProviderAdapter {
  constructor(key, name, options = {}) {
    this.key = key;
    this.name = name;
    this.timeout = Number(options.timeout || process.env.SERVICE_PROVIDER_TIMEOUT_MS || 15000);
  }

  get configured() { return false; }
  get bookingConfigured() { return this.configured; }
  get pickupConfigured() { return false; }
  get capabilities() {
    return { services: ['shipping'], operations: ['rates', 'booking', 'tracking'] };
  }
  async search() { throw new Error(`${this.name} rate search is not implemented`); }
  async book() { throw new Error(`${this.name} booking is not implemented`); }
  async track() { throw new Error(`${this.name} tracking is not implemented`); }
  async health() {
    return {
      provider: this.key,
      name: this.name,
      status: this.configured ? 'connected' : 'not_configured',
      configured: this.configured,
      bookingConfigured: this.bookingConfigured,
      pickupConfigured: this.pickupConfigured,
    };
  }

  client(config = {}) {
    return axios.create({ timeout: this.timeout, ...config });
  }

  providerError(error, action) {
    const message = error.response?.data?.message
      || error.response?.data?.error?.message
      || error.response?.data?.error
      || error.message
      || `${this.name} ${action} failed`;
    const wrapped = new Error(`${this.name}: ${typeof message === 'string' ? message : `${action} failed`}`);
    wrapped.code = providerErrorCode(error, action);
    wrapped.provider = this.key;
    wrapped.statusCode = error.response?.status || 502;
    wrapped.publicMessage = `${this.name} is currently unavailable`;
    return wrapped;
  }
}

function providerErrorCode(error, action) {
  const status = Number(error.response?.status || 0);
  if (status === 401 || status === 403) return 'PROVIDER_AUTHENTICATION_FAILED';
  if (status === 429) return 'PROVIDER_RATE_LIMITED';
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) return 'PROVIDER_TIMEOUT';
  return `PROVIDER_${String(action || 'request').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_FAILED`;
}

export function futurePickupDate(input) {
  const date = input.pickupDate ? new Date(input.pickupDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function dimensions(shipment) {
  return {
    length: Number(shipment.lengthCm),
    width: Number(shipment.widthCm),
    height: Number(shipment.heightCm),
  };
}

export function normalizeTracking(status, fallback = 'pending') {
  const value = String(status || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (/rto.*deliver|return.*deliver/.test(value)) return 'rto_delivered';
  if (/rto.*transit|return.*transit/.test(value)) return 'rto_in_transit';
  if (/rto|return_to_origin/.test(value)) return 'rto_initiated';
  if (/deliver(ed|y_complete)|shipment_delivered/.test(value)) return 'delivered';
  if (/out.*delivery|ofd/.test(value)) return 'out_for_delivery';
  if (/attempt|consignee.*unavailable/.test(value)) return 'delivery_attempted';
  if (/delay/.test(value)) return 'delayed';
  if (/exception|undeliver|lost|damag|failed/.test(value)) return 'exception';
  if (/in.*transit|departed|arrived|hub|dispatched/.test(value)) return 'in_transit';
  if (/pickup|picked.*up|collected/.test(value)) return 'picked_up';
  if (/awb|label/.test(value)) return 'label_created';
  if (/book|manifest/.test(value)) return 'shipment_booked';
  if (/cancel/.test(value)) return 'cancelled';
  if (/ready/.test(value)) return 'ready_for_shipment';
  return fallback;
}
