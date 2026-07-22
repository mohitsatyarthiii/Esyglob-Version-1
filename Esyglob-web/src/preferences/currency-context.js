import { createContext, useContext } from 'react'

export const CurrencyContext = createContext(null)
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'CAD', 'AUD', 'SGD']
export function useCurrency() {
  const value = useContext(CurrencyContext)
  if (!value) throw new Error('useCurrency must be used inside CurrencyProvider')
  return value
}
