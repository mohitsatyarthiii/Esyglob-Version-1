import { CheckCircle2, CircleAlert, Factory, RefreshCw, Save, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import AddressAutocomplete from '../components/AddressAutocomplete'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'
import { fetchMyShippingSetup, synchronizeMyShippingSetup, updateMyShippingSetup } from '../api/trade'

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
const emptyAddress = { contactName: '', phone: '', email: '', line1: '', line2: '', city: '', district: '', state: '', postalCode: '', country: 'India', countryCode: 'IN', formattedAddress: '', placeId: '', latitude: undefined, longitude: undefined, locationSource: 'manual' }

function Field({ name, title, value, errors, onChange, ...props }) {
  return <label className={errors[name] ? 'field-invalid' : ''}><span>{title} *</span><input name={name} value={value || ''} onChange={onChange} aria-invalid={Boolean(errors[name])} {...props} />{errors[name] && <small className="field-error">{errors[name]}</small>}</label>
}

export default function ShippingSetupPage() {
  const setup = useAsyncData(useCallback(() => fetchMyShippingSetup(), []))
  const [editedForm, setEditedForm] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const data = setup.data?.setup || setup.data
  const form = editedForm || { ...emptyAddress, ...(data?.pickupAddress || {}) }

  function change(event) {
    const { name, value } = event.target
    setEditedForm(current => ({ ...(current || form), [name]: value }))
    setFieldErrors(current => ({ ...current, [name]: undefined }))
  }

  function chooseAddress(location) {
    setEditedForm(current => ({
      ...(current || form),
      formattedAddress: location.formattedAddress || '',
      line1: location.line1 || location.street || location.formattedAddress || '',
      city: location.city || '',
      district: location.district || '',
      state: location.state || '',
      postalCode: location.postalCode || '',
      country: location.country || 'India',
      countryCode: location.countryCode || 'IN',
      placeId: location.placeId || '',
      latitude: location.latitude,
      longitude: location.longitude,
      locationSource: location.placeId ? 'autocomplete' : 'gps',
    }))
    setFieldErrors(current => ({ ...current, line1: undefined, city: undefined, state: undefined, postalCode: undefined }))
  }

  async function save(event) {
    event.preventDefault()
    setBusy('save'); setMessage(''); setFieldErrors({})
    try {
      await updateMyShippingSetup(form)
      setMessage('Pickup details saved. Delhivery and Shiprocket setup has been synchronized.')
      await setup.reload()
      setEditedForm(null)
    } catch (error) {
      setMessage(error.message)
      setFieldErrors(error.fieldErrors || {})
    } finally { setBusy('') }
  }

  async function synchronize() {
    setBusy('sync'); setMessage(''); setFieldErrors({})
    try {
      await synchronizeMyShippingSetup()
      setMessage('Shipping provider setup refreshed.')
      await setup.reload()
    } catch (error) { setMessage(error.message) } finally { setBusy('') }
  }

  return <AppShell><main className="container module-page"><header className="page-head"><div><span className="eyebrow">Seller fulfilment</span><h1>Shipping setup</h1><p>Add the pickup details used for sample and trade orders. EsyGlob registers this location separately with Delhivery and Shiprocket.</p></div><Truck /></header>
    {setup.loading && !data && <section className="module-panel"><p>Loading shipping setup…</p></section>}
    {setup.error && !data && <p className="action-error">{setup.error.message || 'Unable to load shipping setup.'}</p>}
    <form className="module-panel" onSubmit={save}><h2><Factory /> Pickup location</h2><p>Use the address where carrier staff can collect packed orders during business hours.</p>
      <label className="field-wide"><span>Find pickup address with Google *</span><AddressAutocomplete value={form.formattedAddress || form.line1} onChange={formattedAddress => setEditedForm(current => ({ ...(current || form), formattedAddress }))} onSelect={chooseAddress} countryCodes="in" disabled={Boolean(busy)} required /></label>
      <div className="form-grid">
        <Field name="contactName" title="Contact name" value={form.contactName} errors={fieldErrors} onChange={change} autoComplete="name" />
        <Field name="phone" title="Phone number" value={form.phone} errors={fieldErrors} onChange={change} type="tel" inputMode="numeric" maxLength="14" autoComplete="tel" />
        <Field name="email" title="Email" value={form.email} errors={fieldErrors} onChange={change} type="email" autoComplete="email" />
        <Field name="line1" title="Street address" value={form.line1} errors={fieldErrors} onChange={change} autoComplete="address-line1" />
        <label><span>Address line 2</span><input name="line2" value={form.line2 || ''} onChange={change} autoComplete="address-line2" /></label>
        <Field name="city" title="City" value={form.city} errors={fieldErrors} onChange={change} autoComplete="address-level2" />
        <Field name="state" title="State" value={form.state} errors={fieldErrors} onChange={change} autoComplete="address-level1" />
        <Field name="postalCode" title="Pincode" value={form.postalCode} errors={fieldErrors} onChange={change} inputMode="numeric" maxLength="6" pattern="[0-9]{6}" autoComplete="postal-code" />
        <label><span>Country</span><input name="country" value="India" readOnly /></label>
      </div>
      <p><strong>Shipping readiness: {label(data?.readiness || 'pending')}</strong>{data?.pickupSource && <> · Source: {label(data.pickupSource)}</>}</p>
      {message && <p className={message.includes('saved') || message.includes('refreshed') ? 'action-success' : 'action-error'}>{message}</p>}
      <button className="button button--primary" disabled={Boolean(busy)}><Save />{busy === 'save' ? 'Saving and connecting carriers…' : 'Save shipping details'}</button>
    </form>
    <div className="service-grid">{(data?.providers || []).map(provider => <article className="module-panel" key={provider.providerKey}>{provider.status === 'active' ? <CheckCircle2 /> : <CircleAlert />}<h2>{label(provider.providerKey)}</h2><b>{label(provider.status)}</b><p>{provider.status === 'active' ? `Pickup mapping ${provider.locationName || ''} is ready for rates and booking.` : provider.error?.message || 'Save complete pickup details to register this carrier.'}</p></article>)}</div>
    <button type="button" className="button button--secondary" disabled={Boolean(busy) || data?.readiness === 'invalid'} onClick={synchronize}><RefreshCw />{busy === 'sync' ? 'Refreshing…' : 'Retry carrier connection'}</button>
  </main></AppShell>
}
