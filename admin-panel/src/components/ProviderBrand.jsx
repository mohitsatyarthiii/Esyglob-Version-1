import { useState } from 'react'

const labels = { dhl: 'DHL', fedex: 'FedEx', shiprocket: 'Shiprocket', delhivery: 'Delhivery' }

export default function ProviderBrand({ providerKey }) {
  const key = String(providerKey || '').toLowerCase()
  const [failed, setFailed] = useState(false)
  if (!labels[key]) return null
  return <span className={`admin-provider-logo admin-provider-logo--${key}`}>
    {!failed ? <img src={`/providers/${key}.svg`} alt={labels[key]} onError={() => setFailed(true)} /> : <b>{labels[key]}</b>}
  </span>
}
