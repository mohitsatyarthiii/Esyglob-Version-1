import { FileText, Paperclip, X } from 'lucide-react'
import { useState } from 'react'
import { uploadFiles } from '../api/trade'
import { useCurrency } from '../preferences/currency-context'

export function StatusBadge({ status = 'pending' }) {
  return <span className={`trade-status trade-status--${String(status).toLowerCase()}`}>{String(status).replaceAll('_', ' ')}</span>
}

export function Money({ value, currency = 'INR' }) {
  const { formatPrice } = useCurrency()
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Request price'
  try { return formatPrice(amount, currency) }
  catch { return `${currency} ${amount.toLocaleString('en-IN')}` }
}

export function DetailItem({ label, children }) {
  if (children === undefined || children === null || children === '') return null
  return <div className="trade-detail-item"><dt>{label}</dt><dd>{children}</dd></div>
}

export function AttachmentUploader({ folder, value, onChange, accept }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function select(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setBusy(true); setError('')
    try {
      const uploads = await uploadFiles(files, folder)
      onChange([...value, ...uploads.map((file, index) => ({ url: file.secure_url || file.url || file.location, filename: file.name || file.originalname || files[index]?.name, type: file.mimeType || file.type || files[index]?.type }))])
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false); event.target.value = '' }
  }
  return <div className="attachment-uploader"><label><Paperclip /> {busy ? 'Uploading…' : 'Add images or documents'}<input type="file" multiple disabled={busy} accept={accept} onChange={select} /></label>{error && <small className="action-error">{error}</small>}{value.map((file, index) => <div className="attachment-chip" key={`${file.url}-${index}`}><FileText /><a href={file.url} target="_blank" rel="noreferrer">{file.filename || `Attachment ${index + 1}`}</a><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}><X /></button></div>)}</div>
}
