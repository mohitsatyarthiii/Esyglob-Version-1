import { ArrowLeft, Check, CheckCircle2, CreditCard, Gift, MapPin, ShieldCheck, Tag, Truck, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAddresses } from '../api/account'
import { fetchProductDetails } from '../api/marketplace'
import { loadRazorpay } from '../api/services'
import { createSampleOrder, createTradeOrder, fetchCheckoutQuote, initiatePayment, verifyPayment } from '../api/trade'
import AppShell from '../components/AppShell'
import { SafeImage } from '../components/MarketplaceCards'
import ProviderBrand from '../components/ProviderBrand'
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

function numberFrom(value) {
  const match = String(value || '').replace(',', '.').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function productParcel(product, quantity) {
  const packaging = product?.packaging || {}
  let weight = numberFrom(packaging.weight)
  const weightUnit = String(packaging.weight || '').toLowerCase()
  if (/\b(?:g|gram)/.test(weightUnit) && !/\b(?:kg|kilogram)/.test(weightUnit)) weight /= 1000
  if (/\b(?:lb|pound)/.test(weightUnit)) weight *= 0.45359237
  const dimensions = String(packaging.dimensions || '').replaceAll(',', '.').match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || []
  if (!weight || dimensions.length !== 3 || dimensions.some(value => !value)) return null
  const dimensionUnit = String(packaging.dimensions || '').toLowerCase()
  const multiplier = /\bmm\b|millimet/.test(dimensionUnit) ? 0.1 : /\b(?:in|inch)/.test(dimensionUnit) ? 2.54 : /\b(?:m|metre|meter)s?\b/.test(dimensionUnit) && !/\bcm\b|centimet/.test(dimensionUnit) ? 100 : 1
  const packageCount = Math.max(1, Math.ceil(Number(quantity || 1) / Math.max(1, Number(packaging.unitsPerPackage || 1))))
  return { weightKg: weight * packageCount, lengthCm: dimensions[0] * multiplier, widthCm: dimensions[1] * multiplier, heightCm: dimensions[2] * multiplier, packageCount }
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
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingOrderId, setPendingOrderId] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [giftCardInput, setGiftCardInput] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [giftCardCode, setGiftCardCode] = useState('')
  const [parcel, setParcel] = useState({ weightKg: '', lengthCm: '', widthCm: '', heightCm: '' })

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
  const storedParcel = useMemo(() => productParcel(product, quantity), [product, quantity])
  const effectiveParcel = storedParcel || parcel
  const international = Boolean(address) && !isIndia(address)
  const shipment = useMemo(() => ({
    description: product.name || 'Marketplace product',
    quantity,
    weightKg: Number(effectiveParcel.weightKg),
    lengthCm: Number(effectiveParcel.lengthCm),
    widthCm: Number(effectiveParcel.widthCm),
    heightCm: Number(effectiveParcel.heightCm),
    declaredValue: Number(product.price || 0) * quantity,
    currency: product.currency || 'INR',
    contents: 'non_documents',
    incoterm: 'DAP',
    countryOfOrigin: product.countryOfOrigin || 'India',
  }), [effectiveParcel, product.countryOfOrigin, product.currency, product.name, product.price, quantity])
  const quote = useAsyncData(useCallback(() => productId && address
    ? fetchCheckoutQuote({
      productId,
      quantity,
      orderType: mode === 'sample' ? 'sample' : 'bulk',
      orderSubType: mode === 'sample' ? 'sample_order' : 'direct_order',
      logisticsOption: logistics || undefined,
      destination,
      shipment,
      couponCode: couponCode || undefined,
      giftCardCode: giftCardCode || undefined,
    })
    : Promise.resolve({ logisticsOptions: [], awaitingAddress: true }), [address, couponCode, destination, giftCardCode, logistics, mode, productId, quantity, shipment]))
  const pricing = quote.data || {}
  const availableOptions = pricing.logisticsOptions || []
  const logisticsKey = availableOptions.some(item => item.key === logistics) ? logistics : pricing.selectedLogistics?.key || availableOptions[0]?.key || ''

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
      shipment,
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
        {!storedParcel && <section className="module-panel">
          <div className="checkout-shipping-heading"><h2><Truck /> Parcel details</h2><p>Carrier prices require the packed parcel's actual weight and dimensions.</p></div>
          <div className="form-grid checkout-parcel-fields">
            {[['weightKg', 'Weight (kg)'], ['lengthCm', 'Length (cm)'], ['widthCm', 'Width (cm)'], ['heightCm', 'Height (cm)']].map(([name, label]) => <label key={name}>{label}<input type="number" min="0.01" step="0.01" disabled={Boolean(pendingOrderId)} value={parcel[name]} onChange={event => setParcel(current => ({ ...current, [name]: event.target.value }))} /></label>)}
          </div>
        </section>}
        <section className="module-panel">
          <div className="compact-heading"><h2><MapPin /> Delivery address</h2><Link to="/addresses">Add or edit</Link></div>
          {addresses.length ? <div className="checkout-addresses">{addresses.map((item) => <button type="button" disabled={Boolean(pendingOrderId)} className={resolveId(address) === resolveId(item) ? 'active' : ''} key={resolveId(item)} onClick={() => setAddressId(resolveId(item))}><b>{item.fullName}</b><span>{item.address || item.line1}, {item.city}, {item.country}</span>{resolveId(address) === resolveId(item) && <CheckCircle2 />}</button>)}</div> : <div className="account-empty"><MapPin /><b>No saved delivery address</b><Link className="button button--primary" to="/addresses">Add address</Link></div>}
        </section>
        <section className="module-panel">
          <div className="checkout-shipping-heading"><h2><Truck /> Choose shipping method</h2><p>Select a provider service. Your server-calculated total updates before payment.</p></div>
          {international || pricing.internationalUnsupported ? <div className="checkout-shipping-unavailable checkout-shipping-international"><Truck /><div><b>International shipping coming soon</b><p>Shipping is currently available only within India. Payment is disabled for this address.</p></div></div> : quote.loading ? <><p className="checkout-calculating" aria-live="polite">Calculating shipping...</p><div className="checkout-logistics">{Array.from({ length: 2 }, (_, index) => <div className="checkout-shipping-skeleton" key={index}><i /><span><i /><i /></span><i /></div>)}</div></> : pricing.logisticsOptions?.length ? <div className="checkout-logistics" role="radiogroup" aria-label="Shipping methods">{pricing.logisticsOptions.map((item, index) => {
            const key = item.key || item.id || `option-${index}`
            const selected = logisticsKey === key
            return <button type="button" role="radio" aria-checked={selected} disabled={Boolean(pendingOrderId)} className={selected ? 'active' : ''} key={key} onClick={() => setLogistics(key)}><ProviderBrand providerKey={item.providerKey} name /><span className="checkout-shipping-copy"><b>{item.label || item.name || item.providerLabel || key.replaceAll('_', ' ')}</b><small>{item.eta || item.estimatedDelivery || item.deliveryTime ? `Estimated delivery: ${item.eta || item.estimatedDelivery || item.deliveryTime}` : 'ETA not provided by Delhivery'}</small><em>{item.incoterm || 'DAP'} terms{item.trackingAvailable ? ' · Tracking included' : ''}</em></span><strong><Money value={item.amount ?? item.price ?? item.charge} currency={pricing.currency} /></strong><i className="checkout-shipping-check">{selected ? <Check /> : null}</i></button>
          })}</div> : address ? <div className="checkout-shipping-unavailable"><Truck /><div><b>Unable to calculate shipping right now. Please try again.</b><p>{pricing.shippingError?.message || 'Check the parcel details and delivery pincode, then retry.'}</p>{pricing.providerStatuses?.length ? <small>{pricing.providerStatuses.map(item => `${item.name || item.provider}: ${item.status}`).join(' · ')}</small> : null}<button type="button" className="button button--secondary checkout-rate-retry" onClick={quote.reload}>Retry shipping</button></div></div> : <div className="checkout-shipping-unavailable"><MapPin /><div><b>Select a delivery address</b><p>Add or select an Indian delivery address to calculate Delhivery shipping.</p></div></div>}
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
        <button className="button button--primary button--full" onClick={place} disabled={busy || quote.loading || Boolean(quote.error) || international || pricing.internationalUnsupported || !logisticsKey || !terms}><CreditCard /> {busy ? 'Opening Razorpay…' : Number(pricing.grandTotal || 0) <= 0 ? 'Place fully covered order' : pendingOrderId ? 'Retry payment' : 'Place Order & Pay'}</button>
        <small>Razorpay verifies payment before fulfillment begins.</small>
      </aside>
    </div>
  </div></AppShell>
}
