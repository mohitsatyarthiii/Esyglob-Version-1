import { BarChart3, CalendarClock, Gift, Plus, Power, Tag, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { createCoupon, deleteCoupon, fetchCouponAnalytics, fetchCoupons, fetchGiftCards, issueGiftCard, purchaseGiftCard, updateCoupon, verifyGiftCardPurchase } from '../api/promotions'
import { CURRENCIES } from '../preferences/currency-context'
import { loadRazorpay } from '../api/services'

const initialCoupon = {
  code: '', name: '', description: '', discountType: 'percentage', value: '', maximumDiscount: '',
  minimumOrderValue: '', currency: 'INR', scope: 'platform', productIds: '', categoryIds: '',
  countryCodes: '', currencyCodes: '', campaignType: 'standard', startsAt: '', expiresAt: '',
  usageLimit: '', perUserUsageLimit: '1', priority: '0', stackable: false, status: 'active',
}

const split = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean)
const numberOrNull = value => value === '' ? null : Number(value)

export default function PromotionsPage() {
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('admin')
  const canManageCoupons = isAdmin || user?.roles?.includes('seller')
  const [version, setVersion] = useState(0)
  const query = useAsyncData(useCallback(async () => {
    const [coupons, analytics, gifts] = await Promise.all([
      canManageCoupons ? fetchCoupons() : Promise.resolve({ coupons: [] }),
      canManageCoupons ? fetchCouponAnalytics() : Promise.resolve({ summary: {} }),
      fetchGiftCards(Boolean(isAdmin)),
    ])
    return { coupons: coupons.coupons || [], analytics, gifts: gifts.cards || [], transactions: gifts.transactions || [], version }
  }, [canManageCoupons, isAdmin, version]))
  const [form, setForm] = useState({ ...initialCoupon, scope: isAdmin ? 'platform' : 'seller' })
  const [giftForm, setGiftForm] = useState({ amount: '', currency: 'INR', label: '', recipientEmail: '', expiresAt: '' })
  const [issuedCode, setIssuedCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = () => setVersion(value => value + 1)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await createCoupon({
        ...form,
        value: Number(form.value), maximumDiscount: numberOrNull(form.maximumDiscount),
        minimumOrderValue: Number(form.minimumOrderValue || 0), usageLimit: numberOrNull(form.usageLimit),
        perUserUsageLimit: Number(form.perUserUsageLimit || 1), priority: Number(form.priority || 0),
        productIds: split(form.productIds), categoryIds: split(form.categoryIds),
        countryCodes: split(form.countryCodes), currencyCodes: split(form.currencyCodes),
        startsAt: form.startsAt || new Date().toISOString(), expiresAt: form.expiresAt || null,
      })
      setForm({ ...initialCoupon, scope: isAdmin ? 'platform' : 'seller' }); reload()
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  async function toggle(coupon) {
    setError('')
    try { await updateCoupon(coupon._id, { status: coupon.status === 'active' ? 'inactive' : 'active' }); reload() }
    catch (next) { setError(next.message) }
  }
  async function remove(coupon) {
    setError('')
    try { await deleteCoupon(coupon._id); reload() } catch (next) { setError(next.message) }
  }
  async function createGift(event) {
    event.preventDefault(); setBusy(true); setError(''); setIssuedCode('')
    try {
      const result = await issueGiftCard({ ...giftForm, amount: Number(giftForm.amount), expiresAt: giftForm.expiresAt || null })
      setIssuedCode(result.code); setGiftForm({ amount: '', currency: 'INR', label: '', recipientEmail: '', expiresAt: '' }); reload()
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  async function buyGift(event) {
    event.preventDefault(); setBusy(true); setError(''); setIssuedCode('')
    try {
      if (!await loadRazorpay()) throw new Error('Secure payment could not be loaded')
      const session = await purchaseGiftCard({ ...giftForm, amount: Number(giftForm.amount), expiresAt: giftForm.expiresAt || null })
      await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: session.keyId, amount: session.amount, currency: session.currency,
          name: 'EsyGlob', description: 'Digital gift card', order_id: session.razorpayOrderId,
          handler: async result => {
            try {
              const verified = await verifyGiftCardPurchase({
                giftCardId: session.giftCardId,
                razorpayPaymentId: result.razorpay_payment_id,
                razorpayOrderId: result.razorpay_order_id,
                razorpaySignature: result.razorpay_signature,
              })
              setIssuedCode(verified.code); resolve()
            } catch (next) { reject(next) }
          },
          modal: { ondismiss: () => reject(new Error('Gift card payment was cancelled')) },
          theme: { color: '#f26a21' },
        })
        checkout.on('payment.failed', result => reject(new Error(result.error?.description || 'Gift card payment failed')))
        checkout.open()
      })
      setGiftForm({ amount: '', currency: 'INR', label: '', recipientEmail: '', expiresAt: '' }); reload()
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }

  const summary = query.data?.analytics?.summary || {}
  return <AppShell><main className="container module-page promotions-page">
    <header className="promotion-hero"><div><span className="eyebrow">{isAdmin ? 'Platform commerce control' : 'Seller growth tools'}</span><h1>Coupons & Gift Cards</h1><p>Create secure campaigns, control eligibility and review real redemption performance.</p></div><Tag /></header>
    {error && <p className="action-error">{error}</p>}
    <section className="promotion-stats">
      <article><Tag /><span><b>{query.data?.coupons?.length || 0}</b>Campaigns</span></article>
      <article><BarChart3 /><span><b>{summary.redemptions || 0}</b>Redemptions</span></article>
      <article><Money value={summary.totalDiscount || 0} currency="INR" /><span>Total discount</span></article>
    </section>
    <div className={`promotion-layout ${canManageCoupons ? '' : 'promotion-layout--gift-only'}`}>
      {canManageCoupons && <form className="module-panel promotion-form" onSubmit={submit}>
        <div className="compact-heading"><h2><Plus /> Create coupon</h2><small>All rules are enforced by the backend.</small></div>
        <div className="form-grid"><label>Coupon code<input required value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label><label>Campaign name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label></div>
        <label>Description<textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <div className="form-grid form-grid--3"><label>Discount type<select value={form.discountType} onChange={event => setForm({ ...form, discountType: event.target.value })}><option value="percentage">Percentage</option><option value="fixed_amount">Fixed amount</option><option value="free_shipping">Free shipping</option></select></label><label>Value<input type="number" min="0" required value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} /></label><label>Maximum discount<input type="number" min="0" value={form.maximumDiscount} onChange={event => setForm({ ...form, maximumDiscount: event.target.value })} /></label></div>
        <div className="form-grid form-grid--3"><label>Minimum order<input type="number" min="0" value={form.minimumOrderValue} onChange={event => setForm({ ...form, minimumOrderValue: event.target.value })} /></label><label>Currency<select value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label><label>Scope<select value={form.scope} onChange={event => setForm({ ...form, scope: event.target.value })} disabled={!isAdmin}><option value="platform">Platform</option><option value="product">Products</option><option value="category">Categories</option><option value="seller">Seller</option><option value="manufacturer">Manufacturer</option><option value="subscription">Subscription</option></select></label></div>
        <div className="form-grid"><label>Product IDs <small>Comma separated</small><input value={form.productIds} onChange={event => setForm({ ...form, productIds: event.target.value })} /></label><label>Category IDs <small>Comma separated</small><input value={form.categoryIds} onChange={event => setForm({ ...form, categoryIds: event.target.value })} /></label><label>Countries <small>ISO codes</small><input value={form.countryCodes} onChange={event => setForm({ ...form, countryCodes: event.target.value.toUpperCase() })} /></label><label>Allowed currencies<input value={form.currencyCodes} onChange={event => setForm({ ...form, currencyCodes: event.target.value.toUpperCase() })} /></label></div>
        <div className="form-grid form-grid--3"><label>Starts at<input type="datetime-local" value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })} /></label><label>Expires at<input type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value })} /></label><label>Campaign<select value={form.campaignType} onChange={event => setForm({ ...form, campaignType: event.target.value })}>{['standard','limited_time','festival','referral','first_order','subscription'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="form-grid form-grid--3"><label>Total usage limit<input type="number" min="1" value={form.usageLimit} onChange={event => setForm({ ...form, usageLimit: event.target.value })} /></label><label>Per-user limit<input type="number" min="1" value={form.perUserUsageLimit} onChange={event => setForm({ ...form, perUserUsageLimit: event.target.value })} /></label><label>Priority<input type="number" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} /></label></div>
        <label className="check-field"><input type="checkbox" checked={form.stackable} onChange={event => setForm({ ...form, stackable: event.target.checked })} /> Allow stacking with compatible campaigns</label>
        <button className="button button--primary button--full" disabled={busy}><Plus /> {busy ? 'Creating…' : 'Create campaign'}</button>
      </form>}
      <aside>
        {canManageCoupons && <section className="module-panel promotion-list"><h2>Campaigns</h2>{query.loading ? <p>Loading campaigns…</p> : query.data?.coupons?.length ? query.data.coupons.map(coupon => <article key={coupon._id}><header><span><b>{coupon.code}</b><small>{coupon.name}</small></span><em className={coupon.status}>{coupon.status}</em></header><p>{coupon.discountType === 'percentage' ? `${coupon.value}% off` : coupon.discountType === 'free_shipping' ? 'Free shipping' : `${coupon.currency} ${coupon.value} off`} · Used {coupon.redemptionCount || 0}{coupon.usageLimit ? `/${coupon.usageLimit}` : ''}</p><footer><button onClick={() => toggle(coupon)}><Power /> {coupon.status === 'active' ? 'Deactivate' : 'Activate'}</button><button onClick={() => remove(coupon)}><Trash2 /> Delete</button></footer></article>) : <p>No campaigns yet.</p>}</section>}
        <form className="module-panel gift-card-form" onSubmit={isAdmin ? createGift : buyGift}><h2><Gift /> {isAdmin ? 'Issue gift card' : 'Purchase gift card'}</h2><div className="form-grid"><label>Value<input type="number" min="100" required value={giftForm.amount} onChange={event => setGiftForm({ ...giftForm, amount: event.target.value })} /></label><label>Currency<select value={giftForm.currency} onChange={event => setGiftForm({ ...giftForm, currency: event.target.value })}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label></div><label>Label<input value={giftForm.label} onChange={event => setGiftForm({ ...giftForm, label: event.target.value })} /></label><label>Recipient email<input type="email" value={giftForm.recipientEmail} onChange={event => setGiftForm({ ...giftForm, recipientEmail: event.target.value })} /></label><label>Expiry<input type="date" value={giftForm.expiresAt} onChange={event => setGiftForm({ ...giftForm, expiresAt: event.target.value })} /></label><button className="button button--primary button--full" disabled={busy}>{isAdmin ? 'Issue secure code' : 'Pay securely & activate'}</button>{issuedCode && <output><b>Copy this code now</b><code>{issuedCode}</code><small>For security, the full code is shown only once.</small></output>}</form>
        <section className="module-panel gift-balance-list"><h2><CalendarClock /> Gift card balances</h2>{query.data?.gifts?.map(card => <p key={card._id}><span>{card.label} · •••• {card.codeLast4}</span><b><Money value={card.balance} currency={card.currency} /></b></p>) || null}</section>
      </aside>
    </div>
  </main></AppShell>
}
