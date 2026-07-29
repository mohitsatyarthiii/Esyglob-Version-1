import { useEffect, useMemo, useRef, useState } from 'react'
import { Network } from 'lucide-react'
import { partnersForService } from './trustedPartners.config'

export default function TrustedPartners({
  serviceKey,
  title = 'Trusted Partners',
  description = '',
  compact = false,
  className = '',
}) {
  const rootRef = useRef(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [available, setAvailable] = useState([])
  const partners = useMemo(() => partnersForService(serviceKey).slice(0, 8), [serviceKey])

  useEffect(() => {
    const node = rootRef.current
    if (!node || shouldLoad || !partners.length) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setShouldLoad(true)
      observer.disconnect()
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [partners, shouldLoad])

  useEffect(() => {
    if (!shouldLoad || !partners.length) return undefined
    let cancelled = false
    Promise.all(partners.map(partner => new Promise(resolve => {
      const image = new Image()
      image.onload = () => resolve(partner)
      image.onerror = () => resolve(null)
      image.src = partner.logo
    }))).then(results => {
      if (!cancelled) setAvailable(results.filter(Boolean))
    })
    return () => { cancelled = true }
  }, [partners, shouldLoad])

  return <div
    ref={rootRef}
    className={`trusted-partners${available.length ? ' has-partners' : ' is-empty'}${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
  >
    {available.length > 0 && <>
      <header><span><Network /> {title}</span>{description && <p>{description}</p>}</header>
      <div className="trusted-partners__logos">{available.map(partner =>
        <span className="trusted-partners__logo" key={partner.key} title={partner.name}>
          <img src={partner.logo} alt={partner.name} loading="lazy" decoding="async" />
        </span>,
      )}</div>
    </>}
  </div>
}
