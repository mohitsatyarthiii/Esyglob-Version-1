import { AlertCircle, CheckCircle2, Clock3, CreditCard, LifeBuoy, RefreshCw } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { Money } from '../components/TradeUI'

export default function PaymentResultPage({ status }) {
  const location = useLocation()
  const [params] = useSearchParams()
  const success = status === 'success'
  const state = location.state || {}
  const reference = state.reference || params.get('reference') || ''
  const amount = Number(state.amount ?? params.get('amount'))
  const currency = state.currency || params.get('currency') || 'INR'
  const kind = state.kind || params.get('kind') || 'payment'
  const cancelled = state.cancelled === true || params.get('cancelled') === 'true'
  const rawReturn = state.returnTo || params.get('returnTo') || '/orders'
  const returnTo = String(rawReturn).startsWith('/') && !String(rawReturn).startsWith('//') ? rawReturn : '/orders'
  const retryTo = state.retryTo || returnTo
  const occurredAt = state.occurredAt || new Date().toISOString()

  return <AppShell><main className={`container payment-result payment-result--${success ? 'success' : 'failure'}`}>
    <section className="payment-result-card">
      <div className="payment-result-icon">{success ? <CheckCircle2 /> : <AlertCircle />}</div>
      <span className="eyebrow">Secure Razorpay checkout</span>
      <h1>{success ? 'Payment Successful' : cancelled ? 'Payment Cancelled' : 'Payment Failed'}</h1>
      <p>{success ? 'Razorpay verified the payment and EsyGlob updated your account securely.' : cancelled ? 'No payment was completed. Your saved order can be reopened and paid when you are ready.' : state.message || 'The payment was not verified, so no paid status or fulfillment was applied.'}</p>
      <dl>
        <div><dt><CreditCard /> Status</dt><dd>{success ? 'Verified' : cancelled ? 'Cancelled' : 'Not completed'}</dd></div>
        {reference && <div><dt>Reference</dt><dd>{reference}</dd></div>}
        <div><dt>Payment for</dt><dd>{String(kind).replaceAll('_', ' ')}</dd></div>
        {Number.isFinite(amount) && amount >= 0 && <div><dt>Amount</dt><dd><Money value={amount} currency={currency} /></dd></div>}
        <div><dt><Clock3 /> Date & time</dt><dd>{new Date(occurredAt).toLocaleString()}</dd></div>
      </dl>
      <div className="payment-result-actions">
        {!success && <Link className="button button--primary" to={retryTo}><RefreshCw /> Retry payment</Link>}
        <Link className={`button ${success ? 'button--primary' : 'button--secondary'}`} to={returnTo}>{success ? 'Continue' : 'Return to order'}</Link>
        <Link className="payment-help-link" to="/services"><LifeBuoy /> Get help</Link>
      </div>
      <small>The backend remains the source of truth for payment status. Do not share gateway credentials or signatures.</small>
    </section>
  </main></AppShell>
}
