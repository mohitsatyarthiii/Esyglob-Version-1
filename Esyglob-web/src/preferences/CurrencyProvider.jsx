import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchProfile, updatePreferredCurrency } from '../api/account'
import { useAuth } from '../auth/auth-context'
import { CURRENCIES, CURRENCY_META, CurrencyContext } from './currency-context'

const RATE_URL = 'https://open.er-api.com/v6/latest/INR'
const HOUR = 60 * 60_000
const CURRENCY_KEY = 'esyglob.currency'
const RATES_KEY = 'esyglob.currency.rates'
const fallbackRates = { INR: 1 }
const zeroDigitCurrencies = new Set(['JPY', 'KRW', 'VND'])

function readString(key) { try { return window.localStorage.getItem(key) } catch { return null } }
function writeString(key, value) { try { window.localStorage.setItem(key, value) } catch { /* Storage may be unavailable. */ } }
function readJson(key, fallback) { try { return JSON.parse(window.localStorage.getItem(key)) || fallback } catch { return fallback } }
function writeJson(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage may be unavailable. */ } }
async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(url, { signal: controller.signal }) }
  finally { window.clearTimeout(timer) }
}

export default function CurrencyProvider({ children }) {
  const { status } = useAuth()
  const cached = useMemo(() => readJson(RATES_KEY, null), [])
  const [selectedCurrency, setSelected] = useState(() => {
    const stored = String(readString(CURRENCY_KEY) || '').toUpperCase()
    return CURRENCIES.includes(stored) ? stored : 'INR'
  })
  const [rates, setRates] = useState(cached?.rates || fallbackRates)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(cached?.fetchedAt || null)
  const fetchedAt = useRef(cached?.fetchedAt || 0)

  const refreshRates = useCallback(async (force = false) => {
    if (!force && Date.now() - fetchedAt.current < HOUR) return
    setLoading(true); setError('')
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(RATE_URL)
        if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}`)
        const payload = await response.json()
        if (!payload.rates || typeof payload.rates !== 'object') throw new Error('The exchange-rate response was incomplete.')
        const next = { INR: 1, ...payload.rates }; const time = Date.now()
        setRates(next); setLastUpdatedAt(time); fetchedAt.current = time
        writeJson(RATES_KEY, { fetchedAt: time, rates: next })
        setLoading(false)
        return
      } catch (nextError) { lastError = nextError }
    }
    setError(lastError instanceof Error ? lastError.message : 'Exchange rates unavailable')
    setLoading(false)
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => refreshRates().catch(() => {}), 0); return () => { window.clearTimeout(timer) } }, [refreshRates])
  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') refreshRates().catch(() => {})
    }
    window.addEventListener('focus', refreshWhenActive)
    window.addEventListener('online', refreshWhenActive)
    document.addEventListener('visibilitychange', refreshWhenActive)
    return () => {
      window.removeEventListener('focus', refreshWhenActive)
      window.removeEventListener('online', refreshWhenActive)
      document.removeEventListener('visibilitychange', refreshWhenActive)
    }
  }, [refreshRates])
  useEffect(() => {
    const syncStorage = (event) => {
      if (event.key === CURRENCY_KEY) {
        const preferred = String(event.newValue || '').toUpperCase()
        if (CURRENCIES.includes(preferred)) setSelected(preferred)
      }
      if (event.key === RATES_KEY && event.newValue) {
        const next = readJson(RATES_KEY, null)
        if (next?.rates) {
          setRates(next.rates)
          setLastUpdatedAt(next.fetchedAt || null)
          fetchedAt.current = next.fetchedAt || 0
        }
      }
    }
    window.addEventListener('storage', syncStorage)
    return () => window.removeEventListener('storage', syncStorage)
  }, [])
  useEffect(() => {
    if (status !== 'authenticated') return
    fetchProfile().then((profile) => {
      const preferred = String(profile.preferredCurrency || '').toUpperCase()
      if (CURRENCIES.includes(preferred)) { setSelected(preferred); writeString(CURRENCY_KEY, preferred) }
    }).catch(() => {})
  }, [status])

  const setCurrency = useCallback(async (currency) => {
    const preferred = String(currency || '').toUpperCase()
    if (!CURRENCIES.includes(preferred)) return
    setSelected(preferred); writeString(CURRENCY_KEY, preferred)
    if (status === 'authenticated') await updatePreferredCurrency(preferred).catch(() => undefined)
  }, [status])
  const convertPrice = useCallback((amount, fromCurrency = 'INR') => {
    const source = rates[String(fromCurrency || 'INR').toUpperCase()] || 1
    const target = rates[selectedCurrency] || 1
    return Number(amount || 0) / source * target
  }, [rates, selectedCurrency])
  const formatPrice = useCallback((amount, fromCurrency = 'INR') => {
    const digits = zeroDigitCurrencies.has(selectedCurrency) ? 0 : 2
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: selectedCurrency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(convertPrice(amount, fromCurrency))
  }, [convertPrice, selectedCurrency])
  const value = useMemo(() => ({
    selectedCurrency,
    currencyCode: selectedCurrency,
    currencySymbol: CURRENCY_META[selectedCurrency].symbol,
    exchangeRate: rates[selectedCurrency] || 1,
    rates,
    exchangeRates: rates,
    loading,
    isLoading: loading,
    error,
    setCurrency,
    updateCurrency: setCurrency,
    convertPrice,
    formatPrice,
    refreshRates,
    lastUpdatedAt,
  }), [convertPrice, error, formatPrice, lastUpdatedAt, loading, rates, refreshRates, selectedCurrency, setCurrency])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
