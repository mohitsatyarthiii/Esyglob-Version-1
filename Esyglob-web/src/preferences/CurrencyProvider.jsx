import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchProfile, updatePreferredCurrency } from '../api/account'
import { useAuth } from '../auth/auth-context'
import { CURRENCIES, CurrencyContext } from './currency-context'

const RATE_URL = 'https://open.er-api.com/v6/latest/INR'
const HOUR = 60 * 60_000
const meta = {
  INR: { locale: 'en-IN', digits: 0 }, USD: { locale: 'en-US', digits: 2 }, EUR: { locale: 'de-DE', digits: 2 },
  GBP: { locale: 'en-GB', digits: 2 }, AED: { locale: 'ar-AE', digits: 2 }, JPY: { locale: 'ja-JP', digits: 0 },
  CAD: { locale: 'en-CA', digits: 2 }, AUD: { locale: 'en-AU', digits: 2 }, SGD: { locale: 'en-SG', digits: 2 },
}

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback } }

export default function CurrencyProvider({ children }) {
  const { status } = useAuth()
  const cached = useMemo(() => readJson('esyglob.currency.rates', null), [])
  const [selectedCurrency, setSelected] = useState(() => CURRENCIES.includes(localStorage.getItem('esyglob.currency')) ? localStorage.getItem('esyglob.currency') : 'INR')
  const [rates, setRates] = useState(cached?.rates || { INR: 1 })
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState(cached?.fetchedAt || null)
  const fetchedAt = useRef(cached?.fetchedAt || 0)

  const refreshRates = useCallback(async (force = false) => {
    if (!force && Date.now() - fetchedAt.current < HOUR) return
    setLoading(true); setError('')
    try {
      const response = await fetch(RATE_URL)
      if (!response.ok) throw new Error('Live exchange rates are temporarily unavailable.')
      const payload = await response.json()
      if (!payload.rates) throw new Error('The exchange-rate response was incomplete.')
      const next = { INR: 1, ...payload.rates }; const time = Date.now()
      setRates(next); setLastUpdatedAt(time); fetchedAt.current = time; localStorage.setItem('esyglob.currency.rates', JSON.stringify({ fetchedAt: time, rates: next }))
    } catch (nextError) { setError(nextError.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => refreshRates().catch(() => {}), 0); return () => { window.clearTimeout(timer) } }, [refreshRates])
  useEffect(() => {
    if (status !== 'authenticated') return
    fetchProfile().then((profile) => { const preferred = String(profile.preferredCurrency || '').toUpperCase(); if (CURRENCIES.includes(preferred)) { setSelected(preferred); localStorage.setItem('esyglob.currency', preferred) } }).catch(() => {})
  }, [status])

  const setCurrency = useCallback(async (currency) => {
    if (!CURRENCIES.includes(currency)) return
    setSelected(currency); localStorage.setItem('esyglob.currency', currency)
    if (status === 'authenticated') await updatePreferredCurrency(currency)
  }, [status])
  const convertPrice = useCallback((amount, fromCurrency = 'INR') => Number(amount || 0) / (rates[String(fromCurrency).toUpperCase()] || 1) * (rates[selectedCurrency] || 1), [rates, selectedCurrency])
  const formatPrice = useCallback((amount, fromCurrency = 'INR') => new Intl.NumberFormat(meta[selectedCurrency]?.locale || 'en-IN', { style: 'currency', currency: selectedCurrency, minimumFractionDigits: meta[selectedCurrency]?.digits, maximumFractionDigits: meta[selectedCurrency]?.digits }).format(convertPrice(amount, fromCurrency)), [convertPrice, selectedCurrency])
  const value = useMemo(() => ({ selectedCurrency, rates, loading, error, setCurrency, convertPrice, formatPrice, refreshRates, lastUpdatedAt }), [convertPrice, error, formatPrice, lastUpdatedAt, loading, rates, refreshRates, selectedCurrency, setCurrency])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
