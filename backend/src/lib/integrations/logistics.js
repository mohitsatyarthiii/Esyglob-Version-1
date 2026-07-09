import CommerceSettings from '../../models/CommerceSettings.js';

const supportedProviders = new Set([
  'dhl', 'fedex', 'ups', 'shiprocket', 'delhivery', 'manual',
]);

function providerEnvironmentKey(provider) {
  return `${provider.toUpperCase()}_API_KEY`;
}

export function getLogisticsProvider(provider) {
  if (!supportedProviders.has(provider)) {
    throw new Error(`Unsupported logistics provider: ${provider}`);
  }

  const apiKey = process.env[providerEnvironmentKey(provider)];

  return {
    name: provider,
    configured: Boolean(apiKey),
    async createShipment() {
      if (!apiKey) {
        throw new Error(`${provider} integration is not configured`);
      }
      throw new Error(`${provider} shipment adapter has not been enabled`);
    },
    async getTracking() {
      if (!apiKey) {
        throw new Error(`${provider} integration is not configured`);
      }
      throw new Error(`${provider} tracking adapter has not been enabled`);
    },
    async getRates() {
      if (!apiKey) {
        throw new Error(`${provider} integration is not configured`);
      }
      throw new Error(`${provider} rate adapter has not been enabled`);
    },
  };
}

export async function getConfiguredLogisticsProviders() {
  const settings = await CommerceSettings.findOne({ key: 'default' }).lean();
  const configured = (settings?.providers || [])
    .filter(
      (provider) =>
        provider.type === 'logistics' && provider.status !== 'inactive'
    )
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));

  if (configured.length) return configured;

  return [...supportedProviders].map((provider, index) => ({
    type: 'logistics',
    key: provider,
    label: provider === 'manual' ? 'Manual Logistics Desk' : provider.toUpperCase(),
    status: provider === 'manual' ? 'active' : 'inactive',
    priority: index + 1,
    timeoutMs: 15000,
    retryCount: 2,
  }));
}

export async function getLogisticsCapabilities() {
  const configured = await getConfiguredLogisticsProviders();
  return configured.map((entry) => ({
    provider: entry.key,
    label: entry.label,
    status: entry.status,
    priority: entry.priority,
    configured:
      entry.key === 'manual' ||
      Boolean(
        process.env[providerEnvironmentKey(entry.key)] || entry.config?.apiKey
      ),
  }));
}

export async function getNormalizedLogisticsRates({
  rules = [],
  origin = {},
  destination = {},
  productTotal = 0,
} = {}) {
  const providers = await getConfiguredLogisticsProviders();
  const providerMap = new Map(
    providers.map((provider) => [provider.key, provider])
  );

  return rules.map((rule) => {
    const provider =
      providerMap.get(rule.providerKey || 'manual') || providerMap.get('manual');
    return {
      key: rule.key,
      label: rule.label,
      mode: rule.mode,
      incoterm: rule.incoterm,
      eta: rule.eta,
      providerKey: provider?.key || rule.providerKey || 'manual',
      providerLabel:
        provider?.label || rule.providerKey || 'Manual Logistics Desk',
      originCountry: origin?.country || '',
      destinationCountry: destination?.country || '',
      available: provider?.status !== 'inactive',
      priority: provider?.priority || 100,
      productTotal,
    };
  });
}

export function getStaticLogisticsCapabilities() {
  return [...supportedProviders].map((provider) => ({
    provider,
    configured: Boolean(process.env[providerEnvironmentKey(provider)]),
  }));
}