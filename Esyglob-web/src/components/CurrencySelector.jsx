import { Check, ChevronDown, Languages, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CURRENCY_META, CURRENCY_OPTIONS, currencyLabel, useCurrency } from '../preferences/currency-context'

const LANGUAGE_KEY = 'esyglob.language'
const languages = [
  { code: 'en-IN', short: 'EN', name: 'English (India)', country: 'in' },
  { code: 'en-US', short: 'EN', name: 'English (United States)', country: 'us' },
  { code: 'zh-CN', short: 'ZH', name: '中文 (China)', country: 'cn' },
  { code: 'de-DE', short: 'DE', name: 'Deutsch (Germany)', country: 'de' },
  { code: 'ja-JP', short: 'JA', name: '日本語 (Japan)', country: 'jp' },
  { code: 'ar-AE', short: 'AR', name: 'العربية (UAE)', country: 'ae' },
  { code: 'en-GB', short: 'EN', name: 'English (United Kingdom)', country: 'gb' },
]

function storedLanguage() {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY)
    return languages.some(item => item.code === value) ? value : 'en-IN'
  } catch { return 'en-IN' }
}

function Flag({ country, flag }) {
  return flag
    ? <span className="locale-flag locale-flag--emoji" aria-hidden="true">{flag}</span>
    : <img className="locale-flag" src={`/flags/${country}.svg`} alt="" aria-hidden="true" />
}

export default function CurrencySelector({ className = 'header-currency' }) {
  const { selectedCurrency, setCurrency } = useCurrency()
  const [language, setLanguage] = useState(storedLanguage)
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
  }, [query])

  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    if (open) window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    document.documentElement.setAttribute('lang', language)
    document.documentElement.setAttribute('dir', language.startsWith('ar') ? 'rtl' : 'ltr')
    window.dispatchEvent(new CustomEvent('esyglob-language-change', { detail: { language } }))
  }, [language])

  function select(item) {
    if (item.type === 'currency') {
      setCurrency(item.code)
    } else {
      setLanguage(item.code)
      try { localStorage.setItem(LANGUAGE_KEY, item.code) } catch { /* Storage can be unavailable. */ }
    }
    setOpen(false)
    setQuery('')
  }

  function keyDown(event) {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, options.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)) }
    if (event.key === 'Enter' && options[active]) { event.preventDefault(); select(options[active]) }
  }

  return <div className={`${className} locale-selector ${open ? 'open' : ''}`} ref={root} onKeyDown={keyDown}>
    <button type="button" className="locale-selector__trigger" onClick={() => { setActive(0); setOpen(value => !value) }} aria-expanded={open} aria-haspopup="listbox" aria-label={`Currency: ${currencyLabel(selectedCurrency)}`}>
      <Flag flag={CURRENCY_META[selectedCurrency].flag} />
      <span>{selectedCurrency}</span>
      <ChevronDown />
    </button>
    {open && <div className="locale-selector__popover">
      <label className="locale-selector__search"><Search /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search language or currency" aria-label="Search language or currency" /></label>
      <div className="locale-selector__list" role="listbox" aria-label="Language and currency">
        {options.map((item, index) => {
          const selected = item.type === 'language' ? language === item.code : selectedCurrency === item.code
          const heading = index === 0 || options[index - 1]?.type !== item.type
          return <span className="locale-selector__item-wrap" key={`${item.type}-${item.code}`}>
            {heading && <small>{item.type === 'language' ? 'Language' : 'Currency'}</small>}
            <button type="button" role="option" aria-selected={selected} className={index === active ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => select(item)}>
              <Flag country={item.country} flag={item.flag} />
              <span><b>{item.type === 'currency' ? currencyLabel(item) : item.name}</b>{item.type === 'language' && <small>{item.code}</small>}</span>
              {selected && <Check />}
            </button>
          </span>
        })}
        {!options.length && <p>No matching preference</p>}
      </div>
      <small className="locale-selector__hint"><Languages /> Currency is saved here and synced to your profile.</small>
    </div>}
  </div>
}
