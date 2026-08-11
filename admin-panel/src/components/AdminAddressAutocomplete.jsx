import { LocateFixed, LoaderCircle, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { resolveAddressSuggestion, reverseAddressCoordinates, searchAddressSuggestions } from '../api/client'

export default function AdminAddressAutocomplete({ value = '', onChange, onSelect }) {
  const [items, setItems] = useState([])
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const query = String(value || '').trim()
    if (!focused || query.length < 3) return undefined
    let current = true
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchAddressSuggestions(query)
        if (current) setItems(result)
      } catch { if (current) setItems([]) }
    }, 320)
    return () => { current = false; window.clearTimeout(timer) }
  }, [focused, value])

  async function select(item) {
    setBusy(true); setItems([])
    try {
      const location = await resolveAddressSuggestion(item.placeId)
      onChange(location?.formattedAddress || item.label)
      onSelect?.(location)
    } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }

  function locate() {
    setNotice('')
    if (!navigator.geolocation) { setNotice('Unable to detect your location. Please select your location manually.'); return }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const location = await reverseAddressCoordinates(coords.latitude, coords.longitude)
        onChange(location?.formattedAddress || '')
        onSelect?.(location)
      } catch { setNotice('Unable to detect your location. Please select your location manually.') }
      finally { setBusy(false) }
    }, error => { setBusy(false); setNotice(error.code === 1 ? 'Location permission was denied. Please select your location manually.' : 'Unable to detect your location. Please select your location manually.') }, { enableHighAccuracy: true, timeout: 15000 })
  }

  return <span className="admin-address">
    <span><MapPin /><input value={value} onChange={event => onChange(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 180)} autoComplete="off" placeholder="Search a global address" /><button type="button" onMouseDown={event => event.preventDefault()} onClick={locate} aria-label="Use current location">{busy ? <LoaderCircle className="spin" /> : <LocateFixed />}</button></span>
    {notice && <small className="field-error">{notice}</small>}
    {focused && String(value).trim().length >= 3 && items.length > 0 && <span className="admin-address__menu">{items.map(item => <button type="button" key={item.placeId} onMouseDown={event => event.preventDefault()} onClick={() => select(item)}><MapPin /><span><b>{item.primaryText}</b><small>{item.secondaryText}</small></span></button>)}<small>Powered by Google</small></span>}
  </span>
}
