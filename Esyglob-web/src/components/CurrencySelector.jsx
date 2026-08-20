import { Check, ChevronDown, Languages, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/i18n-context'
import { CURRENCY_META, CURRENCY_OPTIONS, currencyLabel, useCurrency } from '../preferences/currency-context'

function Flag({ country, flag, countryCode }) {
  const resolvedCode = String(country || countryCode || '').trim().toUpperCase()
  if (resolvedCode && /^[A-Z]{2}$/.test(resolvedCode)) {
    return <img className="locale-flag" src={`/flags/${resolvedCode.toLowerCase()}.svg`} alt="" aria-hidden="true" />
  }
  return flag ? <span className="locale-flag locale-flag--emoji" aria-hidden="true">{flag}</span> : null
}

export default function CurrencySelector({ className = 'header-currency' }) {
  const { selectedCurrency, setCurrency } = useCurrency()
  const { language, languages, setLanguage, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const searchRef = useRef(null)
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return [
      ...languages.filter(item => !needle || `${item.name} ${item.code}`.toLocaleLowerCase().includes(needle)).map(item => ({ ...item, type: 'language' })),
      ...CURRENCY_OPTIONS.filter(item => !needle || `${item.name} ${item.code}`.toLocaleLowerCase().includes(needle)).map(item => ({ ...item, type: 'currency' })),
    ]
  }, [languages, query])

  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    if (open) window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])
  async function select(item) {
    if (item.type === 'currency') {
      setCurrency(item.code)
    } else {
      await setLanguage(item.code).catch(() => undefined)
    }
    setOpen(false)
    setQuery('')
  }

  function keyDown(event) {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, options.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)) }
    if (event.key === 'Enter' && options[active]) { event.preventDefault(); void select(options[active]) }
  }

  return <div className={`${className} locale-selector ${open ? 'open' : ''}`} ref={root} onKeyDown={keyDown}>
    <button type="button" className="locale-selector__trigger" onClick={() => { setActive(0); setOpen(value => !value) }} aria-expanded={open} aria-haspopup="listbox" aria-label={`Currency: ${currencyLabel(selectedCurrency)}`}>
      <Flag countryCode={CURRENCY_META[selectedCurrency].flagCountryCode} flag={CURRENCY_META[selectedCurrency].flag} />
      <span>{selectedCurrency}</span>
      <ChevronDown />
    </button>
    {open && <div className="locale-selector__popover">
      <label className="locale-selector__search"><Search /><input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} placeholder={t('preferences.search')} aria-label={t('preferences.search')} /></label>
      <div className="locale-selector__list" role="listbox" aria-label="Language and currency">
        {options.map((item, index) => {
          const selected = item.type === 'language' ? language === item.code : selectedCurrency === item.code
          const heading = index === 0 || options[index - 1]?.type !== item.type
          return <span className="locale-selector__item-wrap" key={`${item.type}-${item.code}`}>
            {heading && <small>{item.type === 'language' ? t('preferences.language') : t('preferences.currency')}</small>}
            <button type="button" role="option" aria-selected={selected} className={index === active ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => void select(item)}>
              <Flag country={item.country} countryCode={item.flagCountryCode} flag={item.flag} />
              <span><b>{item.type === 'currency' ? currencyLabel(item) : item.name}</b>{item.type === 'language' && <small>{item.code}</small>}</span>
              {selected && <Check />}
            </button>
          </span>
        })}
        {!options.length && <p>{t('preferences.noMatch')}</p>}
      </div>
      <small className="locale-selector__hint"><Languages /> {t('preferences.hint')}</small>
    </div>}
  </div>
}

export function AccountCurrencySelector() {
  const { selectedCurrency, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef(null)
  const selected = CURRENCY_META[selectedCurrency]
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return CURRENCY_OPTIONS.filter(item => !needle || `${item.code} ${item.name} ${item.symbol}`.toLowerCase().includes(needle))
  }, [query])
  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return <div className={`account-currency-picker ${open ? 'open' : ''}`} ref={root}>
    <button type="button" className="account-currency-picker__trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Flag countryCode={selected.flagCountryCode} />
      <span><b>{selected.code} — {selected.symbol}</b><small>{selected.name}</small></span>
      <ChevronDown />
    </button>
    {open && <div className="account-currency-picker__menu">
      <label><Search /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search currency..." /></label>
      <div role="listbox">{options.map(item => <button type="button" role="option" aria-selected={item.code === selectedCurrency} key={item.code} onClick={() => { setCurrency(item.code); setOpen(false); setQuery('') }}><Flag countryCode={item.flagCountryCode} /><span><b>{item.code} — {item.symbol}</b><small>{item.name}</small></span>{item.code === selectedCurrency && <Check />}</button>)}</div>
    </div>}
  </div>
}
