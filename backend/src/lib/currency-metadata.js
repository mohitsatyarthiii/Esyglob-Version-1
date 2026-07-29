import { readFileSync } from 'node:fs';

const metadata = JSON.parse(
  readFileSync(new URL('../../../shared/currency-metadata.json', import.meta.url), 'utf8')
);

export const DEFAULT_CURRENCY = 'INR';
export const CURRENCY_METADATA = Object.freeze(metadata.map(item => Object.freeze(item)));
export const CURRENCY_CODES = Object.freeze(CURRENCY_METADATA.map(item => item.code));
const supported = new Set(CURRENCY_CODES);

export function normalizeCurrency(value, { required = true } = {}) {
  const currency = String(value || '').trim().toUpperCase();
  if (!currency && !required) return undefined;
  if (!supported.has(currency)) {
    throw Object.assign(new Error('Unsupported currency'), { statusCode: 422 });
  }
  return currency;
}
