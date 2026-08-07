import { ArrowLeft, CheckCircle2, CreditCard, Gift, MapPin, ShieldCheck, Tag, Truck, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAddresses } from '../api/account'
import { fetchProductDetails } from '../api/marketplace'
import { loadRazorpay } from '../api/services'
import { createSampleOrder, createTradeOrder, fetchCheckoutQuote, initiatePayment, verifyPayment } from '../api/trade'
import AppShell from '../components/AppShell'
import { SafeImage } from '../components/MarketplaceCards'
import { Money } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

function payWithRazorpay(session, description) {
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency || 'INR',
      name: 'EsyGlob',
      description,
      order_id: session.razorpayOrderId,
      handler: async (result) => {
        try {
          await verifyPayment({
            paymentId: session.paymentId,
            razorpayPaymentId: result.razorpay_payment_id,
            razorpayOrderId: result.razorpay_order_id,
            razorpaySignature: result.razorpay_signature,
          })
          resolve()
        } catch (error) {
          reject(error)
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. Your order is saved and ready to retry.')) },
      theme: { color: '#f26a21' },
    })
    checkout.on('payment.failed', (result) => reject(new Error(result.error?.description || 'Payment failed. Please retry.')))
    checkout.open()
  })
}

export default function CheckoutPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const mode = params.get('mode') === 'sample' ? 'sample' : 'trade'
  const minimum = Math.max(1, Number(params.get('quantity') || 1))
  const [quantity, setQuantity] = useState(minimum)
  const [addressId, setAddressId] = useState('')
  const [logistics, setLogistics] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingOrderId, setPendingOrderId] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [giftCardInput, setGiftCardInput] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [giftCardCode, setGiftCardCode] = useState('')

  const base = useAsyncData(useCallback(async () => {
    const [details, addresses] = await Promise.all([fetchProductDetails(productId), fetchAddresses()])
    return { details, addresses }
  }, [productId]))
  const product = base.data?.details?.product || {}
  const addresses = base.data?.addresses || []
  const address = addresses.find((item) => resolveId(item) === addressId) || addresses.find((item) => item.isDefault) || addresses[0]
  const destination = useMemo(() => ({
    country: address?.country || 'India',
    city: address?.city || '',
    postalCode: address?.postalCode || address?.pincode || '',
  }), [address])
  const quote = useAsyncData(useCallback(() => productId
    ? fetchCheckoutQuote({
      productId,
      quantity,
      orderType: mode === 'sample' ? 'sample' : 'bulk',
      orderSubType: mode === 'sample' ? 'sample_order' : 'direct_order',
      logisticsOption: logistics || undefined,
      destination,
      couponCode: couponCode || undefined,
      giftCardCode: giftCardCode || undefined,
    })
    : Promise.reject(new Error('Product is required')), [couponCode, destination, giftCardCode, logistics, mode, productId, quantity]))
  const pricing = quote.data || {}
  const logisticsKey = logistics || pricing.selectedLogistics?.key || pricing.logisticsOptions?.[0]?.key || ''

  async function createOrder() {
    const shippingAddress = {
      fullName: address.fullName,
      name: address.fullName,
      company: address.companyName,
      email: address.email,
      phone: address.phone,
      address: address.address || address.line1,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postalCode || address.pincode,
    }
    const payload = {
      productId,
      quantity,
      quotationId: params.get('quotationId') || undefined,
      chatId: params.get('chatId') || undefined,
      destination,
      shippingAddress,
      logisticsOption: logisticsKey,
      paymentMethod: 'razorpay',
      orderType: mode === 'sample' ? 'sample' : 'bulk',
      orderSubType: mode === 'sample' ? 'sample_order' : 'direct_order',
      tradeInformation: { incoterms: 'DAP', shippingOption: logisticsKey },
      buyerNotes: notes,
      termsAccepted: true,
      couponCode: couponCode || undefined,
      giftCardCode: giftCardCode || undefined,
    }
    return mode === 'sample' ? createSampleOrder(payload) : createTradeOrder(payload)
  }

  async function place() {
    if (!address) return setError('Add a delivery address before continuing.')
    if (!terms) return setError('Accept the trade, payment and fulfillment terms to continue.')
    if (!logisticsKey) return setError('Select a logistics option to continue.')
    setBusy(true)
    setError('')
    try {
      let orderId = pendingOrderId
      if (!orderId) {
        const order = await createOrder()
        orderId = resolveId(order)
        if (!orderId) throw new Error('The order was created without a valid reference. Please contact support.')
        setPendingOrderId(orderId)
      }
      if (Number(pricing.grandTotal || 0) <= 0) {
        navigate(`/orders/${orderId}`, { replace: true, state: { paymentComplete: true } })
        return
      }
      const loaded = await loadRazorpay()
      if (!loaded) throw new Error('Secure checkout could not be loaded. Check your connection and retry.')
      const session = await initiatePayment(orderId)
      if (!session.keyId || !session.razorpayOrderId || !session.paymentId) throw new Error('Payment gateway returned an incomplete checkout session.')
      await payWithRazorpay(session, `${mode === 'sample' ? 'Sample' : 'Trade'} order payment`)
      navigate(`/orders/${orderId}`, { replace: true, state: { paymentComplete: true } })
    } catch (next) {
      setError(next.message || 'Payment could not be completed. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  if (base.loading) return <AppShell><div className="container module-page"><TradeSkeleton /></div></AppShell>
  if (base.error) return <AppShell><div className="container module-page"><p className="inline-error">{base.error.message}</p></div></AppShell>

  return <AppShell><div className="container checkout-page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Product details</button>
    <header><span className="eyebrow">Secure marketplace checkout</span><h1>{mode === 'sample' ? 'Order a sample' : 'Place direct order'}</h1><p>Confirm delivery, logistics, charges and terms, then pay without leaving checkout.</p></header>
    <div className="checkout-layout">
      <div>
        <section className="module-panel checkout-product">
          <SafeImage src={product.images?.[0] || product.image} alt={product.name} />
          <div><h2>{product.name}</h2><p>{product.sellerId?.companyName}</p><b><Money value={pricing.unitPrice || product.price} currency={pricing.currency || product.currency} /> / {product.unit || 'piece'}</b></div>
          <label>Quantity<input type="number" min={mode === 'sample' ? 1 : product.minimumOrderQuantity || minimum} value={quantity} disabled={Boolean(pendingOrderId)} onChange={(event) => setQuantity(Math.max(mode === 'sample' ? 1 : product.minimumOrderQuantity || minimum, Number(event.target.value) || minimum))} /></label>
        </section>
        <section className="module-panel">
          <div className="compact-heading"><h2><MapPin /> Delivery address</h2><Link to="/addresses">Add or edit</Link></div>
          {addresses.length ? <div className="checkout-addresses">{addresses.map((item) => <button type="button" disabled={Boolean(pendingOrderId)} className={resolveId(address) === resolveId(item) ? 'active' : ''} key={resolveId(item)} onClick={() => setAddressId(resolveId(item))}><b>{item.fullName}</b><span>{item.address || item.line1}, {item.city}, {item.country}</span>{resolveId(address) === resolveId(item) && <CheckCircle2 />}</button>)}</div> : <div className="account-empty"><MapPin /><b>No saved delivery address</b><Link className="button button--primary" to="/addresses">Add address</Link></div>}
        </section>
        <section className="module-panel">
          <h2><Truck /> Logistics option</h2>
          {quote.loading ? <p>Calculating available logistics…</p> : <div className="checkout-logistics">{pricing.logisticsOptions?.map((item, index) => {
            const key = item.key || item.id || `option-${index}`
            return <button type="button" disabled={Boolean(pendingOrderId)} className={logisticsKey === key ? 'active' : ''} key={key} onClick={() => setLogistics(key)}><span><b>{item.provider || item.label || item.name || key.replaceAll('_', ' ')}</b><small>{item.eta || item.estimatedDelivery || item.deliveryTime || 'Delivery estimate after booking'} · {item.incoterm || 'DAP'}</small></span><strong><Money value={item.amount || item.price || item.charge || 0} currency={pricing.currency} /></strong></button>
          })}</div>}
        </section>
        <section className="module-panel"><h2>Order notes</h2><textarea value={notes} disabled={Boolean(pendingOrderId)} onChange={(event) => setNotes(event.target.value)} placeholder="Packaging, labeling or delivery instructions" /></section>
        <section className="module-panel checkout-promotions">
          <h2><Tag /> Promotions</h2>
          <p>Coupons and gift cards are securely validated by EsyGlob before payment.</p>
          <div className="promotion-entry"><label><span>Coupon code</span><input value={couponInput} disabled={Boolean(pendingOrderId)} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder="Enter coupon" /></label><button className="button button--secondary" disabled={!couponInput || Boolean(pendingOrderId)} onClick={() => setCouponCode(couponInput.trim())}>Apply</button>{couponCode && <button className="icon-button" aria-label="Remove coupon" onClick={() => { setCouponCode(''); setCouponInput('') }}><X /></button>}</div>
          <div className="promotion-entry"><label><span>Gift card</span><input value={giftCardInput} disabled={Boolean(pendingOrderId)} onChange={(event) => setGiftCardInput(event.target.value.toUpperCase())} placeholder="Enter gift card code" /></label><button className="button button--secondary" disabled={!giftCardInput || Boolean(pendingOrderId)} onClick={() => setGiftCardCode(giftCardInput.trim())}>Redeem</button>{giftCardCode && <button className="icon-button" aria-label="Remove gift card" onClick={() => { setGiftCardCode(''); setGiftCardInput('') }}><X /></button>}</div>
          {pricing.appliedCoupon && <p className="promotion-success"><CheckCircle2 /> {pricing.appliedCoupon.code} applied — you save <Money value={pricing.couponDiscount} currency={pricing.currency} /></p>}
          {pricing.giftCard && <p className="promotion-success"><Gift /> Gift card ending {pricing.giftCard.codeLast4} applied.</p>}
          {quote.error && <p className="action-error">{quote.error.message}</p>}
        </section>
      </div>
      <aside className="module-panel checkout-summary">
        <ShieldCheck /><h2>Order summary</h2>
        <div className="quote-breakdown"><span>Original products <b><Money value={pricing.originalProductTotal ?? pricing.productTotal} currency={pricing.currency} /></b></span>{pricing.productSavings > 0 && <span className="saving">Product discount <b>−<Money value={pricing.productSavings} currency={pricing.currency} /></b></span>}<span>Logistics <b><Money value={pricing.logisticsCharges} currency={pricing.currency} /></b></span>{pricing.couponDiscount > 0 && <span className="saving">Coupon <b>−<Money value={pricing.couponDiscount} currency={pricing.currency} /></b></span>}<span>Platform fee <b><Money value={pricing.platformFee} currency={pricing.currency} /></b></span><span>Tax <b><Money value={pricing.gstAmount} currency={pricing.currency} /></b></span>{pricing.giftCardAmount > 0 && <span className="saving">Gift card <b>−<Money value={pricing.giftCardAmount} currency={pricing.currency} /></b></span>}<strong>Grand total <b><Money value={pricing.grandTotal} currency={pricing.currency} /></b></strong>{pricing.savings > 0 && <em className="checkout-savings">You save <Money value={pricing.savings} currency={pricing.currency} /></em>}</div>
        <label className="check-field"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> I accept the trade, payment and fulfillment terms.</label>
        {error && <p className="action-error">{error}</p>}
        {pendingOrderId && <p><CheckCircle2 /> Order saved. Complete payment to submit it to the seller.</p>}
        <button className="button button--primary button--full" onClick={place} disabled={busy || quote.loading || Boolean(quote.error) || !logisticsKey || !terms}><CreditCard /> {busy ? 'Processing…' : Number(pricing.grandTotal || 0) <= 0 ? 'Place fully covered order' : pendingOrderId ? 'Retry payment' : 'Proceed to payment'}</button>
        <small>Razorpay verifies payment before fulfillment begins.</small>
      </aside>
    </div>
  </div></AppShell>
}
