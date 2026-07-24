/* eslint-disable react-hooks/set-state-in-effect */
import { ArrowLeft, ArrowRight, Building2, Check, MapPin, PackageSearch, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeBuyerOnboarding, createAddress, fetchProfile, updateProfile } from '../api/account'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'
import { TradeSkeleton } from './RfqsPage'

const interests = ['Agriculture', 'Steel', 'Electronics', 'Textiles', 'Food', 'Chemicals', 'Industrial Machinery', 'Construction', 'Packaging']
const countries = ['India', 'China', 'United Arab Emirates', 'United States', 'Germany', 'Vietnam', 'Bangladesh', 'Turkey']
const payments = ['Razorpay', 'Bank transfer', 'Letter of credit', 'UPI']
const shipping = ['Air freight', 'Sea freight', 'Road freight', 'Express courier']
const steps = [
  ['Personal information', UserRound],
  ['Business interests', Building2],
  ['Buying preferences', PackageSearch],
  ['Delivery address', MapPin],
]

export default function BuyerOnboardingPage() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const profileQuery = useAsyncData(useCallback(() => fetchProfile(), []))
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', companyName: '', designation: '',
    businessInterests: [], productCategories: [], expectedOrderQuantity: '',
    sourcingCountries: [], paymentMethods: [], shippingMethods: [],
    country: '', state: '', city: '', address: '', postalCode: '',
  })
  useEffect(() => {
    if (!profileQuery.data) return
    setForm(current => ({ ...current, ...profileQuery.data }))
  }, [profileQuery.data])
  const progress = (step + 1) * 25
  const validation = useMemo(() => {
    if (step === 0 && (form.fullName.trim().length < 2 || !/^\+?[\d\s()-]{7,20}$/.test(form.phone))) return 'Enter your full name and a valid phone number.'
    if (step === 1 && !form.businessInterests.length) return 'Select at least one business interest.'
    if (step === 2 && (!form.productCategories.length || !form.expectedOrderQuantity || !form.sourcingCountries.length || !form.paymentMethods.length || !form.shippingMethods.length)) return 'Complete every buying preference.'
    if (step === 3 && [form.country, form.state, form.city, form.address, form.postalCode].some(value => !String(value).trim())) return 'Complete the delivery address.'
    return ''
  }, [form, step])
  function toggle(key, value) {
    setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }))
    setError('')
  }
  async function next() {
    if (validation) return setError(validation)
    if (step < 3) { setStep(current => current + 1); setError(''); return }
    setBusy(true); setError('')
    try {
      await updateProfile({
        fullName: form.fullName, email: form.email, phone: form.phone, companyName: form.companyName,
        avatarUrl: profileQuery.data?.avatarUrl || '', country: form.country, city: form.city,
        address: form.address, businessType: profileQuery.data?.businessType || '',
        companyDescription: profileQuery.data?.companyDescription || '',
      })
      await createAddress({
        fullName: form.fullName, phone: form.phone, companyName: form.companyName,
        address: form.address, line1: form.address, city: form.city, state: form.state,
        country: form.country, postalCode: form.postalCode, pincode: form.postalCode, isDefault: true,
      })
      await completeBuyerOnboarding(form)
      await refresh()
      navigate('/home', { replace: true })
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }
  if (profileQuery.loading) return <AppShell><div className="container module-page"><TradeSkeleton /></div></AppShell>
  const [title, Icon] = steps[step]
  return <AppShell><div className="container onboarding-page">
    <header className="onboarding-hero"><div><span className="eyebrow">Buyer setup</span><h1>Build your sourcing profile</h1><p>Tell us what you buy so EsyGlob can tailor products, suppliers and trade options.</p></div><strong>{progress}% complete</strong></header>
    <div className="onboarding-progress"><i style={{ width: `${progress}%` }} /></div>
    <nav className="onboarding-steps">{steps.map(([label, StepIcon], index) => <button className={index === step ? 'active' : index < step ? 'complete' : ''} key={label} onClick={() => index < step && setStep(index)}><i>{index < step ? <Check /> : <StepIcon />}</i><span>{label}</span></button>)}</nav>
    <section className="module-panel onboarding-card"><header><Icon /><div><span>Step {step + 1} of 4</span><h2>{title}</h2></div></header>
      {step === 0 && <div className="form-grid"><Field label="Full name" name="fullName" form={form} setForm={setForm} required /><Field label="Phone number" name="phone" form={form} setForm={setForm} required /><Field label="Company (optional)" name="companyName" form={form} setForm={setForm} /><Field label="Designation" name="designation" form={form} setForm={setForm} /></div>}
      {step === 1 && <ChoiceGroup title="Industries you source from" values={interests} selected={form.businessInterests} onToggle={value => toggle('businessInterests', value)} />}
      {step === 2 && <><ChoiceGroup title="Preferred product categories" values={interests} selected={form.productCategories} onToggle={value => toggle('productCategories', value)} /><label>Expected order quantity<input value={form.expectedOrderQuantity} onChange={event => setForm({ ...form, expectedOrderQuantity: event.target.value })} placeholder="For example: 500–2,000 units monthly" /></label><ChoiceGroup title="Preferred sourcing countries" values={countries} selected={form.sourcingCountries} onToggle={value => toggle('sourcingCountries', value)} /><ChoiceGroup title="Payment methods" values={payments} selected={form.paymentMethods} onToggle={value => toggle('paymentMethods', value)} /><ChoiceGroup title="Shipping methods" values={shipping} selected={form.shippingMethods} onToggle={value => toggle('shippingMethods', value)} /></>}
      {step === 3 && <div className="form-grid"><Field label="Country" name="country" form={form} setForm={setForm} required /><Field label="State" name="state" form={form} setForm={setForm} required /><Field label="City" name="city" form={form} setForm={setForm} required /><Field label="Postal code" name="postalCode" form={form} setForm={setForm} required /><label className="field-wide">Complete address<textarea value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} required /></label></div>}
      {error && <p className="action-error">{error}</p>}<footer><button className="button button--secondary" disabled={!step || busy} onClick={() => { setStep(current => current - 1); setError('') }}><ArrowLeft /> Back</button><button className="button button--primary" disabled={busy} onClick={next}>{busy ? 'Completing…' : step === 3 ? 'Complete onboarding' : 'Continue'} <ArrowRight /></button></footer>
    </section>
  </div></AppShell>
}

function Field({ label, name, form, setForm, required }) {
  return <label>{label}<input value={form[name]} required={required} onChange={event => setForm({ ...form, [name]: event.target.value })} /></label>
}
function ChoiceGroup({ title, values, selected, onToggle }) {
  return <fieldset className="onboarding-choices"><legend>{title}</legend><div>{values.map(value => <button type="button" className={selected.includes(value) ? 'active' : ''} onClick={() => onToggle(value)} key={value}>{selected.includes(value) && <Check />}{value}</button>)}</div></fieldset>
}
