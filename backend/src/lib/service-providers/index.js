import { DelhiveryAdapter } from './delhivery.adapter.js';
import { DhlAdapter } from './dhl.adapter.js';
import { FedexAdapter } from './fedex.adapter.js';
import { ShiprocketAdapter } from './shiprocket.adapter.js';

const adapters = new Map([
  ['dhl', new DhlAdapter()],
  ['fedex', new FedexAdapter()],
  ['shiprocket', new ShiprocketAdapter()],
  ['delhivery', new DelhiveryAdapter()],
]);

export function getServiceProvider(key) {
  const adapter = adapters.get(String(key || '').toLowerCase());
  if (!adapter) throw Object.assign(new Error(`Unsupported service provider: ${key}`), { statusCode: 422 });
  return adapter;
}

export function providersForRoute(routeType) {
  const keys = routeType === 'domestic' ? ['shiprocket', 'delhivery'] : ['dhl', 'fedex'];
  return keys.map(getServiceProvider).filter(adapter => adapter.configured);
}

export function serviceProviderCapabilities() {
  return [...adapters.values()].map(adapter => ({
    key: adapter.key,
    name: adapter.name,
    configured: adapter.configured,
    ...adapter.capabilities,
  }));
}

let healthCache;
export async function serviceProviderHealth({ refresh = false } = {}) {
  if (!refresh && healthCache?.expiresAt > Date.now()) return healthCache.value;
  const value = await Promise.all([...adapters.values()].map(adapter => adapter.health()));
  healthCache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}
