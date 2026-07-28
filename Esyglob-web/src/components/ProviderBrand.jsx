import { useState } from 'react'

const providers = {
  dhl: { label: 'DHL', logo: '/dhl.webp' },
  fedex: { label: 'FedEx', logo: '/fedex.png' },
  shiprocket: { label: 'Shiprocket', logo: '/shiprocket.png' },
  delhivery: { label: 'Delhivery', logo: '/delhivery.png' },
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
      ? <img src={provider.logo} alt={provider.label} onError={() => setFailed(true)} />
      : <b>{provider.label}</b>}
    {name && <small>{provider.label}</small>}
  </span>
}

export function ProviderStrip({ keys = providerKeys, label = 'Supported providers', compact = false }) {
  if (!keys.length) return null
  return <div className={`provider-strip${compact ? ' is-compact' : ''}`}>
    <small>{label}</small>
    <div>{keys.map(key => <ProviderBrand key={key} providerKey={key} compact={compact} />)}</div>
  </div>
}
