import { createContext, useContext } from 'react'
import currencyMetadata from '../../../shared/currency-metadata.json'

export const DEFAULT_CURRENCY = 'INR'
export const CURRENCY_OPTIONS = Object.freeze(currencyMetadata.map(
  item => Object.freeze({ ...item, flag: flagEmoji(item.flagCountryCode) }),
))
export const CURRENCIES = Object.freeze(CURRENCY_OPTIONS.map(({ code }) => code))
export const CURRENCY_META = Object.freeze(Object.fromEntries(
  CURRENCY_OPTIONS.map(item => [item.code, item]),
))

export function flagEmoji(countryCode) {
  return String(countryCode || '').toUpperCase().replace(/[A-Z]/g, letter =>
    String.fromCodePoint(127397 + letter.charCodeAt(0)))
}

export function currencyLabel(currency) {
  const item = typeof currency === 'string' ? CURRENCY_META[currency] : currency
  return item ? `${item.flag || flagEmoji(item.flagCountryCode)} ${item.name} (${item.code})` : ''
}

export const CurrencyContext = createContext(null)

export function useCurrency() {
  const value = useContext(CurrencyContext)
  if (!value) throw new Error('useCurrency must be used inside CurrencyProvider')
  return value
}
