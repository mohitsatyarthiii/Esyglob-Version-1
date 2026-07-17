const PROVIDERS = Object.freeze({
  shipping: ['shiprocket', 'dhl', 'fedex', 'delhivery'],
  verification: ['digilocker', 'setu', 'signzy'],
  financing: ['drip_capital', 'credlix', 'credable', 'veefin', 'modifi'],
  insurance: ['icici_lombard', 'tata_aig', 'bajaj_allianz', 'allianz_trade', 'coface'],
});

const adapters = new Map();

export class ProviderAdapter {
  constructor({ type, key, capabilities = [] }) {
    if (!PROVIDERS[type]?.includes(key)) throw new Error(`Unsupported ${type} provider: ${key}`);
    this.type = type;
    this.key = key;
    this.capabilities = capabilities;
  }
  get configured() { return Boolean(process.env[`${this.key.toUpperCase()}_API_KEY`]); }
  async quote() { throw new Error(`${this.key} quote integration is not configured`); }
  async book() { throw new Error(`${this.key} booking integration is not configured`); }
  async status() { throw new Error(`${this.key} status integration is not configured`); }
  async cancel() { throw new Error(`${this.key} cancellation integration is not configured`); }
}

export function registerProvider(adapter) {
  if (!(adapter instanceof ProviderAdapter)) throw new TypeError('Provider adapter must extend ProviderAdapter');
  adapters.set(`${adapter.type}:${adapter.key}`, adapter);
  return adapter;
}

export function getProvider(type, key) {
  const adapter = adapters.get(`${type}:${key}`);
  if (!adapter) throw new Error(`${type} provider ${key} is not registered`);
  return adapter;
}

export function listProviderCapabilities(type) {
  return (PROVIDERS[type] || []).map(key => {
    const adapter = adapters.get(`${type}:${key}`);
    return { type, key, configured: Boolean(adapter?.configured), capabilities: adapter?.capabilities || [] };
  });
}

export const SUPPORTED_PROVIDER_KEYS = PROVIDERS;
