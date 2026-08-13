import { ArrowLeft, Check, CheckCircle2, CreditCard, MapPin, ShieldCheck, Truck } from 'lucide-react'
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

const EMPTY_PRODUCT = {}

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
      modal: { ondismiss: () => { const error = new Error('Payment was cancelled. Your order is saved and ready to retry.'); error.code = 'PAYMENT_CANCELLED'; reject(error) } },
      theme: { color: '#f26a21' },
    })
    checkout.on('payment.failed', (result) => reject(new Error(result.error?.description || 'Payment failed. Please retry.')))
    checkout.open()
  })
}

function isIndia(address) {
  const code = String(address?.countryCode || '').trim().toUpperCase()
  if (code) return code === 'IN'
  return ['in', 'india', 'bharat'].includes(String(address?.country || '').trim().toLowerCase())
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
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingOrderId, setPendingOrderId] = useState('')

  const base = useAsyncData(useCallback(async () => {
    const [details, addresses] = await Promise.all([fetchProductDetails(productId), fetchAddresses()])
    return { details, addresses }
  }, [productId]))
  const product = base.data?.details?.product || EMPTY_PRODUCT
  const addresses = base.data?.addresses || []
  const address = addresses.find((item) => resolveId(item) === addressId) || addresses.find((item) => item.isDefault) || addresses[0]
  const destination = useMemo(() => ({
    contactName: address?.fullName || address?.name || '',
    phone: address?.phone || '',
    email: address?.email || '',
    line1: address?.address || address?.line1 || '',
    line2: address?.line2 || '',
    country: address?.country || 'India',
    countryCode: address?.countryCode || ((address?.country || 'India').toLowerCase() === 'india' ? 'IN' : ''),
    city: address?.city || '',
    state: address?.state || '',
    postalCode: address?.postalCode || address?.pincode || '',
  }), [address])
  const international = Boolean(address) && !isIndia(address)
  const quote = useAsyncData(useCallback(() => productId && address
    ? fetchCheckoutQuote({
      productId,
      quantity,
      orderType: mode === 'sample' ? 'sample' : 'bulk',
      orderSubType: mode === 'sample' ? 'sample_order' : 'direct_order',
      logisticsOption: logistics || undefined,
      destination,
    })
    : Promise.resolve({ logisticsOptions: [], awaitingAddress: true }), [address, destination, logistics, mode, productId, quantity]))
  const pricing = quote.data || {}
  const availableOptions = pricing.logisticsOptions || []
  const logisticsKey = availableOptions.some(item => item.key === logistics) ? logistics : pricing.selectedLogistics?.key || availableOptions[0]?.key || ''
  const selectedShipping = availableOptions.find(item => item.key === logisticsKey)
  const shippingBookingAvailable = selectedShipping?.bookingAvailable !== false

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
      countryCode: address.countryCode || destination.countryCode,
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
      termsAccepted: true,
    }
    return mode === 'sample' ? createSampleOrder(payload) : createTradeOrder(payload)
  }

  async function place() {
    if (!address) return setError('Add a delivery address before continuing.')
    if (international || pricing.internationalUnsupported) return setError('Shipping is currently available only within India. International shipping is coming soon.')
    if (!terms) return setError('Accept the trade, payment and fulfillment terms to continue.')
    if (!logisticsKey) return setError('Select a logistics option to continue.')
    setBusy(true)
    setError('')
    let attemptedOrderId = pendingOrderId
    try {
      let orderId = pendingOrderId
      if (!orderId) {
        const order = await createOrder()
        orderId = resolveId(order)
        if (!orderId) throw new Error('The order was created without a valid reference. Please contact support.')
        setPendingOrderId(orderId)
      }
      attemptedOrderId = orderId
      if (Number(pricing.grandTotal || 0) <= 0) {
        navigate('/payment/success', { replace: true, state: { kind: `${mode}_order`, reference: orderId, amount: 0, currency: pricing.currency, returnTo: `/orders/${orderId}` } })
        return
      }
      const loaded = await loadRazorpay()
      if (!loaded) throw new Error('Secure checkout could not be loaded. Check your connection and retry.')
      const session = await initiatePayment(orderId)
      if (!session.keyId || !session.razorpayOrderId || !session.paymentId) throw new Error('Payment gateway returned an incomplete checkout session.')
      await payWithRazorpay(session, `${mode === 'sample' ? 'Sample' : 'Trade'} order payment`)
      navigate('/payment/success', { replace: true, state: { kind: `${mode}_order`, reference: orderId, amount: pricing.grandTotal, currency: pricing.currency, returnTo: `/orders/${orderId}` } })
    } catch (next) {
      setError(next.message || (attemptedOrderId ? 'Payment could not be completed. Your order is saved and ready to retry.' : 'Payment could not be completed. Please retry.'))
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
          <div className="checkout-shipping-heading"><h2><Truck /> Shipping</h2><p>Rates are calculated automatically from the seller's product packaging and your delivery address.</p></div>
          {international || pricing.internationalUnsupported ? <div className="checkout-shipping-unavailable checkout-shipping-international"><Truck /><div><b>International shipping coming soon</b><p>Shipping is currently available only within India. Payment is disabled for this address.</p></div></div> : quote.loading ? <><p className="checkout-calculating" aria-live="polite">Calculating shipping...</p><div className="checkout-logistics">{Array.from({ length: 2 }, (_, index) => <div className="checkout-shipping-skeleton" key={index}><i /><span><i /><i /></span><i /></div>)}</div></> : pricing.logisticsOptions?.length ? <div className="checkout-logistics" role="radiogroup" aria-label="Shipping methods">{pricing.logisticsOptions.map((item, index) => {
            const key = item.key || item.id || `option-${index}`
            const selected = logisticsKey === key
            const unavailable = item.bookingAvailable === false
            return <button type="button" role="radio" aria-checked={selected} disabled={Boolean(pendingOrderId)} className={selected ? 'active' : ''} key={key} onClick={() => setLogistics(key)}><span className="checkout-shipping-brand"><b>EsyGlob Shipping</b><small>{item.providerLabel ? `${item.providerLabel} · ` : ''}{item.label || item.name || 'Shipping'}</small></span><span className="checkout-shipping-copy"><small>{unavailable ? 'Pickup booking unavailable for this seller location' : item.eta || item.estimatedDelivery || item.deliveryTime ? `Estimated delivery: ${item.eta || item.estimatedDelivery || item.deliveryTime}` : 'Delivery estimate currently unavailable'}</small></span><strong><Money value={item.amount ?? item.price ?? item.charge} currency={pricing.currency} /></strong><i className="checkout-shipping-check">{selected ? <Check /> : null}</i></button>
          })}</div> : address ? <div className="checkout-shipping-unavailable"><Truck /><div><b>{pricing.shippingError?.code === 'PRODUCT_SHIPPING_DATA_MISSING' ? 'Shipping rate unavailable for this product' : 'Unable to calculate shipping right now. Please try again.'}</b><p>{pricing.shippingError?.message || 'Check the delivery address and pincode, then retry.'}</p><button type="button" className="button button--secondary checkout-rate-retry" onClick={quote.reload}>Retry shipping</button></div></div> : <div className="checkout-shipping-unavailable"><MapPin /><div><b>Select a delivery address</b><p>Add or select an Indian delivery address to calculate shipping.</p></div></div>}
          {logisticsKey && !shippingBookingAvailable && <p className="action-error">EsyGlob Shipping rates are available, but booking is temporarily unavailable. Payment is disabled until pickup service is restored.</p>}
        </section>
        {quote.error && <p className="action-error">{quote.error.message}</p>}
      </div>
      <aside className="module-panel checkout-summary">
        <ShieldCheck /><h2>Order summary</h2>
        <div className="quote-breakdown"><span>Original products <b><Money value={pricing.originalProductTotal ?? pricing.productTotal} currency={pricing.currency} /></b></span>{pricing.productSavings > 0 && <span className="saving">Product discount <b>−<Money value={pricing.productSavings} currency={pricing.currency} /></b></span>}<span>Logistics <b><Money value={pricing.logisticsCharges} currency={pricing.currency} /></b></span>{pricing.couponDiscount > 0 && <span className="saving">Coupon <b>−<Money value={pricing.couponDiscount} currency={pricing.currency} /></b></span>}<span>Platform fee <b><Money value={pricing.platformFee} currency={pricing.currency} /></b></span><span>Tax <b><Money value={pricing.gstAmount} currency={pricing.currency} /></b></span>{pricing.giftCardAmount > 0 && <span className="saving">Gift card <b>−<Money value={pricing.giftCardAmount} currency={pricing.currency} /></b></span>}<strong>Grand total <b><Money value={pricing.grandTotal} currency={pricing.currency} /></b></strong>{pricing.savings > 0 && <em className="checkout-savings">You save <Money value={pricing.savings} currency={pricing.currency} /></em>}</div>
        <label className="check-field"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> I accept the trade, payment and fulfillment terms.</label>
        {error && <p className="action-error">{error}</p>}
        {pendingOrderId && <p><CheckCircle2 /> Order saved. Complete payment to submit it to the seller.</p>}
        <button className="button button--primary button--full" onClick={place} disabled={busy || quote.loading || Boolean(quote.error) || international || pricing.internationalUnsupported || !logisticsKey || !shippingBookingAvailable || !terms}><CreditCard /> {busy ? 'Opening Razorpay…' : Number(pricing.grandTotal || 0) <= 0 ? 'Place fully covered order' : pendingOrderId ? 'Retry payment' : mode === 'sample' ? 'Pay & Place Sample Order' : 'Pay & Place Order'}</button>
        <small>Razorpay verifies payment before fulfillment begins.</small>
      </aside>
    </div>
  </div></AppShell>
}
