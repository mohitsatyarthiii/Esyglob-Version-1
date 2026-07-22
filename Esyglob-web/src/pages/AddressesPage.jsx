import { Check, Edit3, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { createAddress, deleteAddress, fetchAddresses, setDefaultAddress, updateAddress } from '../api/account'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

const empty = { fullName: '', companyName: '', phone: '', country: '', state: '', city: '', postalCode: '', address: '', landmark: '', isDefault: false }

export default function AddressesPage() {
  const query = useAsyncData(useCallback(() => fetchAddresses(), []))
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = (item) => { setEditing(item || {}); setForm(item ? { ...empty, ...item, postalCode: item.postalCode || item.pincode || '' } : empty); setError('') }
  async function save(event) { event.preventDefault(); setBusy(true); setError(''); try { const id = resolveId(editing); if (id) await updateAddress(id, form); else await createAddress(form); setEditing(null); await query.reload() } catch (next) { setError(next.message) } finally { setBusy(false) } }
  async function remove(item) { if (!window.confirm('Delete this saved address?')) return; await deleteAddress(resolveId(item)); query.reload() }
  return <AppShell><div className="container module-page"><PageHead eyebrow="Delivery preferences" title="Address book" description="Manage shipping and billing destinations used across checkout, RFQs and orders." /><div className="module-actions"><button className="button button--primary" onClick={() => open()}><Plus /> Add address</button></div>{query.loading ? <TradeSkeleton /> : query.error ? <p className="inline-error">{query.error.message}</p> : query.data?.length ? <div className="address-grid">{query.data.map((item) => <article key={resolveId(item)} className={item.isDefault ? 'is-default' : ''}><div className="address-card-head"><i><MapPin /></i><div><h2>{item.fullName}</h2><p>{item.companyName}</p></div>{item.isDefault && <span><Check /> Default</span>}</div><p>{item.address || item.line1}{item.landmark ? `, ${item.landmark}` : ''}<br />{item.city}, {item.state} {item.postalCode || item.pincode}<br />{item.country}</p><b>{item.phone}</b><div className="address-actions">{!item.isDefault && <button onClick={() => { setDefaultAddress(resolveId(item)).then(query.reload) }}><Check /> Set default</button>}<button onClick={() => open(item)}><Edit3 /> Edit</button><button className="danger-text" onClick={() => remove(item)}><Trash2 /> Delete</button></div></article>)}</div> : <div className="empty-results"><MapPin /><h2>No saved addresses</h2><p>Add a shipping or billing destination to speed up trade checkout.</p><button className="button button--primary" onClick={() => open()}><Plus /> Add your first address</button></div>}</div>{editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><form className="module-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={save}><div className="compact-heading"><h2>{resolveId(editing) ? 'Edit address' : 'Add address'}</h2><button type="button" onClick={() => setEditing(null)}><X /></button></div><div className="form-grid"><Field label="Contact name" name="fullName" form={form} setForm={setForm} /><Field label="Company" name="companyName" form={form} setForm={setForm} optional /><Field label="Phone" name="phone" form={form} setForm={setForm} /><Field label="Country" name="country" form={form} setForm={setForm} /><Field label="State" name="state" form={form} setForm={setForm} /><Field label="City" name="city" form={form} setForm={setForm} /><Field label="Postal code" name="postalCode" form={form} setForm={setForm} /><Field label="Landmark" name="landmark" form={form} setForm={setForm} optional /></div><label className="field-wide">Street address<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></label><label className="check-field"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Make this the default address</label>{error && <p className="action-error">{error}</p>}<button className="button button--primary button--full" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button></form></div>}</AppShell>
}

function Field({ label, name, form, setForm, optional }) { return <label>{label}<input value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} required={!optional} /></label> }
