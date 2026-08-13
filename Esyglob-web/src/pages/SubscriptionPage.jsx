/* eslint-disable react-hooks/set-state-in-effect */
import { CalendarClock, Check, CreditCard, Crown, HelpCircle, History, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changeSubscriptionPlan, createSubscriptionOrder, fetchSubscription, fetchSubscriptionPlans, setSubscriptionAutoRenew, verifySubscriptionPayment } from '../api/verification'
import AppShell from '../components/AppShell'
import { Money } from '../components/TradeUI'
import { useAuth } from '../auth/auth-context'
import { publishAICredits } from '../components/AICredits'

const features = (plan) => Array.isArray(plan.features) ? plan.features : [...(plan.features?.highlighted || []), ...(plan.features?.core || [])].slice(0, 8)

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('Secure checkout could not be loaded.'))
    document.head.appendChild(script)
  })
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = user?.primaryRole === 'seller' ? 'seller' : 'buyer'
  const [data, setData] = useState(null)
  const [plans, setPlans] = useState([])
  const [duration, setDuration] = useState('monthly')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [terms, setTerms] = useState(false)
  const [planInfo, setPlanInfo] = useState(null)
  const load = useCallback(async () => {
    const [current, catalog] = await Promise.all([fetchSubscription(role), fetchSubscriptionPlans(role)])
    setData(current)
    setPlans(catalog?.plans || catalog || [])
    return current
  }, [role])
  useEffect(() => { load().catch((error) => setMessage(error.message)) }, [load])

  async function checkout(plan) {
    if (!terms) return setMessage('Accept the subscription and recurring billing terms to continue.')
    setBusy(true)
    setMessage('')
    try {
      await loadRazorpay()
      const planType = plan.key || plan.planType
      const order = await createSubscriptionOrder({ planType, duration })
      const razorpay = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'EsyGlob',
        description: `${plan.name} subscription`,
        order_id: order.orderId,
        prefill: order.user,
        handler: async (response) => {
          try {
            await verifySubscriptionPayment({
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
              planType,
              duration,
            })
            setMessage('Payment verified. Your membership is active.')
            const refreshed = await load()
            publishAICredits(refreshed?.credits)
            navigate('/payment/success', { state: { kind: 'subscription', reference: order.orderId, amount: Number(order.amount || 0) / 100, currency: order.currency, returnTo: '/subscriptions' } })
          } catch (error) {
            navigate('/payment/failure', { state: { kind: 'subscription', reference: order.orderId, amount: Number(order.amount || 0) / 100, currency: order.currency, returnTo: '/subscriptions', retryTo: '/subscriptions', message: error.message } })
          }
        },
        modal: { ondismiss: () => navigate('/payment/failure', { state: { kind: 'subscription', reference: order.orderId, amount: Number(order.amount || 0) / 100, currency: order.currency, returnTo: '/subscriptions', retryTo: '/subscriptions', cancelled: true } }) },
      })
      razorpay.on('payment.failed', (event) => navigate('/payment/failure', { state: { kind: 'subscription', reference: order.orderId, amount: Number(order.amount || 0) / 100, currency: order.currency, returnTo: '/subscriptions', retryTo: '/subscriptions', message: event.error?.description || 'Payment failed. Please retry.' } }))
      razorpay.open()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function selectFreePlan(plan) { setBusy(true); setMessage(''); try { const refreshed = await changeSubscriptionPlan({ planType: plan.key, duration }); setData(refreshed); publishAICredits(refreshed?.credits); setMessage(`${plan.name} is now your current plan.`) } catch (error) { setMessage(error.message) } finally { setBusy(false) } }

  const subscription = data?.subscription || {}
  const current = data?.plan || {}
  return <AppShell><main className="container subscription-page">
    <header className="subscription-hero"><Crown /><div><span className="eyebrow">{role === 'seller' ? 'Seller membership' : 'Buyer membership'}</span><h1>Grow with the right plan</h1><p>Sourcing tools, AI credits and account limits in one transparent membership.</p></div></header>
    {message && <div className="verification-alert">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    <section className="subscription-current">
      <div><ShieldCheck /><span><small>Current plan</small><b>{current.name || subscription[role === 'seller' ? 'sellerPlan' : 'buyerPlan'] || `Free ${role}`}</b></span></div>
      <div><CalendarClock /><span><small>Valid until</small><b>{subscription.expiryDate ? new Date(subscription.expiryDate).toLocaleDateString() : 'No expiry'}</b></span></div>
      <div><RefreshCw /><span><small>Auto renewal</small><b>{subscription.autoRenew ? 'Enabled' : 'Disabled'}</b></span><button onClick={async () => { await setSubscriptionAutoRenew(!subscription.autoRenew); load() }}>Change</button></div>
    </section>
    <div className="billing-toggle">{['monthly', 'quarterly', 'yearly'].map((item) => <button className={duration === item ? 'active' : ''} onClick={() => setDuration(item)} key={item}>{item}</button>)}</div>
    <label className="check-field module-panel"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> I accept the subscription, renewal and recurring billing terms.</label>
    <section className="plan-grid">{plans.map((plan) => {
      const priceEntry = plan.prices?.[duration]
      const price = priceEntry?.amount ?? priceEntry ?? 0
      const priceCurrency = priceEntry?.currency || plan.currency || 'INR'
      const isCurrent = plan.key === subscription.planKey || plan.key === subscription[role === 'seller' ? 'sellerPlan' : 'buyerPlan']
      const planCredits = Number(plan.aiCredits?.monthly ?? plan.aiCredits ?? 0)
      const months = duration === 'yearly' ? 12 : duration === 'quarterly' ? 3 : 1
      const monthlyPrice = Number(plan.prices?.monthly?.amount ?? plan.prices?.monthly ?? price)
      const savings = Math.max(0, (monthlyPrice * months) - Number(price || 0))
      return <article className={`${plan.isPopular || plan.recommended ? 'recommended ' : ''}${isCurrent ? 'current' : ''}`} key={plan.key || plan.name}>
        {(plan.isPopular || plan.recommended) && <em>Recommended</em>}
        {isCurrent && <span className="current-plan-badge"><Check /> Current plan</span>}<button type="button" className="plan-info-button" aria-label={`View ${plan.name} details`} onClick={() => setPlanInfo(plan)}><HelpCircle /></button><h2>{plan.name}</h2><p>{plan.description || 'Built for global marketplace growth.'}</p>
        <strong><Money value={price} currency={priceCurrency} /><small> / {duration}</small></strong>
        <div className="ai-plan-credit"><Sparkles /><span><b>{planCredits.toLocaleString()} AI credits</b><small>Approximately {planCredits.toLocaleString()} AI requests · instant activation</small></span></div>
        {savings > 0 && <small className="ai-plan-saving">Save <Money value={savings} currency={priceCurrency} /> with {duration} billing</small>}
        <ul>{features(plan).map((feature) => <li key={String(feature)}><Check />{typeof feature === 'string' ? feature : feature.label}</li>)}</ul>
        <button className={`button ${isCurrent ? 'button--ghost' : 'button--primary'} button--full`} disabled={busy || isCurrent || !terms} onClick={() => Number(price) === 0 ? selectFreePlan(plan) : checkout(plan)}>{isCurrent ? 'Current plan' : Number(price) > Number(current.prices?.[duration]?.amount || 0) ? 'Upgrade' : 'Downgrade / change'}</button>
      </article>
    })}</section>
    {planInfo && <div className="plan-info-popover" role="dialog" aria-modal="true" aria-labelledby="plan-info-title"><button className="plan-info-backdrop" onClick={() => setPlanInfo(null)} aria-label="Close plan details" /><section><header><div><span>{planInfo.subtitle || 'Membership plan'}</span><h2 id="plan-info-title">{planInfo.name}</h2></div><button onClick={() => setPlanInfo(null)} aria-label="Close"><X /></button></header><p>{planInfo.description}</p><div className="plan-info-prices">{['monthly','quarterly','yearly'].map(cycle => <span key={cycle}><small>{cycle}</small><b><Money value={planInfo.prices?.[cycle]?.amount ?? planInfo.prices?.[cycle] ?? 0} currency={planInfo.prices?.[cycle]?.currency || 'INR'} /></b></span>)}</div><div className="ai-plan-credit"><Sparkles /><span><b>{Number(planInfo.aiCredits?.monthly ?? planInfo.aiCredits ?? 0).toLocaleString()} AI credits monthly</b><small>{planInfo.aiCredits?.rollover ? `Rollover up to ${Number(planInfo.aiCredits.maxRollover || 0).toLocaleString()}` : 'Credits refresh with the plan cycle'}</small></span></div><ul>{features(planInfo).map(feature => <li key={String(feature)}><Check />{typeof feature === 'string' ? feature : feature.label}</li>)}</ul><button className="button button--secondary button--full" onClick={() => setPlanInfo(null)}>Close</button></section></div>}
    <section className="module-panel payment-history"><h2><History />Payment history</h2>{subscription.paymentHistoryIds?.length ? <div>{subscription.paymentHistoryIds.map((item) => <p key={item._id || item}><CreditCard /><span><b>{item.description || 'Subscription payment'}</b><small>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : String(item)}</small></span><strong><Money value={item.amount} currency={item.currency || 'INR'} /></strong></p>)}</div> : <p className="factory-note">No subscription payments yet.</p>}</section>
  </main></AppShell>
}
