import {
  ArrowLeft, BadgeCheck, Calculator, CheckCircle2, ChevronDown, Clock3, CreditCard,
  FileUp, LoaderCircle, PackageCheck, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createServiceRequest, fetchServiceQuote, getService, initiateServicePayment, isServiceFieldVisible,
  loadRazorpay, searchServiceProviders, verifyServicePayment,
} from '../api/services'
import { fetchAddresses, fetchProfile } from '../api/account'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useToast } from '../components/EnterpriseUX'
import ProviderBrand, { ProviderStrip } from '../components/ProviderBrand'
import { AttachmentUploader, Money } from '../components/TradeUI'

const SERVICE_LEVELS = ['standard', 'premium', 'enterprise']

function openServicePayment(session, requestId, serviceTitle) {
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency || 'INR',
      order_id: session.razorpayOrderId,
      name: 'EsyGlob',
      description: `${serviceTitle} booking`,
      handler: async result => {
        try {
          resolve(await verifyServicePayment(requestId, {
            razorpayPaymentId: result.razorpay_payment_id,
            razorpayOrderId: result.razorpay_order_id,
            razorpaySignature: result.razorpay_signature,
          }))
        } catch (error) { reject(error) }
      },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. Your booking is saved and ready to retry.')) },
      theme: { color: '#f26a21' },
    })
    checkout.on('payment.failed', result => reject(new Error(result.error?.description || 'Payment failed. Please retry.')))
    checkout.open()
  })
}

export default function ServiceBookingPage() {
  const { serviceKey } = useParams()
  const service = getService(serviceKey)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const formRef = useRef(null)
  const providerRequest = useRef(0)
  const roles = user?.roles || [user?.primaryRole || 'buyer']
  const [role, setRole] = useState(service?.role === 'seller' ? 'seller' : service?.role === 'buyer' ? 'buyer' : roles.includes('seller') && user?.primaryRole === 'seller' ? 'seller' : 'buyer')
  const [values, setValues] = useState(() => ({
    contactName: user?.name || user?.fullName || '',
    contactEmail: user?.email || '',
    contactPhone: user?.phone || '',
    pickupContactName: user?.name || user?.fullName || '',
    pickupPhone: user?.phone || '',
    pickupEmail: user?.email || '',
    pickupCountry: 'India',
    pickupCountryCode: 'IN',
    destinationCountry: 'India',
    destinationCountryCode: 'IN',
    quantity: '1',
    weightKg: '1',
    declaredValue: '0',
    currency: 'INR',
    contents: 'non_documents',
    countryOfOrigin: 'IN',
    incoterm: 'DAP',
    insuranceRequested: 'no',
    dangerousGoods: 'no',
  }))
  const [documents, setDocuments] = useState([])
  const [quote, setQuote] = useState(null)
  const [providerResult, setProviderResult] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [serviceLevel, setServiceLevel] = useState('standard')
  const [providerStatus, setProviderStatus] = useState('idle')
  const [terms, setTerms] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const isShipping = service?.key === 'shipping'
  const sections = useMemo(() => service ? [...new Set(service.fields.map(item => item.step || 'Booking details'))] : [], [service])
  const providerFingerprint = useMemo(() => {
    if (!isShipping || requestId || !service) return ''
    const visibleRequired = service.fields.filter(field => field.required && isServiceFieldVisible(field, values))
    if (visibleRequired.some(field => !String(values[field.key] || '').trim())) return ''
    if (values.pickupEmail && !validEmail(values.pickupEmail)) return ''
    if (values.destinationEmail && !validEmail(values.destinationEmail)) return ''
    return JSON.stringify(values)
  }, [isShipping, requestId, service, values])

  useEffect(() => {
    let current = true
    Promise.all([fetchProfile().catch(() => ({})), fetchAddresses().catch(() => [])]).then(([profile, addresses]) => {
      if (!current) return
      const address = addresses.find(item => item.isDefault) || addresses[0] || {}
      const fullName = profile.fullName || user?.fullName || user?.name || ''
      setValues(formValues => ({
        ...formValues,
        companyName: formValues.companyName || profile.companyName || user?.companyName || address.companyName || '',
        contactName: formValues.contactName || fullName,
        contactEmail: formValues.contactEmail || profile.email || user?.email || '',
        contactPhone: formValues.contactPhone || profile.phone || user?.phone || '',
        pickupContactName: formValues.pickupContactName || address.fullName || fullName,
        pickupPhone: formValues.pickupPhone || address.phone || profile.phone || user?.phone || '',
        pickupEmail: formValues.pickupEmail || profile.email || user?.email || '',
        pickupLine1: formValues.pickupLine1 || address.address || address.line1 || profile.address || '',
        pickupCity: formValues.pickupCity || address.city || profile.city || '',
        pickupState: formValues.pickupState || address.state || '',
        pickupPostalCode: formValues.pickupPostalCode || address.postalCode || address.pincode || '',
        pickupCountry: address.country || formValues.pickupCountry || profile.country || '',
        pickupCountryCode: address.countryCode || formValues.pickupCountryCode,
        pickupLatitude: address.latitude || formValues.pickupLatitude,
        pickupLongitude: address.longitude || formValues.pickupLongitude,
        pickupPlaceId: address.placeId || formValues.pickupPlaceId,
      }))
    })
    return () => { current = false }
  }, [user])

  function providerInput() {
    const address = prefix => ({
      contactName: values[`${prefix}ContactName`],
      phone: values[`${prefix}Phone`],
      email: values[`${prefix}Email`] || '',
      line1: values[`${prefix}Line1`],
      line2: values[`${prefix}Line2`] || '',
      city: values[`${prefix}City`],
      state: values[`${prefix}State`],
      postalCode: values[`${prefix}PostalCode`],
      country: values[`${prefix}Country`],
      countryCode: String(values[`${prefix}CountryCode`] || '').toUpperCase(),
      latitude: numberOrUndefined(values[`${prefix}Latitude`]),
      longitude: numberOrUndefined(values[`${prefix}Longitude`]),
      placeId: values[`${prefix}PlaceId`] || undefined,
    })
    return {
      pickup: address('pickup'),
      destination: address('destination'),
      shipment: {
        description: values.shipmentDescription,
        quantity: Number(values.quantity),
        weightKg: Number(values.weightKg),
        lengthCm: numberOrUndefined(values.lengthCm),
        widthCm: numberOrUndefined(values.widthCm),
        heightCm: numberOrUndefined(values.heightCm),
        declaredValue: Number(values.declaredValue || 0),
        currency: values.currency,
        contents: values.contents,
        countryOfOrigin: values.countryOfOrigin?.toUpperCase(),
        hsCode: values.hsCode || undefined,
        incoterm: values.incoterm || 'DAP',
        insuranceRequested: values.insuranceRequested === 'yes',
        dangerousGoods: false,
      },
    }
  }

  async function loadProviders() {
    const sequence = ++providerRequest.current
    setProviderStatus('loading')
    setError('')
    try {
      const result = await searchServiceProviders(service.key, providerInput())
      if (sequence !== providerRequest.current) return
      setProviderResult(result)
      setSelectedProvider(null)
      setServiceLevel(levelForOption(result.providers?.find(item => item.recommended) || result.providers?.[0]))
      setProviderStatus('loaded')
    } catch (next) {
      if (sequence !== providerRequest.current) return
      setProviderResult(null)
      setProviderStatus('error')
      setError(next.message)
    }
  }

  useEffect(() => {
    if (!providerFingerprint) return undefined
    const timer = window.setTimeout(() => { void loadProviders() }, 700)
    return () => window.clearTimeout(timer)
    // Provider loading intentionally follows the validated form fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerFingerprint])

  if (!service) return <AppShell><div className="container module-page"><p className="inline-error">Service not found.</p></div></AppShell>
  if (service.role === 'seller' && !roles.includes('seller')) return <AppShell><div className="container module-page"><div className="empty-results"><ShieldCheck /><h2>Seller account required</h2><p>Complete seller onboarding before requesting business verification.</p><Link className="button button--primary" to="/profile">Review profile</Link></div></div></AppShell>

  function resetProviderDiscovery() {
    providerRequest.current += 1
    setProviderResult(null)
    setSelectedProvider(null)
    setProviderStatus('idle')
  }

  function change(key, value) {
    setValues(current => ({ ...current, [key]: value }))
    setFieldErrors(current => ({ ...current, [key]: '' }))
    if (!requestId) {
      setQuote(null)
      if (isShipping) resetProviderDiscovery()
    }
  }

  function validate() {
    const errors = {}
    service.fields.filter(field => isServiceFieldVisible(field, values)).forEach(field => {
      const value = String(values[field.key] || '').trim()
      if (field.required && !value) errors[field.key] = `${field.label} is required.`
      else if (field.type === 'email' && value && !validEmail(value)) errors[field.key] = 'Enter a valid email address.'
      else if (field.type === 'number' && value && !(Number(value) >= 0)) errors[field.key] = `${field.label} must be a valid number.`
    })
    setFieldErrors(errors)
    const first = Object.keys(errors)[0]
    if (first) {
      toast.error('Please correct the highlighted booking information.')
      requestAnimationFrame(() => {
        const input = formRef.current?.querySelector(`[name="${CSS.escape(first)}"]`)
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        input?.focus()
      })
      return false
    }
    return true
  }

  function applyAddress(fieldKey, location) {
    const prefix = fieldKey.startsWith('pickup') ? 'pickup' : fieldKey.startsWith('destination') ? 'destination' : ''
    if (!prefix) {
      change(fieldKey, location.formattedAddress || location.line1 || '')
      return
    }
    setValues(current => ({
      ...current,
      [`${prefix}Line1`]: location.line1 || location.formattedAddress || current[`${prefix}Line1`],
      [`${prefix}City`]: location.city || current[`${prefix}City`],
      [`${prefix}District`]: location.district || current[`${prefix}District`],
      [`${prefix}State`]: location.state || current[`${prefix}State`],
      [`${prefix}PostalCode`]: location.postalCode || current[`${prefix}PostalCode`],
      [`${prefix}Country`]: location.country || current[`${prefix}Country`],
      [`${prefix}CountryCode`]: location.countryCode || current[`${prefix}CountryCode`],
      [`${prefix}Latitude`]: location.latitude,
      [`${prefix}Longitude`]: location.longitude,
      [`${prefix}PlaceId`]: location.placeId,
    }))
    resetProviderDiscovery()
  }

  async function calculateManagedQuote() {
    if (!validate()) return
    setBusy('quote')
    setError('')
    const toastId = toast.loading('Calculating service pricing…')
    try {
      setQuote(await fetchServiceQuote(service.key, values))
      toast.update(toastId, { type: 'success', message: 'Service price calculated.' })
    } catch (next) {
      setError(next.message)
      toast.update(toastId, { type: 'error', message: next.message })
    } finally { setBusy('') }
  }

  async function submit(event) {
    event.preventDefault()
    if (!validate()) return
    if (isShipping && !selectedProvider) {
      toast.warning(providerStatus === 'loading' ? 'Available providers are still loading.' : 'Select a service level and provider before payment.')
      return
    }
    if (!terms) {
      setError('Accept the service and payment terms to continue.')
      toast.warning('Accept the service and payment terms to continue.')
      return
    }
    setBusy('submit')
    setError('')
    const toastId = toast.loading('Preparing secure payment…')
    try {
      let id = requestId
      if (!id) {
        const request = await createServiceRequest(service, role, values, documents, true, selectedProvider?.quoteId)
        id = request._id || request.id
        if (!id) throw new Error('Booking was created without a valid reference.')
        setRequestId(id)
      }
      if (!await loadRazorpay()) throw new Error('Secure checkout could not be loaded. Check your connection and retry.')
      const session = await initiateServicePayment(id)
      const paymentResult = await openServicePayment(session, id, service.title)
      toast.update(toastId, { type: 'success', message: 'Payment completed and provider booking submitted.' })
      navigate(`/services/requests/${id}`, { replace: true, state: { paymentComplete: true, paymentResult } })
    } catch (next) {
      setError(next.message || 'Payment could not be completed. Please retry.')
      toast.update(toastId, { type: 'error', message: next.message || 'Payment could not be completed.' })
    } finally { setBusy('') }
  }

  const pricing = selectedProvider?.pricing || quote
  return <AppShell><div className="container service-booking-page">
    <Link className="back-link" to={`/services/${service.key}`}><ArrowLeft /> {service.title}</Link>
    <header><span className="eyebrow">Secure service booking</span><h1>Book {service.title}</h1><p>{isShipping ? 'Complete the shipment details. EsyGlob automatically loads eligible carrier services for your route.' : 'Provide the service details, review pricing and pay securely.'}</p>{isShipping && <ProviderStrip keys={service.providers} compact />}</header>
    {roles.includes('seller') && service.role === 'both' && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Book as buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Book as seller</button></div>}
    <form ref={formRef} noValidate onSubmit={submit} className="service-booking-layout">
      <div>
        {sections.map(section => <FormSection key={section} title={section} fields={service.fields.filter(item => (item.step || 'Booking details') === section && isServiceFieldVisible(item, values))} values={values} errors={fieldErrors} disabled={Boolean(requestId)} onChange={change} onAddressSelect={applyAddress} />)}
        <details className="module-panel service-form-section optional-fields supporting-documents"><summary><span><FileUp /> Supporting documents</span><small>Optional</small></summary><p>Upload invoices, specifications, or other relevant evidence.</p><AttachmentUploader folder="service-requests" value={documents} onChange={setDocuments} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" /></details>
        {isShipping && <ProviderSelection result={providerResult} status={providerStatus} level={serviceLevel} selected={selectedProvider} disabled={Boolean(requestId)} onLevel={next => { setServiceLevel(next); setSelectedProvider(current => levelForOption(current) === next ? current : null) }} onSelect={option => { setSelectedProvider(option); setError('') }} />}
      </div>
      <aside className="module-panel service-quote-card"><ShieldCheck /><h2>Booking summary</h2><p>{service.title}</p>
        {selectedProvider && <div className="selected-provider-summary"><ProviderBrand providerKey={selectedProvider.providerKey} /><div><small>{selectedProvider.providerName}</small><b>{selectedProvider.serviceName}</b><span>{deliveryText(selectedProvider)}</span></div></div>}
        {pricing ? <PriceBreakdown pricing={pricing} /> : isShipping ? <ProviderLoadSummary status={providerStatus} ready={Boolean(providerFingerprint)} /> : <button type="button" className="button button--secondary button--full" onClick={calculateManagedQuote} disabled={Boolean(busy)}><Calculator /> {busy === 'quote' ? 'Calculating…' : 'Calculate quote'}</button>}
        <label className="check-field"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} /> I accept the service scope, cancellation, and payment terms.</label>
        {error && <p className="action-error">{error}</p>}
        {requestId && <p><CheckCircle2 /> Booking saved. Complete payment to confirm with the provider.</p>}
        <button className="button button--primary button--full" disabled={Boolean(busy) || !terms || (isShipping && !selectedProvider)}><CreditCard /> {busy === 'submit' ? 'Opening secure payment…' : requestId ? 'Retry payment' : 'Book and pay'}</button>
        <small>Provider booking begins only after Razorpay verifies payment.</small>
      </aside>
    </form>
  </div></AppShell>
}

function FormSection({ title, fields, values, errors, disabled, onChange, onAddressSelect }) {
  const required = fields.filter(field => field.required)
  const optional = fields.filter(field => !field.required)
  const render = field => <ServiceField key={field.key} field={field} value={values[field.key] || ''} error={errors[field.key]} disabled={disabled} onAddressSelect={location => onAddressSelect(field.key, location)} countryCode={field.key.startsWith('pickup') ? values.pickupCountryCode : field.key.startsWith('destination') ? values.destinationCountryCode : ''} onChange={value => onChange(field.key, value)} />
  return <section className="module-panel service-form-section"><h2>{title}</h2><div className="form-grid">{required.map(render)}</div>{optional.length > 0 && <details className="optional-fields"><summary>Optional details <small>{optional.length}</small></summary><div className="form-grid">{optional.map(render)}</div></details>}</section>
}

function ProviderSelection({ result, status, level, selected, disabled, onLevel, onSelect }) {
  if (status === 'idle') return <section className="module-panel provider-discovery-state"><PackageCheck /><div><h2>Available provider services</h2><p>Complete the required shipment fields to load providers automatically.</p></div></section>
  if (status === 'loading') return <section className="module-panel provider-discovery-state is-loading"><LoaderCircle /><div><h2>Loading available providers</h2><p>Checking live services, prices, and delivery estimates for this route.</p></div></section>
  if (status === 'error') return <section className="module-panel provider-discovery-state"><PackageCheck /><div><h2>No provider options loaded</h2><p>Review the route and shipment fields. Availability refreshes automatically.</p></div></section>
  const options = result?.providers || []
  const visible = options.filter(option => levelForOption(option) === level)
  return <section className="module-panel service-form-section provider-results">
    <header><div><span className="eyebrow">{result.routeType} route</span><h2>Choose service level</h2></div><small>Rates valid until {new Date(result.expiresAt).toLocaleTimeString()}</small></header>
    <div className="service-level-selector">{SERVICE_LEVELS.map(item => {
      const count = options.filter(option => levelForOption(option) === item).length
      return <button type="button" className={level === item ? 'active' : ''} key={item} onClick={() => onLevel(item)}><span>{titleCase(item)}<small>{count} option{count === 1 ? '' : 's'}</small></span><ChevronDown /></button>
    })}</div>
    <div className="provider-option-list">{visible.length ? visible.map(option => <ProviderRow key={option.quoteId} option={option} selected={selected?.quoteId === option.quoteId} disabled={disabled} onSelect={() => onSelect(option)} />) : <p className="provider-level-empty">No {level} services are currently available for this route. Choose another service level.</p>}</div>
  </section>
}

function ProviderRow({ option, selected, disabled, onSelect }) {
  return <article className={`provider-option-row${selected ? ' active' : ''}`}>
    <ProviderBrand providerKey={option.providerKey} />
    <div className="provider-option-copy"><b>{option.providerName}</b><span>{option.serviceName}</span><div className="provider-badges">{option.recommended && <em><Sparkles /> Recommended</em>}{option.fastest && <em><Clock3 /> Fastest</em>}{option.bestPrice && <em><BadgeCheck /> Best price</em>}</div></div>
    <div className="provider-option-price"><strong><Money value={option.price} currency={option.currency} /></strong><small>{deliveryText(option)}</small></div>
    <button type="button" className={selected ? 'button button--secondary' : 'button button--primary'} disabled={disabled} onClick={onSelect}>{selected ? <><CheckCircle2 /> Selected</> : 'Select'}</button>
  </article>
}

function ProviderLoadSummary({ status, ready }) {
  return <div className={`provider-load-summary is-${status}`}>{status === 'loading' ? <LoaderCircle /> : status === 'loaded' ? <CheckCircle2 /> : <PackageCheck />}<span><b>{status === 'loading' ? 'Loading provider services…' : status === 'loaded' ? 'Choose a provider' : ready ? 'Provider availability will retry automatically' : 'Complete shipment details'}</b><small>No manual provider search is required.</small></span></div>
}

function PriceBreakdown({ pricing }) {
  return <div className="quote-breakdown"><span>Provider price <b><Money value={pricing.baseCost} currency={pricing.currency} /></b></span><span>Platform fee <b><Money value={pricing.platformFee} currency={pricing.currency} /></b></span>{pricing.gstAmount > 0 && <span>GST ({pricing.gstRate}%) <b><Money value={pricing.gstAmount} currency={pricing.currency} /></b></span>}<strong>Total <b><Money value={pricing.totalPayable} currency={pricing.currency} /></b></strong></div>
}

function ServiceField({ field, value, error, disabled, onChange, onAddressSelect, countryCode }) {
  const props = { name: field.key, value, disabled, required: field.required, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${field.key}-error` : undefined, onChange: event => onChange(event.target.value) }
  const addressField = /(?:Line1|Address|warehouseLocation)$/.test(field.key)
  return <label className={error ? 'field-invalid' : ''}><span>{field.label}{field.required && ' *'}</span>{addressField ? <AddressAutocomplete value={value} disabled={disabled} required={field.required} invalid={Boolean(error)} describedBy={error ? `${field.key}-error` : undefined} name={field.key} countryCodes={countryCode} onChange={onChange} onSelect={onAddressSelect} /> : field.type === 'select' ? <select {...props}><option value="">Select {field.label.toLowerCase()}</option>{field.options?.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select> : field.type === 'textarea' ? <textarea {...props} rows="2" /> : <input {...props} type={field.type === 'tel' ? 'tel' : field.type || 'text'} min={field.type === 'number' ? '0' : undefined} />}{error && <small id={`${field.key}-error`} className="field-error">{error}</small>}</label>
}

function levelForOption(option) {
  const name = String(option?.serviceName || '').toLowerCase()
  if (/first|priority|overnight|critical|same.day/.test(name)) return 'enterprise'
  if (/economy|ground|standard|surface|saver/.test(name)) return 'standard'
  return 'premium'
}
function deliveryText(option) {
  return option.estimatedDeliveryText || (option.estimatedDeliveryAt && new Date(option.estimatedDeliveryAt).toLocaleDateString()) || 'ETA after booking'
}
function titleCase(value) { return value.charAt(0).toUpperCase() + value.slice(1) }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }
function numberOrUndefined(value) { return value === '' || value == null ? undefined : Number(value) }
