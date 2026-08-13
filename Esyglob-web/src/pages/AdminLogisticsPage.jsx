import { CircleAlert, RefreshCw, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'
import { apiRequest, unwrapData } from '../api/client'
import { retryOrderShippingBooking } from '../api/trade'

const load = () => apiRequest('/shipments', { query: { limit: 300 }, cache: false }).then(unwrapData)
const label = value => String(value || '').replaceAll('_', ' ')
export default function AdminLogisticsPage() {
  const result = useAsyncData(useCallback(() => load(), [])); const [busy, setBusy] = useState(''), [message, setMessage] = useState('')
  const shipments = result.data?.shipments || []
  async function retry(item) { setBusy(item._id); setMessage(''); try { await retryOrderShippingBooking(item.orderId?._id || item.orderId); await result.reload() } catch (error) { setMessage(error.message) } finally { setBusy('') } }
  return <AppShell><main className="container module-page"><header className="page-head"><div><span className="eyebrow">Logistics operations</span><h1>Shipment support dashboard</h1><p>Paid order, provider booking, AWB, pickup, tracking, and retry state.</p></div><Truck /></header>{message && <p className="action-error">{message}</p>}
    <div className="service-grid">{shipments.map(item => <article className="module-panel" key={item._id}><h2>{item.orderId?.orderNumber || 'Order'}</h2><p>{item.sellerId?.companyName || 'Seller'} → {item.buyerId?.companyName || item.buyerId?.fullName || 'Buyer'}</p><div className="quote-breakdown"><span>Provider <b>{item.provider || 'pending'}</b></span><span>Service <b>{item.serviceLevel || 'pending'}</b></span><span>Payment <b>{label(item.orderId?.paymentStatus)}</b></span><span>Shipment <b>{label(item.status)}</b></span><span>AWB <b>{item.awbNumber || item.trackingNumber || 'Pending'}</b></span><span>Pickup <b>{item.pickupRequestId || 'Pending'}</b></span></div>{item.providerPayload?.bookingError && <p className="action-error"><CircleAlert />{item.providerPayload.bookingError.message}</p>}<button className="button button--secondary" disabled={Boolean(busy) || item.orderId?.paymentStatus !== 'paid'} onClick={() => retry(item)}><RefreshCw /> Retry booking / pickup</button></article>)}</div>
  </main></AppShell>
}
