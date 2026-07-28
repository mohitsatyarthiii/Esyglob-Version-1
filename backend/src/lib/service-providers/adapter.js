import axios from 'axios';

export class ServiceProviderAdapter {
  constructor(key, name, options = {}) {
    this.key = key;
    this.name = name;
    this.timeout = Number(options.timeout || process.env.SERVICE_PROVIDER_TIMEOUT_MS || 15000);
  }

  get configured() { return false; }
  get capabilities() {
    return { services: ['shipping'], operations: ['rates', 'booking', 'tracking'] };
  }
  async search() { throw new Error(`${this.name} rate search is not implemented`); }
  async book() { throw new Error(`${this.name} booking is not implemented`); }
  async track() { throw new Error(`${this.name} tracking is not implemented`); }

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
    wrapped.code = 'SERVICE_PROVIDER_ERROR';
    wrapped.provider = this.key;
    wrapped.statusCode = error.response?.status || 502;
    return wrapped;
  }
}

export function futurePickupDate(input) {
  const date = input.pickupDate ? new Date(input.pickupDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function dimensions(shipment) {
  return {
    length: Number(shipment.lengthCm || 10),
    width: Number(shipment.widthCm || 10),
    height: Number(shipment.heightCm || 10),
  };
}

export function normalizeTracking(status, fallback = 'in_transit') {
  const value = String(status || '').toLowerCase().replaceAll(' ', '_');
  if (/deliver(ed|y_complete)/.test(value)) return 'delivered';
  if (/out_for_delivery/.test(value)) return 'out_for_delivery';
  if (/pickup|picked_up|collected/.test(value)) return 'picked_up';
  if (/cancel/.test(value)) return 'cancelled';
  if (/fail|exception|undeliver/.test(value)) return 'failed';
  if (/book|manifest|confirm|ready/.test(value)) return 'confirmed';
  return fallback;
}
