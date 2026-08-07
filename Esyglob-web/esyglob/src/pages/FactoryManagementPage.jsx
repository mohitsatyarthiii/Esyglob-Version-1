import { CheckCircle2, Factory, Image, Save, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { fetchFactoryProfile, saveFactoryProfile } from '../api/verification'

const initial = {
  name: '', floorArea: '', employeeCount: '', productionLines: '', monthlyCapacity: '',
  annualCapacity: '', qualityControl: '', description: '', machinery: '', capabilities: [],
  qualityProcesses: [], exportMarkets: [], images: [], videos: [],
  address: {
    street: '', district: '', city: '', state: '', country: 'India', pincode: '',
    placeId: '', latitude: undefined, longitude: undefined,
  },
}
const capabilityOptions = ['OEM Manufacturing', 'ODM Manufacturing', 'Private Label', 'Prototyping', 'CNC Machining', 'Injection Molding', 'Assembly Line', 'Quality Testing', 'Export Ready']

export default function FactoryManagementPage() {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    try {
      const result = await fetchFactoryProfile()
      const data = result?.factory || result
      if (data) setForm({
        ...initial,
        ...data,
        machinery: Array.isArray(data.machinery) ? data.machinery.map(item => item.name).join(', ') : data.machinery || '',
        address: { ...initial.address, ...data.address },
      })
    } finally { setBusy(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function save() {
    setBusy(true); setMessage('')
    try {
      await saveFactoryProfile({
        ...form,
        employeeCount: Number(form.employeeCount) || 0,
        productionLines: Number(form.productionLines) || 0,
        machinery: form.machinery,
      })
      setMessage('Factory profile saved')
      await load()
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  const updateAddress = (key, value) => setForm(current => ({ ...current, address: { ...current.address, [key]: value } }))
  return <AppShell><main className="container factory-page">
    <header className="verification-hero">
      <div><span className="eyebrow">Manufacturing credibility</span><h1>Factory profile</h1><p>This single profile powers verification, your public supplier page, and buyer-facing factory credentials.</p></div>
      <div className={`verification-status status-${form.verificationStatus || 'draft'}`}><ShieldCheck /><span><small>Factory status</small><b>{String(form.verificationStatus || 'draft').replaceAll('_', ' ')}</b></span></div>
    </header>
    <div className="factory-layout"><section className="module-panel factory-form">
      <h2><Factory /> Operations & capacity</h2>
      <div className="verification-fields">
        {[['name', 'Factory name'], ['floorArea', 'Floor area'], ['employeeCount', 'Employees'], ['productionLines', 'Production lines'], ['monthlyCapacity', 'Monthly capacity'], ['annualCapacity', 'Annual capacity']].map(([key, label]) => <label key={key}><span>{label}</span><input value={form[key] || ''} onChange={event => set(key, event.target.value)} /></label>)}
        <label className="wide"><span>Machinery and equipment</span><input value={form.machinery || ''} onChange={event => set('machinery', event.target.value)} placeholder="CNC milling, laser cutting, assembly line…" /></label>
        <label className="wide"><span>Quality control process</span><textarea value={form.qualityControl || ''} onChange={event => set('qualityControl', event.target.value)} /></label>
        <label className="wide"><span>Factory overview</span><textarea value={form.description || ''} onChange={event => set('description', event.target.value)} /></label>
      </div>
      <h2>Factory address</h2>
      <div className="verification-fields">
        <label className="wide"><span>Search address</span><AddressAutocomplete
          value={form.address.street || ''}
          onChange={street => updateAddress('street', street)}
          onSelect={location => setForm(current => ({
            ...current,
            address: {
              ...current.address,
              street: location.street || location.line1 || '',
              district: location.district || '',
              city: location.city || '',
              state: location.state || '',
              country: location.country || '',
              pincode: location.postalCode || '',
              placeId: location.placeId || '',
              latitude: location.latitude,
              longitude: location.longitude,
            },
          }))}
        /></label>
        {['district', 'city', 'state', 'country', 'pincode'].map(key => <label key={key}><span>{key}</span><input value={form.address?.[key] || ''} onChange={event => updateAddress(key, event.target.value)} /></label>)}
      </div>
      <h2>Manufacturing capabilities</h2>
      <div className="factory-capabilities">{capabilityOptions.map(item => <button type="button" className={form.capabilities?.includes(item) ? 'active' : ''} key={item} onClick={() => set('capabilities', form.capabilities?.includes(item) ? form.capabilities.filter(value => value !== item) : [...(form.capabilities || []), item])}>{form.capabilities?.includes(item) && <CheckCircle2 />}{item}</button>)}</div>
      <footer><span>{message}</span><button className="button button--primary" disabled={busy} onClick={save}><Save />{busy ? 'Saving…' : 'Save factory profile'}</button></footer>
    </section><aside>
      <section className="module-panel factory-media"><Image /><h2>Factory media</h2><p>Factory, workshop, production-line and machinery images are managed as evidence in Seller Verification.</p><a className="button button--secondary button--full" href="/seller/verification">Manage evidence</a></section>
      <section className="module-panel"><h2>Inspection</h2><p className="factory-note">{form.inspection?.scheduledAt ? `Scheduled for ${new Date(form.inspection.scheduledAt).toLocaleString()}` : 'An inspection can be scheduled after your verification application enters review.'}</p>{form.inspection?.reportUrl && <a href={form.inspection.reportUrl} target="_blank" rel="noreferrer">View assessment report</a>}</section>
    </aside></div>
  </main></AppShell>
}
