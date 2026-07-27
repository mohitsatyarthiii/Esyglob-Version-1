import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export default function Drawer({ open, title, subtitle, children, footer, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    closeRef.current?.focus()
    const keydown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus?.() }
  }, [onClose, open])
  if (!open) return null
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="drawer-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button ref={closeRef} onClick={onClose}><X /></button></header><div className="drawer-body">{children}</div>{footer && <footer>{footer}</footer>}</aside></div>
}
