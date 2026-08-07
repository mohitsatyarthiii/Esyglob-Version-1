import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function BackButton({ fallback = '/home', label = 'Back', className = 'back-link' }) {
  const navigate = useNavigate()
  const location = useLocation()
  return <button type="button" className={className} onClick={() => {
    if (location.key !== 'default' && window.history.length > 1) navigate(-1)
    else navigate(fallback)
  }}><ArrowLeft /> {label}</button>
}
