import { Check, CheckCircle2, Download, FileSignature, FileText, History, PackageCheck, PenLine, Printer, RefreshCw, Share2, ShieldCheck, Signature, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUnifiedTradeWorkspace, signTradeDocument, updateQuotation } from '../api/trade'
import { resolveApiResourceUrl } from '../api/client'
import { useAuth } from '../auth/auth-context'
import { getRealtimeClient } from '../realtime/socket'
import { AttachmentUploader, Money } from './TradeUI'

const visibleStatuses = new Set(['buyer_accepted', 'final_quotation_pending', 'final_quotation_signed', 'won'])
const steps = ['Quotation Accepted', 'Seller Finalizes', 'Seller Signature', 'Buyer Review', 'Buyer Signature', 'Order Enabled']
const id = value => String(value?._id || value || '')

export default function FinalQuotationPanel({ quotationId }) {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      setData(await fetchUnifiedTradeWorkspace('quotation', quotationId))
      setError('')
    } catch (next) {
      if (!quiet) setError(next.message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [quotationId])
  useEffect(() => { const task = Promise.resolve().then(() => load()); return () => { void task } }, [load])
  useEffect(() => { const timer = window.setInterval(() => load(true), 12000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => {
    let socket
    const onUpdate = event => { if (id(event.quotationId) === id(quotationId)) load(true) }
    getRealtimeClient().then(client => { socket = client; client.on('quotation_updated', onUpdate) }).catch(() => {})
    return () => socket?.off('quotation_updated', onUpdate)
  }, [load, quotationId])
  useEffect(() => { if (!success) return undefined; const timer = window.setTimeout(() => setSuccess(''), 6500); return () => window.clearTimeout(timer) }, [success])
  const quotation = data?.activeQuotation || {}
  const versions = useMemo(() => (data?.documents || []).filter(item => item.entityType === 'quotation' && id(item.entityId) === id(quotationId) && item.documentType === 'quotation' && item.metadata?.isFinalQuotation).sort((a, b) => Number(b.version || 0) - Number(a.version || 0)), [data?.documents, quotationId])
  const document = versions.find(item => item.status !== 'void')
  if (!loading && (!quotation._id || !visibleStatuses.has(quotation.status))) return null
  const completed = async message => { setSuccess(message); await load(true) }
  return <section className="container agreement-lifecycle-section" aria-labelledby="final-quotation-title">
    {success && <div className="workflow-success-banner" role="status"><CheckCircle2 /><span>{success}</span><button onClick={() => setSuccess('')} aria-label="Dismiss"><X /></button></div>}
    <header><div><span className="eyebrow"><ShieldCheck /> Official commercial document</span><h2 id="final-quotation-title">Final Quotation</h2><p>The Seller prepares and signs first. The Buyer then reviews and signs to lock terms and enable Start Order.</p></div><span className={`agreement-state agreement-state--${document?.status || quotation.finalQuotation?.status || 'preparation'}`}>{label(document?.status || quotation.finalQuotation?.status || 'Seller preparation')}</span></header>
    <FinalStepper quotation={quotation} document={document} />
    {loading ? <Loading /> : error ? <div className="inline-error">{error}<button onClick={() => load()}>Retry</button></div> : quotation.status === 'buyer_accepted' && data.actorRole === 'seller' ? <FinalPreparation quotation={quotation} onComplete={completed} setError={setError} /> : quotation.status === 'buyer_accepted' ? <Waiting title="Seller is preparing the Final Quotation" copy="You will be notified after the Seller prepares and signs the final terms." /> : document ? <FinalDocument data={data} quotation={quotation} document={document} versions={versions} user={user} onComplete={completed} setError={setError} /> : <Waiting title="Final Quotation is being generated" copy="The signed commercial workflow will appear here automatically." />}
  </section>
}

function FinalStepper({ quotation, document }) {
  const signed = document?.status === 'completed' || quotation.status === 'final_quotation_signed' || quotation.status === 'won'
  const sellerSigned = document?.signatures?.some(item => item.signerRole === 'seller')
  const count = signed ? 6 : sellerSigned ? 4 : document ? 2 : quotation.status === 'buyer_accepted' ? 1 : 0
  return <ol className="agreement-stepper">{steps.map((step, index) => <li className={index < count ? 'done' : index === count ? 'current' : ''} key={step}><i>{index < count ? <Check /> : index + 1}</i><span>{step}</span></li>)}</ol>
}

function FinalPreparation({ quotation, onComplete, setError }) {
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState(quotation.attachments || [])
  const [form, setForm] = useState({ suppliedQuantity: quotation.suppliedQuantity || '', unitPrice: quotation.unitPrice || '', productionTime: quotation.productionTime || '', leadTime: quotation.leadTime || '', shippingEstimate: quotation.shippingEstimate || '', shippingTerms: quotation.shippingTerms || '', paymentTerms: quotation.paymentTerms || '', packaging: typeof quotation.packaging === 'string' ? quotation.packaging : quotation.packaging?.details || '', warranty: quotation.warranty || '', notes: quotation.notes || quotation.sellerMessage || '', specialClauses: (quotation.specialClauses || []).join('\n') })
  const total = Number(form.unitPrice || 0) * Number(form.suppliedQuantity || 0) + Number(quotation.shippingCost || 0) + Number(quotation.taxes?.amount || 0)
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await updateQuotation(id(quotation), { action: 'confirm', suppliedQuantity: Number(form.suppliedQuantity), unitPrice: Number(form.unitPrice), totalPrice: total, productionTime: Number(form.productionTime || 0), leadTime: Number(form.leadTime || 0), shippingEstimate: form.shippingEstimate, shippingTerms: form.shippingTerms, paymentTerms: form.paymentTerms, packaging: { details: form.packaging }, warranty: form.warranty, notes: form.notes, specialClauses: form.specialClauses, attachments, reason: 'Seller prepared the Final Quotation' })
      await onComplete('Final Quotation generated. Add your Seller signature to send it to the Buyer.')
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  return <form className="agreement-preparation" onSubmit={submit}>
    <div className="agreement-section-heading"><span><PenLine /></span><div><h3>Prepare the Final Quotation</h3><p>Product, RFQ and negotiation history are linked automatically. Complete the final execution terms.</p></div></div>
    <FinalPreview quotation={quotation} form={form} total={total} />
    <div className="agreement-form-grid">{[['suppliedQuantity','Final quantity','number'],['unitPrice','Final unit price','number'],['productionTime','Production timeline (days)','number'],['leadTime','Lead time (days)','number'],['shippingEstimate','Delivery timeline','text'],['shippingTerms','Shipping method','text'],['paymentTerms','Payment terms','text'],['packaging','Packaging details','text'],['warranty','Warranty','text']].map(([key,title,type]) => <label key={key}>{title}<input type={type} min={type === 'number' ? 0 : undefined} value={form[key] || ''} onChange={event => update(key, event.target.value)} required={['suppliedQuantity','unitPrice','paymentTerms'].includes(key)} /></label>)}</div>
    <label>Commercial notes<textarea rows="3" value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
    <label>Special conditions <small>One condition per line</small><textarea rows="4" value={form.specialClauses} onChange={event => update('specialClauses', event.target.value)} /></label>
    <AttachmentUploader folder="final-quotations" value={attachments} onChange={setAttachments} />
    <div className="agreement-total"><span>Final Quotation value</span><b><Money value={total} currency={quotation.currency} /></b></div>
    <button className="button button--primary" disabled={busy}><FileSignature /> {busy ? 'Generating Final Quotation…' : 'Generate & Sign Final Quotation'}</button>
  </form>
}

function FinalPreview({ quotation, form, total }) {
  return <section className="live-agreement-preview"><header><div><i>E</i><span><b>ESYGLOB ENTERPRISE TRADE</b><small>Official Final Quotation</small></span></div><div><strong>{quotation.finalQuotation?.finalQuotationNumber}</strong><small>Quotation {quotation.quotationNumber}</small><em>Seller signature required</em></div></header><h4>Final Quotation</h4><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody><tr><td>{quotation.productId?.name || quotation.rfqId?.title || 'Quoted product'}</td><td>{form.suppliedQuantity || '—'}</td><td><Money value={Number(form.unitPrice || 0)} currency={quotation.currency} /></td><td><Money value={total} currency={quotation.currency} /></td></tr></tbody></table><div className="live-terms-grid">{[['Production',form.productionTime],['Delivery',form.shippingEstimate || form.leadTime],['Shipping',form.shippingTerms],['Payment',form.paymentTerms],['Packaging',form.packaging],['Warranty',form.warranty]].map(([title,value]) => <span key={title}><small>{title}</small><b>{value || 'To be completed'}</b></span>)}</div>{form.notes && <p className="live-contract-notes"><b>Commercial Notes</b>{form.notes}</p>}<footer><span>Seller information verified</span><span>Two-party signature audit</span></footer></section>
}

function FinalDocument({ data, quotation, document, versions, user, onComplete, setError }) {
  const actorRole = data.actorRole
  const signed = document.status === 'completed'
  const canSign = !signed && ((actorRole === 'seller' && document.status === 'awaiting_seller_signature') || (actorRole === 'buyer' && document.status === 'awaiting_buyer_signature'))
  const [busy, setBusy] = useState(false)
  const [signOpen, setSignOpen] = useState(() => actorRole === 'seller' && document.status === 'awaiting_seller_signature')
  const [changesOpen, setChangesOpen] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const [changeFiles, setChangeFiles] = useState([])
  const [signatureType, setSignatureType] = useState('typed')
  const [signerName, setSignerName] = useState(user?.fullName || user?.name || '')
  const [signatureValue, setSignatureValue] = useState('')
  const previewUrl = resolveApiResourceUrl(document.previewUrl)
  async function sign() {
    if (!canSign || busy || !signerName.trim() || !signatureValue) return
    setBusy(true); setError('')
    try {
      await signTradeDocument('quotation', id(quotation), document._id, { signerName: signerName.trim(), signatureValue, signatureType })
      setSignOpen(false)
      await onComplete(actorRole === 'seller' ? 'Seller signature recorded. The Buyer can now review and sign.' : 'Final Quotation fully signed. Start Order is now enabled.')
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  async function requestChanges() {
    if (busy || !changeReason.trim()) return
    setBusy(true); setError('')
    try {
      await updateQuotation(id(quotation), { action: 'request_revision', reason: changeReason.trim(), buyerMessage: changeReason.trim(), attachments: changeFiles })
      setChangesOpen(false)
      await onComplete('Changes requested. The Seller can now issue the next Final Quotation version.')
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  async function shareDocument() {
    const shareData = { title: document.title, text: `Final Quotation ${quotation.finalQuotation?.finalQuotationNumber}`, url: previewUrl }
    if (navigator.share) await navigator.share(shareData)
    else { await navigator.clipboard.writeText(previewUrl); await onComplete('Final Quotation link copied.') }
  }
  function printDocument() {
    const printWindow = window.open(previewUrl, '_blank')
    printWindow?.addEventListener('load', () => printWindow.print(), { once: true })
  }
  return <div className="agreement-document">
    <div className="agreement-document-toolbar"><div><FileSignature /><span><small>{quotation.finalQuotation?.finalQuotationNumber}</small><b>{document.title}</b><em>Version {document.version || 1} · {label(document.status)}</em></span></div><div><a className="button button--secondary" href={previewUrl} target="_blank" rel="noreferrer"><FileText /> Preview</a><a className="button button--secondary" href={`${previewUrl}?format=pdf`} target="_blank" rel="noreferrer"><Download /> Download</a><button type="button" className="button button--secondary" onClick={shareDocument}><Share2 /> Share</button><button type="button" className="button button--secondary" onClick={printDocument}><Printer /> Print</button></div></div>
    <div className="agreement-preview"><iframe title="Final Quotation preview" src={previewUrl} /></div>
    <div className="final-quotation-version"><History /><span><b>Version history</b><small>{versions.map(item => `v${item.version} ${label(item.status)}`).join(' · ')}</small></span></div>
    {canSign && <div className="final-quotation-actions">{actorRole === 'buyer' && <button type="button" className="button button--secondary" onClick={() => setChangesOpen(true)}><RefreshCw /> Request Changes</button>}<button type="button" className="button button--primary" onClick={() => setSignOpen(true)}><Signature /> Add {label(actorRole)} Signature</button></div>}
    {actorRole === 'buyer' && document.status === 'awaiting_seller_signature' && <Waiting title="Seller signature pending" copy="Buyer review and signing opens automatically after the Seller signs this version." />}
    {actorRole === 'seller' && document.status === 'awaiting_buyer_signature' && <Waiting title="Buyer review in progress" copy="The Seller-signed document is locked. The Buyer can request changes or add the final signature." />}
    {signed && <div className="agreement-active-banner"><CheckCircle2 /><div><b>Final Quotation fully signed and locked</b><p>Both signatures are embedded in the official PDF. Start Order is enabled.</p></div><Link className="button button--primary" to={`/trade-workspace/quotation/${id(quotation)}?section=execution`}><PackageCheck /> Start Order</Link></div>}
    {changesOpen && <ChangesModal busy={busy} reason={changeReason} setReason={setChangeReason} files={changeFiles} setFiles={setChangeFiles} close={() => setChangesOpen(false)} submit={requestChanges} />}
    {signOpen && <SignatureModal role={actorRole} busy={busy} signerName={signerName} setSignerName={setSignerName} signatureType={signatureType} setSignatureType={setSignatureType} signatureValue={signatureValue} setSignatureValue={setSignatureValue} close={() => setSignOpen(false)} submit={sign} />}
  </div>
}

function ChangesModal({ busy, reason, setReason, files, setFiles, close, submit }) {
  return <div className="modal-backdrop agreement-sign-modal" onMouseDown={() => !busy && close()}><section className="agreement-sign-box" onMouseDown={event => event.stopPropagation()}><header><div><span className="eyebrow">Final review</span><h3>Request changes</h3></div><button type="button" onClick={close}><X /></button></header><label>Required changes<textarea rows="5" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain exactly what the Seller should update" /></label><AttachmentUploader folder="final-quotation-revisions" value={files} onChange={setFiles} /><button className="button button--primary button--full" disabled={busy || !reason.trim()} onClick={submit}>{busy ? 'Sending…' : 'Send change request'}</button></section></div>
}

function SignatureModal({ role, busy, signerName, setSignerName, signatureType, setSignatureType, signatureValue, setSignatureValue, close, submit }) {
  return <div className="modal-backdrop agreement-sign-modal" onMouseDown={() => !busy && close()}><section className="agreement-sign-box" onMouseDown={event => event.stopPropagation()}><header><div><span className="eyebrow">Secure {role} e-signature</span><h3>Sign Final Quotation</h3></div><button type="button" onClick={close} disabled={busy}><X /></button></header><label>Legal signer name<input value={signerName} onChange={event => setSignerName(event.target.value)} /></label><div className="signature-type-tabs"><button type="button" className={signatureType === 'typed' ? 'active' : ''} onClick={() => { setSignatureType('typed'); setSignatureValue('') }}>Typed signature</button><button type="button" className={signatureType === 'drawn' ? 'active' : ''} onClick={() => { setSignatureType('drawn'); setSignatureValue('') }}>Draw signature</button></div>{signatureType === 'typed' ? <label>Type your signature<input className="typed-signature" value={signatureValue} onChange={event => setSignatureValue(event.target.value)} placeholder="Type full legal signature" /></label> : <SignatureCanvas onChange={setSignatureValue} />}<p><ShieldCheck /> By signing, you accept this Final Quotation version as the official commercial record.</p><button className="button button--primary button--full" disabled={busy || !signerName.trim() || !signatureValue} onClick={submit}><Signature /> {busy ? 'Recording signature…' : `Add ${label(role)} Signature`}</button></section></div>
}

function SignatureCanvas({ onChange }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const point = event => { const canvas = canvasRef.current; const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height } }
  const start = event => { const canvas = canvasRef.current; drawingRef.current = true; canvas.setPointerCapture(event.pointerId); const next = point(event); const context = canvas.getContext('2d'); context.beginPath(); context.moveTo(next.x, next.y) }
  const move = event => { if (!drawingRef.current) return; const next = point(event); const context = canvasRef.current.getContext('2d'); context.lineWidth = 2.2; context.lineCap = 'round'; context.strokeStyle = '#0f172a'; context.lineTo(next.x, next.y); context.stroke() }
  const stop = () => { if (!drawingRef.current) return; drawingRef.current = false; onChange(canvasRef.current.toDataURL('image/png')) }
  const clear = () => { const canvas = canvasRef.current; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); onChange('') }
  return <div className="signature-canvas"><canvas ref={canvasRef} width="700" height="180" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><button type="button" onClick={clear}>Clear signature</button></div>
}

function Loading() { return <div className="agreement-loading"><RefreshCw /> Loading Final Quotation…</div> }
function Waiting({ title, copy }) { return <div className="agreement-waiting"><RefreshCw /><div><b>{title}</b><p>{copy}</p></div></div> }
function label(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
