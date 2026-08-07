import { useState } from 'react'

const providers = {
  dhl: { label: 'DHL', logo: '/dhl.webp', type: 'Logistics' },
  fedex: { label: 'FedEx', logo: '/fedx.png', type: 'Logistics' },
  shiprocket: { label: 'Shiprocket', logo: '/shiprocket.png', type: 'Shipping technology' },
  delhivery: { label: 'Delhivery', logo: '/delhivery.png', type: 'Logistics' },
  asc: { label: 'ASC', logo: '/asc.png', type: 'Warehousing' },
  maersk: { label: 'Maersk', logo: '/maersk.png', type: 'Ocean logistics' },
  dpworld: { label: 'DP World', logo: '/dp-world.png', type: 'Trade logistics' },
  sgs: { label: 'SGS', logo: '/sgs.png', type: 'Inspection' },
  intertek: { label: 'Intertek', logo: '/intertek.png', type: 'Quality assurance' },
  'bureau-veritas': { label: 'Bureau Veritas', logo: '/bureau-veritas.png', type: 'Testing and certification' },
  'tuv-rheinland': { label: 'TÜV Rheinland', logo: '/tuv-rheinland.png', type: 'Certification' },
}

const providerKeys = Object.keys(providers)

function providerLabel(providerKey) {
  const key = String(providerKey || '').toLowerCase()
  return providers[key]?.label || String(providerKey || 'Service provider')
}

export default function ProviderBrand({ providerKey, compact = false, name = false, className = '' }) {
  const key = String(providerKey || '').toLowerCase()
  const provider = providers[key] || { label: providerLabel(key), logo: '' }
  const [failed, setFailed] = useState(false)
  return <span
    className={`provider-logo provider-logo--${key}${compact ? ' is-compact' : ''}${name ? ' has-name' : ''}${className ? ` ${className}` : ''}`}
    aria-label={provider.label}
  >
    {provider.logo && !failed
      ? <img src={provider.logo} alt={provider.label} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <b>{provider.label}</b>}
    {name && <span className="provider-logo__name">{provider.logo && !failed && <small>{provider.label}</small>}{provider.type && <em>{provider.type}</em>}</span>}
  </span>
}

export function ProviderStrip({ keys = providerKeys, label = 'Supported providers', compact = false, named = false, className = '' }) {
  if (!keys.length) return null
  return <div className={`provider-strip${compact ? ' is-compact' : ''}${named ? ' is-named' : ''}${className ? ` ${className}` : ''}`}>
    <small>{label}</small>
    <div>{keys.map(key => <ProviderBrand key={key} providerKey={key} compact={compact} name={named} />)}</div>
  </div>
}
