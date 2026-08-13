import { CheckCircle2, CircleAlert, RefreshCw, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'
import { fetchAdminShippingSetups, retryAdminShippingSetup } from '../api/trade'

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
export default function AdminShippingSetupPage() {
  const result = useAsyncData(useCallback(() => fetchAdminShippingSetups(), []))
  const [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  const items = result.data?.setups || []
  async function retry(item, provider) {
    const key = `${item.sellerId?._id || item.sellerId}:${provider}`; setBusy(key); setMessage('')
    try { await retryAdminShippingSetup(item.sellerId?._id || item.sellerId, provider); await result.reload() }
    catch (error) { setMessage(error.message) } finally { setBusy('') }
  }
  return <AppShell><main className="container module-page"><header className="page-head"><div><span className="eyebrow">Logistics operations</span><h1>Seller shipping readiness</h1><p>Provider pickup mappings, registration failures, and retry controls.</p></div><Truck /></header>{message && <p className="action-error">{message}</p>}
    <div className="service-grid">{items.map(item => <article className="module-panel" key={item._id}><h2>{item.sellerId?.companyName || 'Seller'}</h2><p>{item.pickupAddress?.line1}, {item.pickupAddress?.city}, {item.pickupAddress?.state} {item.pickupAddress?.postalCode}</p><b>Readiness: {label(item.readiness)}</b>{item.providers.map(provider => <div className="compact-heading" key={provider.providerKey}><span>{provider.status === 'active' ? <CheckCircle2 /> : <CircleAlert />} <b>{label(provider.providerKey)}</b> · {label(provider.status)}{provider.error?.message && <small>{provider.error.message}</small>}</span><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => retry(item, provider.providerKey)}><RefreshCw /> Retry</button></div>)}</article>)}</div>
  </main></AppShell>
}
