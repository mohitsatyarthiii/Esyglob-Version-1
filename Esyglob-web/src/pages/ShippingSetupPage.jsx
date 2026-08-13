import { CheckCircle2, CircleAlert, Factory, RefreshCw, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'
import { fetchMyShippingSetup, synchronizeMyShippingSetup } from '../api/trade'

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())

export default function ShippingSetupPage() {
  const setup = useAsyncData(useCallback(() => fetchMyShippingSetup(), []))
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const data = setup.data?.setup || setup.data
  async function synchronize() {
    setBusy(true); setMessage('')
    try { await synchronizeMyShippingSetup(); setMessage('Shipping provider setup refreshed.'); await setup.reload() }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <AppShell><main className="container module-page"><header className="page-head"><div><span className="eyebrow">Seller fulfilment</span><h1>Shipping setup</h1><p>Your pickup address is registered separately with each supported carrier.</p></div><Truck /></header>
    {message && <p className="action-error">{message}</p>}
    <section className="module-panel"><h2><Factory /> Pickup location</h2>{data?.pickupAddress ? <p>{data.pickupAddress.line1}, {data.pickupAddress.city}, {data.pickupAddress.state} {data.pickupAddress.postalCode}</p> : <p>Complete the factory or business pickup address.</p>}<strong>Shipping readiness: {label(data?.readiness || 'pending')}</strong></section>
    <div className="service-grid">{(data?.providers || []).map(provider => <article className="module-panel" key={provider.providerKey}>{provider.status === 'active' ? <CheckCircle2 /> : <CircleAlert />}<h2>{label(provider.providerKey)}</h2><b>{label(provider.status)}</b><p>{provider.status === 'active' ? 'Pickup mapping is ready for rates and booking.' : provider.error?.message || 'Provider registration is pending.'}</p></article>)}</div>
    <button className="button button--primary" disabled={busy} onClick={synchronize}><RefreshCw />{busy ? 'Refreshing…' : 'Retry shipping setup'}</button>
  </main></AppShell>
}
