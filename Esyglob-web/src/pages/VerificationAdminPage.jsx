/* eslint-disable react-hooks/set-state-in-effect */
import { CalendarClock, CheckCircle2, ClipboardCheck, Factory, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import { fetchVerificationReviews, reviewVerification } from '../api/verification'
import UnifiedSearchInput from '../components/UnifiedSearchInput'

const statuses = ['under_review', 'additional_information_required', 'factory_inspection_scheduled', 'approved', 'rejected', 'reverification_required']
const label = value => String(value || '').replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')

export default function VerificationAdminPage() {
  const [items, setItems] = useState([]), [selected, setSelected] = useState(null), [status, setStatus] = useState('under_review')
  const [notes, setNotes] = useState(''), [inspection, setInspection] = useState(''), [search, setSearch] = useState(''), [message, setMessage] = useState('')
  const load = useCallback(async () => { const result = await fetchVerificationReviews({ status: 'all', search }); setItems(result?.verifications || result || []) }, [search])
  useEffect(() => { load().catch(error => setMessage(error.message)) }, [load])
  async function submit() {
    try { await reviewVerification(selected._id, { status, notes, inspectionScheduledAt: inspection || undefined }); setMessage('Application updated'); setSelected(null); setNotes(''); load() }
    catch (error) { setMessage(error.message) }
  }
  return <AppShell><main className="container admin-verification-page">
    <header className="verification-hero"><div><span className="eyebrow">Trust operations</span><h1>Verification review queue</h1><p>Review evidence, request information, schedule inspections and approve verified suppliers.</p></div><div className="verification-status"><ClipboardCheck /><span><small>Applications</small><b>{items.length} in queue</b></span></div></header>
    {message && <div className="verification-alert">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    <UnifiedSearchInput className="admin-review-search" compact suggestions={false} value={search} onChange={setSearch} onSubmit={setSearch} placeholder="Search company or document" />
    <div className="admin-review-layout"><section className="admin-review-list">{items.map(item => <button className={selected?._id === item._id ? 'active' : ''} onClick={() => { setSelected(item); setStatus(item.status === 'submitted' ? 'under_review' : item.status) }} key={item._id}><i><Factory /></i><span><b>{item.sellerId?.companyName || 'Seller application'}</b><small>{label(item.status)} · {item.verificationMethod === 'digilocker' ? 'DigiLocker' : 'Manual'}</small></span><strong>{item.overallTrustScore || 0}</strong></button>)}</section>
      <section className="module-panel admin-review-detail">{selected ? <>
        <h2>{selected.sellerId?.companyName}</h2><p>Submitted {new Date(selected.submittedAt || selected.createdAt).toLocaleString()}</p>
        <div className="admin-verification-method"><small>Verification method</small><b>{selected.verificationMethod === 'digilocker' ? 'DigiLocker · automatically processed documents' : 'Manual · seller-uploaded documents'}</b></div>
        {selected.digilocker?.documents?.length > 0 && <div className="admin-digilocker-summary"><h3>DigiLocker evidence</h3>{selected.digilocker.documents.map(document => <article key={`${document.doctype}-${document.providerReferenceHash}`}><CheckCircle2 /><span><b>{document.label || label(document.type)}</b><small>{document.issuer || 'Government issuer'} · {label(document.category)}</small></span><strong>{label(document.status)}</strong></article>)}{selected.digilocker.matches?.length > 0 && <div>{selected.digilocker.matches.map((match, index) => <span className={`match-${match.status}`} key={`${match.field}-${index}`}><b>{label(match.field)}</b><small>{label(match.status)}</small></span>)}</div>}</div>}
        <div className="admin-doc-list">{selected.documents?.filter(document => document.status !== 'archived').map(document => <a key={document._id} href={`/api/suppliers/verification/documents/${document._id}`} target="_blank" rel="noreferrer"><CheckCircle2 /><span><b>{document.name}</b><small>{label(document.type)} · {label(document.status)}</small></span></a>)}</div>
        <label><span>Decision</span><select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        {status === 'factory_inspection_scheduled' && <label><span><CalendarClock /> Inspection date</span><input type="datetime-local" value={inspection} onChange={event => setInspection(event.target.value)} /></label>}
        <label><span>Reviewer notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Explain the decision or requested changes" /></label>
        <button className="button button--primary button--full" onClick={submit}><RefreshCw />Update application</button>
      </> : <div className="empty-timeline"><ClipboardCheck /><p>Select an application to begin review.</p></div>}</section>
    </div>
  </main></AppShell>
}
