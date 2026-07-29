export const DEFAULT_CURRENCY = 'INR';

// The frontend metadata file lives at the repository root and is intentionally
// not a backend runtime dependency: production VPS deployments commonly publish
// only /backend. Node's ICU currency list provides authoritative ISO-4217
// validation without filesystem coupling or a duplicated metadata table.
const isoCurrencies = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('currency')
  : [];

export const CURRENCY_CODES = Object.freeze([...new Set([
  DEFAULT_CURRENCY,
  ...isoCurrencies,
])].sort((left, right) => {
  if (left === DEFAULT_CURRENCY) return -1;
  if (right === DEFAULT_CURRENCY) return 1;
  return left.localeCompare(right);
}));

const supported = new Set(CURRENCY_CODES);

export function normalizeCurrency(value, { required = true } = {}) {
  const currency = String(value || '').trim().toUpperCase();
  if (!currency && !required) return undefined;
  if (!supported.has(currency)) {
    throw Object.assign(new Error('Unsupported currency'), { statusCode: 422 });
  }
  return currency;
}
