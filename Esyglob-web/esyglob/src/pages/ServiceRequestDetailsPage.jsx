import { ArrowLeft, CalendarDays, CheckCircle2, CreditCard, Download, FileText, RefreshCw, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { cancelServiceRequest, fetchServiceRequest, initiateServicePayment, loadRazorpay, retryServiceBooking, syncServiceTracking, updateServicePaymentStatus, verifyServicePayment } from '../api/services'
import AppShell from '../components/AppShell'
import { useToast } from '../components/EnterpriseUX'
import ProviderBrand from '../components/ProviderBrand'
import { DetailItem, Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { TradeSkeleton } from './RfqsPage'

export default function ServiceRequestDetailsPage() {
  const { requestId } = useParams()
  const location = useLocation()
  const query = useAsyncData(useCallback(() => fetchServiceRequest(requestId), [requestId]))
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [instantResult, setInstantResult] = useState(() => location.state?.paymentResult || null)
  const request = query.data || instantResult?.request || {}
  const booking = typeof request.bookingId === 'object' ? request.bookingId : instantResult?.booking || null
  const provider = request.provider || booking || {}

  async function cancel() {
    if (!window.confirm('Cancel this service request?')) return
    setBusy('cancel')
    setError('')
    try {
      await cancelServiceRequest(requestId)
      toast.success('Booking cancelled.')
      await query.reload()
    } catch (next) { setError(next.message) }
    finally { setBusy('') }
  }

  async function syncTracking() {
    setBusy('tracking')
    setError('')
    const toastId = toast.loading('Synchronizing provider tracking…')
    try {
      const result = await syncServiceTracking(requestId)
      toast.update(toastId, { type: 'success', message: `Tracking updated: ${String(result.booking?.status || 'current').replaceAll('_', ' ')}` })
      await query.reload()
    } catch (next) {
      setError(next.message)
      toast.update(toastId, { type: 'error', message: next.message })
    } finally { setBusy('') }
  }

  async function retryBooking() {
    setBusy('booking')
    setError('')
    const toastId = toast.loading('Retrying secure provider booking…')
    try {
      const result = await retryServiceBooking(requestId)
      toast.update(toastId, {
        type: 'success',
        message: result.booking?.status === 'confirmed' ? 'Provider booking confirmed.' : 'Booking resubmitted; confirmation is pending.',
      })
      await query.reload()
    } catch (next) {
      setError(next.message)
      toast.update(toastId, { type: 'error', message: next.message })
    } finally { setBusy('') }
  }

  async function pay() {
    setBusy('pay')
    setError('')
    try {
      if (!await loadRazorpay()) throw new Error('Secure checkout could not be loaded. Check your connection and retry.')
      const session = await initiateServicePayment(requestId)
      const checkout = new window.Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        order_id: session.razorpayOrderId,
        name: 'EsyGlob',
        description: request.serviceTitle,
        prefill: { name: request.contactName, email: request.contactEmail, contact: request.contactPhone },
        handler: async result => {
          try {
            const verified = await verifyServicePayment(requestId, {
              razorpayPaymentId: result.razorpay_payment_id,
              razorpayOrderId: result.razorpay_order_id,
              razorpaySignature: result.razorpay_signature,
            })
            setInstantResult(verified)
            toast.success('Payment verified and provider booking submitted.')
            await query.reload()
          } catch (next) { setError(next.message) }
          finally { setBusy('') }
        },
        modal: { ondismiss: async () => { await updateServicePaymentStatus(requestId, 'cancelled').catch(() => {}); setBusy(''); query.reload() } },
        theme: { color: '#f26a21' },
      })
      checkout.on('payment.failed', async result => {
        await updateServicePaymentStatus(requestId, 'failed').catch(() => {})
        setError(result.error?.description || 'Payment failed.')
        setBusy('')
        query.reload()
      })
      checkout.open()
    } catch (next) { setError(next.message); setBusy('') }
  }

  if (query.loading && !instantResult) return <AppShell><div className="container module-page"><TradeSkeleton /></div></AppShell>
  if (query.error && !instantResult) return <AppShell><div className="container module-page"><p className="inline-error">{query.error.message}</p></div></AppShell>

  const canCancel = ['draft', 'submitted', 'under_review'].includes(request.status) && request.paymentStatus !== 'paid'
  const invoice = typeof request.invoiceId === 'object' ? request.invoiceId : instantResult?.invoice || request.invoiceId
  const invoiceUrl = typeof invoice === 'object' ? invoice.documentUrl : ''
  const timeline = booking?.timeline?.length ? booking.timeline : request.history || []
  const providerKey = provider.key || booking?.providerKey

  return <AppShell><div className="container service-request-detail">
    <Link className="back-link" to="/services/requests"><ArrowLeft /> My Services</Link>
    <header><div><span className="eyebrow">{request.serviceTitle}</span><h1>{request.requestNumber}</h1><p>Created {new Date(request.createdAt).toLocaleString()}</p></div><div><StatusBadge status={request.status} /><StatusBadge status={`payment_${request.paymentStatus}`} /></div></header>
    {(location.state?.paymentComplete || instantResult) && <section className="booking-confirmation-banner"><CheckCircle2 /><div><span>Payment verified</span><h2>Your booking is confirmed in EsyGlob</h2><p>Invoice, provider booking, tracking, and payment records are available below.</p></div></section>}
    {error && <p className="action-error">{error}</p>}
    <div className="service-request-layout"><div>
      {provider.name || provider.providerName ? <section className="module-panel provider-booking-panel">
        <div className="compact-heading"><h2><ProviderBrand providerKey={providerKey} /> Provider booking</h2><StatusBadge status={booking?.status || request.status} /></div>
        <dl className="trade-detail-grid">
          <DetailItem label="Provider">{provider.name || provider.providerName}</DetailItem>
          <DetailItem label="Service level">{provider.serviceName}</DetailItem>
          <DetailItem label="Booking ID">{booking?.bookingNumber || request.requestNumber}</DetailItem>
          <DetailItem label="Provider reference">{provider.referenceNumber || booking?.providerReference || 'Confirmation pending'}</DetailItem>
          <DetailItem label="Tracking number">{provider.trackingNumber || booking?.trackingNumber || 'Assigned after confirmation'}</DetailItem>
          <DetailItem label="ETA">{provider.eta || booking?.eta ? new Date(provider.eta || booking.eta).toLocaleString() : 'Awaiting provider ETA'}</DetailItem>
          <DetailItem label="Last synchronized">{booking?.lastProviderSyncAt ? new Date(booking.lastProviderSyncAt).toLocaleString() : 'Not synchronized'}</DetailItem>
        </dl>
        <div className="button-row">
          {(provider.trackingNumber || booking?.trackingNumber) && <button className="button button--secondary" disabled={Boolean(busy)} onClick={syncTracking}><RefreshCw /> {busy === 'tracking' ? 'Synchronizing…' : 'Refresh live tracking'}</button>}
          {request.paymentStatus === 'paid' && ['booking_pending', 'failed'].includes(booking?.status || request.status) && <button className="button button--primary" disabled={Boolean(busy)} onClick={retryBooking}><Truck /> {busy === 'booking' ? 'Retrying…' : 'Retry provider booking'}</button>}
        </div>
      </section> : null}
      <section className="module-panel"><div className="compact-heading"><h2>Request details</h2><span>{request.role}</span></div><dl className="trade-detail-grid"><DetailItem label="Subject">{request.subject}</DetailItem><DetailItem label="Contact">{request.contactName}</DetailItem><DetailItem label="Company">{request.companyName}</DetailItem><DetailItem label="Email">{request.contactEmail}</DetailItem><DetailItem label="Expected completion">{request.expectedCompletionDate ? new Date(request.expectedCompletionDate).toLocaleDateString() : 'Awaiting confirmation'}</DetailItem></dl><p>{request.details}</p></section>
      <section className="module-panel"><h2>Booking information</h2><dl className="trade-detail-grid">{flattenRequirements(request.requirements).map(([key, value]) => <DetailItem key={key} label={key.replaceAll(/([A-Z])/g, ' $1').replaceAll(/[._]/g, ' ')}>{String(value)}</DetailItem>)}</dl></section>
      {request.documents?.length > 0 && <section className="module-panel"><h2>Documents</h2><div className="service-documents">{request.documents.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={item._id || index}><FileText /><span><b>{item.name || `Document ${index + 1}`}</b><small>{item.status}</small></span><Download /></a>)}</div></section>}
    </div><aside>
      <section className="module-panel service-payment-card">
        {providerKey ? <ProviderBrand providerKey={providerKey} compact /> : <ShieldCheck />}
        <h2>Payment & invoice</h2>
        {typeof invoice === 'object' && <div className="invoice-reference"><small>Invoice</small><b>{invoice.invoiceNumber}</b></div>}
        <div className="quote-breakdown"><span>Provider price <b><Money value={request.pricing?.baseCost} currency={request.pricing?.currency} /></b></span><span>Platform fee <b><Money value={request.pricing?.platformFee} currency={request.pricing?.currency} /></b></span><span>GST <b><Money value={request.pricing?.gstAmount} currency={request.pricing?.currency} /></b></span><strong>Total <b><Money value={request.pricing?.totalPayable} currency={request.pricing?.currency} /></b></strong></div>
        {request.paymentStatus === 'paid' ? <p className="payment-complete"><CheckCircle2 /> Payment verified</p> : request.status !== 'cancelled' && <button className="button button--primary button--full" onClick={pay} disabled={Boolean(busy)}><CreditCard /> {busy === 'pay' ? 'Opening checkout…' : 'Pay securely'}</button>}
        {invoiceUrl && <a className="button button--secondary button--full" href={invoiceUrl} target="_blank" rel="noreferrer"><Download /> Download invoice</a>}
        {canCancel && <button className="button danger-button button--full" onClick={cancel} disabled={Boolean(busy)}><XCircle /> Cancel booking</button>}
      </section>
      <section className="module-panel"><h2><CalendarDays /> Status timeline</h2><div className="service-timeline">{timeline.map((item, index) => <article key={item._id || `${item.status}-${index}`}><i><CheckCircle2 /></i><div><b>{String(item.status).replaceAll('_', ' ')}</b><p>{item.note || item.message}</p><small>{new Date(item.occurredAt || item.createdAt).toLocaleString()}</small></div></article>)}</div></section>
    </aside></div>
  </div></AppShell>
}

function flattenRequirements(value, prefix = '') {
  return Object.entries(value || {}).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (item && typeof item === 'object' && !Array.isArray(item)) return flattenRequirements(item, path)
    return item === '' || item == null ? [] : [[path, Array.isArray(item) ? item.join(', ') : item]]
  })
}
