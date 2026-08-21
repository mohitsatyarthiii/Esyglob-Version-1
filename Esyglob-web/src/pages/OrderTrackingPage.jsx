import { AlertCircle, ArrowLeft, CalendarDays, Check, ChevronRight, Clock3, Copy, ExternalLink, HelpCircle, MapPin, Package, Truck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createTrackingQuery, fetchOrderTracking } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'

const milestones = ['order_confirmed', 'ready_for_shipment', 'shipment_booked', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered']
const labels = {
  order_confirmed: 'Order confirmed', ready_for_shipment: 'Ready for shipment', shipment_booked: 'Shipment booked',
  label_created: 'Tracking number generated', pickup_scheduled: 'Pickup scheduled', picked_up: 'Picked up',
  in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', delayed: 'Shipment delayed',
  delivery_attempted: 'Delivery attempted', exception: 'Shipment exception', rto_initiated: 'Return initiated',
  rto_in_transit: 'Return in transit', rto_delivered: 'Return delivered', cancelled: 'Cancelled',
}
const queryTypes = [
  ['tracking_issue', 'Tracking issue'], ['shipment_delayed', 'Shipment delayed'], ['delivery_issue', 'Delivery issue'],
  ['wrong_tracking_information', 'Wrong tracking information'], ['damaged_shipment', 'Damaged shipment'], ['other', 'Other'],
]
const title = value => labels[value] || String(value || '').replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())
const dateTime = value => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : ''
const dateOnly = value => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : ''

function Timeline({ order, tracking }) {
  const actual = tracking.events || []
  const actualStatuses = new Set(actual.map(event => event.status))
  const entries = [{ id: 'confirmed', status: 'order_confirmed', description: 'Your payment was verified and the order was confirmed.', timestamp: order.createdAt }, ...actual]
  const lastMilestone = Math.max(0, ...entries.map(event => milestones.indexOf(event.status)).filter(index => index >= 0))
  const future = milestones.slice(lastMilestone + 1).filter(status => !actualStatuses.has(status))
  return <div className="tracking-timeline">
    {entries.map((event, index) => <div className={`tracking-event ${index === entries.length - 1 ? 'is-current' : 'is-complete'}`} key={event.id || `${event.status}-${event.timestamp}-${index}`}>
      <span className="tracking-event__marker"><Check /></span>
      <div><h3>{title(event.status)}</h3><time>{dateTime(event.timestamp)}</time>{event.description && <p>{event.description}</p>}{event.location && <span><MapPin />{event.location}</span>}</div>
    </div>)}
    {future.map(status => <div className="tracking-event is-future" key={status}><span className="tracking-event__marker" /><div><h3>{title(status)}</h3></div></div>)}
  </div>
}

function QueryDialog({ orderId, onClose }) {
  const [category, setCategory] = useState('tracking_issue')
  const [message, setMessage] = useState('')
  const [state, setState] = useState({ busy: false, error: '', sent: false })
  const submit = async event => {
    event.preventDefault()
    setState({ busy: true, error: '', sent: false })
    try { await createTrackingQuery(orderId, { category, message }); setState({ busy: false, error: '', sent: true }) }
    catch (error) { setState({ busy: false, error: error.message, sent: false }) }
  }
  return <div className="tracking-dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-query-title">
      <header><div><span><HelpCircle /></span><div><h2 id="tracking-query-title">Raise a query</h2><p>This query stays linked to your order and shipment.</p></div></div><button onClick={onClose} aria-label="Close"><X /></button></header>
      {state.sent ? <div className="tracking-query-success"><Check /><h3>Query submitted</h3><p>Our support team can now see the full shipment context.</p><button className="button button--primary" onClick={onClose}>Done</button></div> :
      <form onSubmit={submit}>
        <fieldset><legend>What do you need help with?</legend>{queryTypes.map(([value, label]) => <label className={category === value ? 'is-selected' : ''} key={value}><input type="radio" name="queryType" value={value} checked={category === value} onChange={() => setCategory(value)} /><span>{label}</span></label>)}</fieldset>
        <label className="tracking-message-label">Message<textarea required minLength={10} maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Tell us what happened and what you need help with." /></label>
        {state.error && <p className="tracking-form-error"><AlertCircle />{state.error}</p>}
        <footer><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={state.busy || message.trim().length < 10}>{state.busy ? 'Submitting…' : 'Submit query'}</button></footer>
      </form>}
    </section>
  </div>
}

export default function OrderTrackingPage() {
  const { orderId } = useParams()
  const { user } = useAuth()
  const query = useAsyncData(useCallback(() => fetchOrderTracking(orderId, true), [orderId]))
  const [liveData, setLiveData] = useState(null)
  const [dialog, setDialog] = useState(false)
  const data = liveData || query.data
  useEffect(() => {
    if (!data || data.tracking?.refreshStopped) return undefined
    const timer = window.setInterval(() => fetchOrderTracking(orderId, true).then(setLiveData).catch(() => {}), 120000)
    return () => window.clearInterval(timer)
  }, [data, orderId])
  const product = data?.order?.product || data?.order?.products?.[0] || {}
  const image = Array.isArray(product.images) ? product.images[0] : product.image
  const canQuery = user?.primaryRole !== 'seller'
  const copyTracking = () => data?.tracking?.trackingNumber && navigator.clipboard?.writeText(data.tracking.trackingNumber)
  const statusTone = useMemo(() => ['delayed', 'exception', 'delivery_attempted'].includes(data?.tracking?.status) ? 'warning' : data?.tracking?.status === 'delivered' ? 'success' : 'active', [data?.tracking?.status])

  if (query.loading && !data) return <AppShell><main className="tracking-page container"><div className="tracking-loading"><Package /><p>Loading shipment tracking…</p></div></main></AppShell>
  if (query.error && !data) return <AppShell><main className="tracking-page container"><Link className="tracking-back" to="/orders"><ArrowLeft />Orders</Link><div className="tracking-error"><AlertCircle /><h1>Tracking unavailable</h1><p>{query.error.message}</p></div></main></AppShell>
  const { order, tracking } = data
  return <AppShell><main className="tracking-page container">
    <Link className="tracking-back" to="/orders"><ArrowLeft />Back to orders</Link>
    <section className="tracking-hero">
      <div className="tracking-order-summary">{image ? <img src={image} alt="" /> : <span><Package /></span>}<div><small>{order.orderType === 'sample' ? 'Sample order' : 'Trade order'}</small><h1>Order #{order.orderNumber}</h1><p>{product.name || order.products?.[0]?.name || 'Marketplace order'} <i>•</i> {order.seller?.companyName || 'EsyGlob seller'}</p></div></div>
      <div className={`tracking-current tracking-current--${statusTone}`}><span>Current status</span><strong>{title(tracking.status)}</strong>{tracking.currentLocation && <small><MapPin />{tracking.currentLocation}</small>}</div>
    </section>
    <section className="tracking-facts">
      <div><span><Truck />Tracking number</span>{tracking.trackingNumber ? <strong>{tracking.trackingNumber}<button onClick={copyTracking} aria-label="Copy tracking number"><Copy /></button></strong> : <strong className="tracking-pending">Tracking number is being generated</strong>}</div>
      <div><span><CalendarDays />Estimated delivery</span><strong>{tracking.estimatedDelivery ? dateOnly(tracking.estimatedDelivery) : 'Estimated delivery will appear once available.'}</strong></div>
      <div><span><Package />Shipping service</span><strong>{tracking.service || 'EsyGlob Logistics — Standard'}</strong>{tracking.shippingPartner && <small>Shipping partner: {tracking.shippingPartner}</small>}</div>
      {tracking.trackingUrl && <a href={tracking.trackingUrl} target="_blank" rel="noreferrer">View shipment details <ExternalLink /></a>}
    </section>
    {tracking.bookingError && <div className="tracking-notice"><Clock3 /><div><strong>Shipment booking is taking longer than expected.</strong><p>We’ll keep the shipment record safe while booking is retried.</p></div></div>}
    <div className="tracking-layout">
      <section className="tracking-history"><header><div><small>Shipment journey</small><h2>Tracking timeline</h2></div>{tracking.lastUpdatedAt && <span>Updated {dateTime(tracking.lastUpdatedAt)}</span>}</header><Timeline order={order} tracking={tracking} /></section>
      <aside className="tracking-side"><section><Truck /><h2>Shipping details</h2><dl><div><dt>Service</dt><dd>{tracking.service}</dd></div><div><dt>AWB</dt><dd>{tracking.awb || 'Generating'}</dd></div>{tracking.currentLocation && <div><dt>Current location</dt><dd>{tracking.currentLocation}</dd></div>}</dl></section>
        {canQuery && <button className="tracking-help" onClick={() => setDialog(true)}><span><HelpCircle /><b>Need help with this shipment?</b><small>Raise an order-specific query</small></span><ChevronRight /></button>}
      </aside>
    </div>
    {canQuery && <div className="tracking-mobile-action"><button className="button button--primary" onClick={() => setDialog(true)}><HelpCircle />Raise a query</button></div>}
    {dialog && <QueryDialog orderId={orderId} onClose={() => setDialog(false)} />}
  </main></AppShell>
}
