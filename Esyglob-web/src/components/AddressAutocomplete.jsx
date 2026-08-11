import { LocateFixed, LoaderCircle, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { resolveAddressSuggestion, searchAddressSuggestions } from '../api/account'
import { detectCurrentAddress } from '../utils/current-address'

function sessionToken() {
  return globalThis.crypto?.randomUUID?.() || `esyglob-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  countryCodes = '',
  disabled = false,
  name,
  required,
  invalid,
  describedBy,
  placeholder = 'Start typing an address',
}) {
  const token = useRef(sessionToken())
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const query = String(value || '').trim()
    if (disabled || query.length < 3) return undefined
    let current = true
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchAddressSuggestions(query, token.current, countryCodes)
        if (!current) return
        setSuggestions(result.suggestions || [])
        setOpen(Boolean(result.suggestions?.length))
      } catch {
        if (current) { setSuggestions([]); setOpen(false) }
      }
    }, 320)
    return () => { current = false; window.clearTimeout(timer) }
  }, [countryCodes, disabled, value])

  async function choose(item) {
    setBusy(true)
    setOpen(false)
    try {
      const result = await resolveAddressSuggestion(item.placeId, token.current)
      onChange(result.location?.formattedAddress || item.label)
      onSelect?.(result.location)
      token.current = sessionToken()
    } finally { setBusy(false) }
  }

  async function useCurrentLocation() {
    setNotice('')
    setBusy(true)
    try {
      const location = await detectCurrentAddress()
      onChange(location.formattedAddress || '')
      onSelect?.(location)
    } catch (error) {
      setNotice(error.message || 'Unable to find your current address.')
    } finally { setBusy(false) }
  }

  function keyDown(event) {
    if (!open || !suggestions.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => Math.min(current + 1, suggestions.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(current - 1, 0)) }
    if (event.key === 'Escape') setOpen(false)
    if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(suggestions[active]) }
  }

  return <span className="address-autocomplete">
    <span className="address-autocomplete__input"><MapPin /><input
      name={name}
      value={value}
      disabled={disabled}
      required={required}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      aria-autocomplete="list"
      autoComplete="off"
      placeholder={placeholder}
      onChange={event => {
        const nextValue = event.target.value
        onChange(nextValue)
        setActive(-1)
        if (nextValue.trim().length < 3) { setSuggestions([]); setOpen(false) }
      }}
      onFocus={() => value.trim().length >= 3 && suggestions.length && setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 180)}
      onKeyDown={keyDown}
    /><button type="button" className="address-autocomplete__locate" onMouseDown={event => event.preventDefault()} onClick={useCurrentLocation} disabled={disabled || busy} aria-label="Use current location" title="Use current location"><LocateFixed /></button>{busy && <LoaderCircle className="spin" />}
    </span>
    {notice && <small className="address-autocomplete__notice" role="status">{notice}</small>}
    {open && !disabled && value.trim().length >= 3 && <span className="address-autocomplete__menu" role="listbox">
      {suggestions.map((item, index) => <button
        type="button"
        role="option"
        aria-selected={index === active}
        className={index === active ? 'active' : ''}
        key={item.placeId}
        onMouseDown={event => event.preventDefault()}
        onClick={() => choose(item)}
      ><MapPin /><span><b>{item.primaryText}</b><small>{item.secondaryText}</small></span></button>)}
      <small className="address-autocomplete__credit">Powered by Google</small>
    </span>}
  </span>
}
