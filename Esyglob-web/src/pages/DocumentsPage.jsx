import { Archive, Download, FilePlus2, FileText, ShieldCheck, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { archiveDocument, createDocument, fetchDocuments } from '../api/account'
import { resolveApiResourceUrl } from '../api/client'
import AppShell from '../components/AppShell'
import { AttachmentUploader, StatusBadge } from '../components/TradeUI'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'
import { useConfirm, useToast } from '../components/EnterpriseUX'

const types = ['commercial_invoice', 'packing_list', 'bill_of_lading', 'certificate_of_origin', 'purchase_order', 'technical_specification', 'inspection_certificate', 'other']

export default function DocumentsPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const query = useAsyncData(useCallback(() => fetchDocuments(), []))
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [form, setForm] = useState({ name: '', type: 'other', category: 'other' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event) {
    event.preventDefault()
    if (!files[0]) return setError('Upload a document first.')
    setBusy(true); setError('')
    try {
      const file = files[0]
      await createDocument({ ...form, name: form.name || file.filename, fileUrl: file.url, fileType: file.type, status: 'draft' })
      toast.success('Document saved to your trade workspace.')
      setOpen(false); setFiles([]); setForm({ name: '', type: 'other', category: 'other' }); await query.reload()
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  async function remove(item) {
    if (!await confirm({ title: 'Archive document?', message: `${item.name || 'This document'} will be removed from your active document workspace.`, confirmLabel: 'Archive document' })) return
    setError('')
    try { await archiveDocument(resolveId(item)); toast.success('Document archived.'); await query.reload() } catch (next) { setError(next.message) }
  }
  const documents = query.data || []
  return <AppShell><div className="container module-page">
    <PageHead eyebrow="Trade documentation" title="Documents" description="A single secure record of uploaded, generated and verification documents." />
    <div className="module-actions"><button className="button button--primary" onClick={() => setOpen(true)}><FilePlus2 /> Add document</button></div>
    {error && <p className="action-error">{error}</p>}
    {query.loading ? <TradeSkeleton /> : query.error ? <p className="inline-error">{query.error.message}</p> : documents.length
      ? <div className="document-record-grid">{documents.map(item => <article className="module-panel document-record-card" key={resolveId(item)}>
        <i>{item.source === 'verification' ? <ShieldCheck /> : <FileText />}</i><div><span>{String(item.type || 'document').replaceAll('_', ' ')}</span><h2>{item.name || item.documentNumber}</h2><p>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</p></div>
        <StatusBadge status={item.status || 'draft'} />
        <div className="document-record-actions"><a className="button button--primary" href={resolveApiResourceUrl(item.fileUrl || item.url)} target="_blank" rel="noreferrer"><Download /> Open</a>{item.source !== 'verification' && <button className="button button--secondary" onClick={() => remove(item)}><Archive /> Archive</button>}</div>
      </article>)}</div>
      : <div className="module-panel empty-results"><FileText /><h2>No documents yet</h2><p>Upload commercial or compliance records to keep them available across your trade workflow.</p></div>}
  </div>
  {open && <div className="modal-backdrop" onMouseDown={() => setOpen(false)}><form className="module-modal" onMouseDown={event => event.stopPropagation()} onSubmit={save}>
    <div className="compact-heading"><div><h2>Add document</h2><p>Files remain private to your account unless shared through a trade workspace.</p></div><button type="button" onClick={() => setOpen(false)}><X /></button></div>
    <label>Document name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Commercial invoice, specification…" /></label>
    <div className="form-grid"><label>Type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}>{types.map(type => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label><label>Category<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option value="other">Other</option><option value="export">Export</option><option value="import">Import</option><option value="finance">Finance</option><option value="shipping">Shipping</option><option value="compliance">Compliance</option></select></label></div>
    <AttachmentUploader folder="documents" value={files} onChange={setFiles} accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" />
    {error && <p className="action-error">{error}</p>}<button className="button button--primary button--full" disabled={busy}>{busy ? 'Saving…' : <><FilePlus2 /> Save document</>}</button>
  </form></div>}
  </AppShell>
}
