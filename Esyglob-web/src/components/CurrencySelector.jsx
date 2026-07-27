import { Globe2 } from 'lucide-react'
import { useId } from 'react'
import { CURRENCIES, CURRENCY_OPTIONS, useCurrency } from '../preferences/currency-context'

export default function CurrencySelector({ className = 'header-currency' }) {
  const { selectedCurrency, setCurrency } = useCurrency()
  const listId = useId()
  const commit = raw => {
    const code = String(raw || '').trim().toUpperCase()
    if (CURRENCIES.includes(code)) {
      setCurrency(code)
      return code
    }
    return selectedCurrency
  }
  return <label className={className}>
    <Globe2 />
    <input
      list={listId}
      key={selectedCurrency}
      defaultValue={selectedCurrency}
      onFocus={event => event.target.select()}
      onChange={event => {
        const next = event.target.value.toUpperCase()
        if (CURRENCIES.includes(next)) setCurrency(next)
      }}
      onBlur={event => { event.target.value = commit(event.target.value) }}
      aria-label="Search preferred currency"
      autoComplete="off"
    />
    <datalist id={listId}>{CURRENCY_OPTIONS.map(([code,,name,flag]) => <option value={code} key={code}>{flag} {name}</option>)}</datalist>
  </label>
}
