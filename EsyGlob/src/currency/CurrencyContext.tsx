import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { appStorage, readJson, writeJson } from '../storage/appStorage';
import { fetchProfileSettings, updatePreferredCurrency } from '../api/account';
import { useAuth } from '../auth/AuthContext';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'CAD', 'AUD', 'SGD'] as const;
export type CurrencyCode = typeof CURRENCIES[number];
type Rates = Record<string, number>;
type RateCache = { fetchedAt: number; rates: Rates };
const CURRENCY_KEY = 'preferences.currency';
const RATES_KEY = 'currency.rates.v2';
const HOUR = 60 * 60_000;
const RATE_URL = 'https://open.er-api.com/v6/latest/INR';
const fallbackRates: Rates = { INR: 1 };
const meta: Record<CurrencyCode, { symbol: string; locale: string; position: 'prefix' | 'suffix'; digits: number }> = {
  INR: { symbol: '\u20b9', locale: 'en-IN', position: 'prefix', digits: 0 },
  USD: { symbol: '$', locale: 'en-US', position: 'prefix', digits: 2 },
  EUR: { symbol: '\u20ac', locale: 'de-DE', position: 'suffix', digits: 2 },
  GBP: { symbol: '\u00a3', locale: 'en-GB', position: 'prefix', digits: 2 },
  AED: { symbol: '\u062f.\u0625', locale: 'ar-AE', position: 'prefix', digits: 2 },
  JPY: { symbol: '\u00a5', locale: 'ja-JP', position: 'prefix', digits: 0 },
  CAD: { symbol: 'CA$', locale: 'en-CA', position: 'prefix', digits: 2 },
  AUD: { symbol: 'A$', locale: 'en-AU', position: 'prefix', digits: 2 },
  SGD: { symbol: 'S$', locale: 'en-SG', position: 'prefix', digits: 2 },
};

type ContextValue = {
  selectedCurrency: CurrencyCode;
  currencyCode: CurrencyCode;
  currencySymbol: string;
  exchangeRate: number;
  exchangeRates: Rates;
  lastUpdatedAt: number | null;
  isLoading: boolean;
  error: string | null;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
  updateCurrency: (currency: CurrencyCode) => Promise<void>;
  refreshRates: (force?: boolean) => Promise<void>;
  convertPrice: (amount: number, fromCurrency?: string) => number;
  formatPrice: (amount: number, currency?: string) => string;
};

const fallback: ContextValue = {
  selectedCurrency: 'INR', currencyCode: 'INR', currencySymbol: '\u20b9', exchangeRate: 1,
  exchangeRates: fallbackRates, lastUpdatedAt: null, isLoading: false, error: null,
  setCurrency: async () => undefined, updateCurrency: async () => undefined,
  refreshRates: async () => undefined, convertPrice: amount => Number(amount || 0),
  formatPrice: amount => `\u20b9${Number(amount || 0).toLocaleString('en-IN')}`,
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
    const stored = appStorage.getString(CURRENCY_KEY) as CurrencyCode | undefined;
    return stored && CURRENCIES.includes(stored) ? stored : 'INR';
  });
  const [exchangeRates, setRates] = useState<Rates>(cached?.rates ?? fallbackRates);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(cached?.fetchedAt ?? null);
  const [isLoading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const fetchedAt = useRef(cached?.fetchedAt ?? 0);

  const refreshRates = useCallback(async (force = false) => {
    if (!force && Date.now() - fetchedAt.current < HOUR) return;
    setLoading(true);
    setError(null);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(RATE_URL);
        if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}`);
        const payload = await response.json() as { rates?: Rates };
        if (!payload.rates || typeof payload.rates !== 'object') throw new Error('Invalid exchange-rate response');
        const rates = { INR: 1, ...payload.rates };
        fetchedAt.current = Date.now();
        setLastUpdatedAt(fetchedAt.current);
        setRates(rates);
        writeJson(RATES_KEY, { fetchedAt: fetchedAt.current, rates });
        setLoading(false);
        return;
      } catch (requestError) {
        lastError = requestError;
      }
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
      const preferred = String(profile.preferredCurrency ?? '').toUpperCase() as CurrencyCode;
      if (CURRENCIES.includes(preferred)) { setSelected(preferred); appStorage.set(CURRENCY_KEY, preferred); }
    }).catch(() => undefined);
  }, [status]);

  const setCurrency = useCallback(async (currency: CurrencyCode) => {
    if (!CURRENCIES.includes(currency)) return;
    setSelected(currency);
    appStorage.set(CURRENCY_KEY, currency);
    if (status === 'authenticated') await updatePreferredCurrency(currency).catch(() => undefined);
  }, [status]);
  const convertPrice = useCallback((amount: number, fromCurrency = 'INR') => {
    const source = exchangeRates[String(fromCurrency).toUpperCase()] ?? 1;
    const target = exchangeRates[selectedCurrency] ?? 1;
    return Number(amount || 0) / source * target;
  }, [exchangeRates, selectedCurrency]);
  const formatPrice = useCallback((amount: number, currency = 'INR') => {
    const value = convertPrice(amount, currency);
    const config = meta[selectedCurrency];
    const number = value.toLocaleString(config.locale, { minimumFractionDigits: config.digits, maximumFractionDigits: config.digits });
    return config.position === 'suffix' ? `${number} ${config.symbol}` : `${config.symbol}${number}`;
  }, [convertPrice, selectedCurrency]);
  const value = useMemo<ContextValue>(() => ({
    selectedCurrency, currencyCode: selectedCurrency, currencySymbol: meta[selectedCurrency].symbol,
    exchangeRate: exchangeRates[selectedCurrency] ?? 1, exchangeRates, lastUpdatedAt, isLoading, error,
    setCurrency, updateCurrency: setCurrency, refreshRates, convertPrice, formatPrice,
  }), [convertPrice, error, exchangeRates, formatPrice, isLoading, lastUpdatedAt, refreshRates, selectedCurrency, setCurrency]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);
export default CurrencyProvider;
