import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkSavedItem, toggleSavedItem } from '../api/marketplace'
import { useAuth } from '../auth/auth-context'

export default function WishlistButton({ itemId, type = 'product', className = '' }) {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    if (status !== 'authenticated' || !itemId) return undefined
    checkSavedItem(type, itemId).then((value) => { if (active) setSaved(value) }).catch(() => {})
    return () => { active = false }
  }, [itemId, status, type])

  async function toggle(event) {
    event.preventDefault()
    event.stopPropagation()
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: `${location.pathname}${location.search}`, notice: 'Sign in to save items across devices.' } })
      return
    }
    if (busy) return
    const previous = saved
    setSaved(!saved)
    setBusy(true)
    try {
      const result = await toggleSavedItem(type, itemId)
      if (typeof result.saved === 'boolean') setSaved(result.saved)
    } catch {
      setSaved(previous)
    } finally {
      setBusy(false)
    }
  }

  return <button type="button" onClick={toggle} disabled={busy} className={`${className} ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={saved}><Heart fill={saved ? 'currentColor' : 'none'} /></button>
}
