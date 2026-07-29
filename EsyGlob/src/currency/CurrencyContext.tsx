import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import currencyMetadata from '../../../shared/currency-metadata.json';
import { appStorage, readJson, writeJson } from '../storage/appStorage';
import { fetchProfileSettings, updatePreferredCurrency } from '../api/account';
import { useAuth } from '../auth/AuthContext';

export type CurrencyMetadata = {
  code: string; name: string; symbol: string; flagCountryCode: string;
  locale: string; fractionDigits: number; flag: string;
};
export type CurrencyCode = string;
export const DEFAULT_CURRENCY: CurrencyCode = 'INR';
export const flagEmoji = (countryCode: string) =>
  String(countryCode || '').toUpperCase().replace(/[A-Z]/g, letter =>
    String.fromCodePoint(127397 + letter.charCodeAt(0)));
export const CURRENCY_OPTIONS: readonly CurrencyMetadata[] = Object.freeze(
  currencyMetadata.map(item => Object.freeze({ ...item, flag: flagEmoji(item.flagCountryCode) })),
);
export const CURRENCIES: readonly CurrencyCode[] = Object.freeze(CURRENCY_OPTIONS.map(item => item.code));
export const CURRENCY_META: Readonly<Record<string, CurrencyMetadata>> = Object.freeze(
  Object.fromEntries(CURRENCY_OPTIONS.map(item => [item.code, item])),
);
export const currencyLabel = (value: string | CurrencyMetadata) => {
  const item = typeof value === 'string' ? CURRENCY_META[value] : value;
  return item ? `${item.flag} ${item.name} (${item.code})` : '';
};

type Rates = Record<string, number>;
type RateCache = { fetchedAt: number; rates: Rates };
const CURRENCY_KEY = 'preferences.currency';
const RATES_KEY = 'currency.rates.v2';
const HOUR = 60 * 60_000;
const RATE_URL = 'https://open.er-api.com/v6/latest/INR';
const fallbackRates: Rates = { INR: 1 };
type ContextValue = {
  selectedCurrency: CurrencyCode; currencyCode: CurrencyCode; currencySymbol: string;
  currency: CurrencyMetadata; currencies: readonly CurrencyMetadata[];
  exchangeRate: number; exchangeRates: Rates; lastUpdatedAt: number | null;
  isLoading: boolean; error: string | null;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
  updateCurrency: (currency: CurrencyCode) => Promise<void>;
  refreshRates: (force?: boolean) => Promise<void>;
  convertPrice: (amount: number, fromCurrency?: string) => number;
  formatPrice: (amount: number, currency?: string) => string;
};
const fallbackCurrency = CURRENCY_META[DEFAULT_CURRENCY];
const fallback: ContextValue = {
  selectedCurrency: DEFAULT_CURRENCY, currencyCode: DEFAULT_CURRENCY,
  currencySymbol: fallbackCurrency.symbol, currency: fallbackCurrency, currencies: CURRENCY_OPTIONS,
  exchangeRate: 1, exchangeRates: fallbackRates, lastUpdatedAt: null, isLoading: false, error: null,
  setCurrency: async () => undefined, updateCurrency: async () => undefined,
  refreshRates: async () => undefined, convertPrice: amount => Number(amount || 0),
  formatPrice: amount => `₹${Number(amount || 0).toLocaleString('en-IN')}`,
};
const CurrencyContext = createContext<ContextValue>(fallback);

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [cached] = useState(() => readJson<RateCache>(RATES_KEY));
  const [selectedCurrency, setSelected] = useState<CurrencyCode>(() => {
    const stored = String(appStorage.getString(CURRENCY_KEY) || '').toUpperCase();
    return CURRENCIES.includes(stored) ? stored : DEFAULT_CURRENCY;
  });
  const [exchangeRates, setRates] = useState<Rates>(cached?.rates ?? fallbackRates);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(cached?.fetchedAt ?? null);
  const [isLoading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const fetchedAt = useRef(cached?.fetchedAt ?? 0);
  const refreshRates = useCallback(async (force = false) => {
    if (!force && Date.now() - fetchedAt.current < HOUR) return;
    setLoading(true); setError(null);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(RATE_URL);
        if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}`);
        const payload = await response.json() as { rates?: Rates };
        if (!payload.rates || typeof payload.rates !== 'object') throw new Error('Invalid exchange-rate response');
        const rates = { INR: 1, ...payload.rates };
        fetchedAt.current = Date.now(); setLastUpdatedAt(fetchedAt.current); setRates(rates);
        writeJson(RATES_KEY, { fetchedAt: fetchedAt.current, rates }); setLoading(false); return;
      } catch (requestError) { lastError = requestError; }
    }
    setError(lastError instanceof Error ? lastError.message : 'Exchange rates unavailable');
    setLoading(false);
  }, []);
  useEffect(() => { refreshRates().catch(() => undefined); }, [refreshRates]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshRates().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshRates]);
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchProfileSettings().then(profile => {
      const preferred = String(profile.preferredCurrency ?? '').toUpperCase();
      if (CURRENCIES.includes(preferred)) { setSelected(preferred); appStorage.set(CURRENCY_KEY, preferred); }
    }).catch(() => undefined);
  }, [status]);
  const setCurrency = useCallback(async (currency: CurrencyCode) => {
    const preferred = String(currency || '').toUpperCase();
    if (!CURRENCIES.includes(preferred)) return;
    setSelected(preferred); appStorage.set(CURRENCY_KEY, preferred);
    if (status === 'authenticated') await updatePreferredCurrency(preferred).catch(() => undefined);
  }, [status]);
  const convertPrice = useCallback((amount: number, fromCurrency = DEFAULT_CURRENCY) => {
    const source = exchangeRates[String(fromCurrency).toUpperCase()] ?? 1;
    const target = exchangeRates[selectedCurrency] ?? 1;
    return Number(amount || 0) / source * target;
  }, [exchangeRates, selectedCurrency]);
  const formatPrice = useCallback((amount: number, currency = DEFAULT_CURRENCY) => {
    const config = CURRENCY_META[selectedCurrency] || fallbackCurrency;
    const value = convertPrice(amount, currency);
    try {
      return new Intl.NumberFormat(config.locale, {
        style: 'currency', currency: config.code,
        minimumFractionDigits: config.fractionDigits, maximumFractionDigits: config.fractionDigits,
      }).format(value);
    } catch { return `${config.symbol}${value.toFixed(config.fractionDigits)}`; }
  }, [convertPrice, selectedCurrency]);
  const value = useMemo<ContextValue>(() => ({
    selectedCurrency, currencyCode: selectedCurrency, currencySymbol: CURRENCY_META[selectedCurrency].symbol,
    currency: CURRENCY_META[selectedCurrency], currencies: CURRENCY_OPTIONS,
    exchangeRate: exchangeRates[selectedCurrency] ?? 1, exchangeRates, lastUpdatedAt, isLoading, error,
    setCurrency, updateCurrency: setCurrency, refreshRates, convertPrice, formatPrice,
  }), [convertPrice, error, exchangeRates, formatPrice, isLoading, lastUpdatedAt, refreshRates, selectedCurrency, setCurrency]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);
export default CurrencyProvider;
