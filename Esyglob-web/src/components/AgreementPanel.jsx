import { Check, CheckCircle2, Download, FileSignature, FileText, History, PackageCheck, PenLine, Printer, RefreshCw, Share2, ShieldCheck, Signature, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchUnifiedTradeWorkspace, signTradeDocument, startSellerOrder, updateQuotation } from '../api/trade'
import { resolveApiResourceUrl } from '../api/client'
import { useAuth } from '../auth/auth-context'
import { getRealtimeClient } from '../realtime/socket'
import { AttachmentUploader, Money } from './TradeUI'

const visibleStatuses = new Set(['buyer_accepted', 'final_quotation_pending', 'final_quotation_signed', 'won'])
const steps = ['Quotation Accepted', 'Seller Finalizes', 'Seller Signature', 'Buyer Review', 'Buyer Signature', 'Order Enabled']
const id = value => String(value?._id || value || '')

export default function FinalQuotationPanel({ quotationId }) {
  const { user, status } = useAuth()
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
    <header><div><span className="eyebrow"><ShieldCheck /> Official commercial document</span><h2 id="final-quotation-title">Final Quotation</h2><p>{quotation.directOrderEnabled ? 'The Seller signature locks the final terms and immediately enables Place Order for the Buyer.' : 'The Seller signs first. The Buyer then reviews and signs the locked commercial record; no buyer order action is enabled.'}</p></div><span className={`agreement-state agreement-state--${document?.status || quotation.finalQuotation?.status || 'preparation'}`}>{label(document?.status || quotation.finalQuotation?.status || 'Seller preparation')}</span></header>
    <FinalStepper quotation={quotation} document={document} />
    {loading ? <Loading /> : error ? <div className="inline-error">{error}<button onClick={() => load()}>Retry</button></div> : quotation.status === 'buyer_accepted' && data.actorRole === 'seller' ? <FinalPreparation quotation={quotation} onComplete={completed} setError={setError} /> : quotation.status === 'buyer_accepted' ? <Waiting title="Seller is preparing the Final Quotation" copy="You will be notified after the Seller prepares and signs the final terms." /> : document ? <FinalDocument data={data} quotation={quotation} document={document} versions={versions} user={user} authStatus={status} onComplete={completed} setError={setError} /> : <Waiting title="Final Quotation is being generated" copy="The signed commercial workflow will appear here automatically." />}
  </section>
}

function FinalStepper({ quotation, document }) {
  const signed = document?.status === 'completed' || quotation.status === 'final_quotation_signed' || quotation.status === 'won'
  const sellerSigned = document?.signatures?.some(item => item.signerRole === 'seller')
  if (quotation.directOrderEnabled) {
    const directSteps = ['Quotation Accepted', 'Seller Finalizes', 'Seller Signature', 'Direct Order Enabled']
    const directCount = signed ? directSteps.length : document ? 2 : quotation.status === 'buyer_accepted' ? 1 : 0
    return <ol className="agreement-stepper">{directSteps.map((step, index) => <li className={index < directCount ? 'done' : index === directCount ? 'current' : ''} key={step}><i>{index < directCount ? <Check /> : index + 1}</i><span>{step}</span></li>)}</ol>
  }
  const count = signed ? 6 : sellerSigned ? 4 : document ? 2 : quotation.status === 'buyer_accepted' ? 1 : 0
  return <ol className="agreement-stepper">{steps.map((step, index) => <li className={index < count ? 'done' : index === count ? 'current' : ''} key={step}><i>{index < count ? <Check /> : index + 1}</i><span>{step}</span></li>)}</ol>
}

function FinalPreparation({ quotation, onComplete, setError }) {
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState(quotation.attachments || [])
  const [form, setForm] = useState({ suppliedQuantity: quotation.suppliedQuantity || '', minimumOrderQuantity: quotation.minimumOrderQuantity || 1, unitPrice: quotation.unitPrice || '', leadTime: quotation.leadTime || '', shippingTerms: quotation.shippingTerms || '', paymentTerms: quotation.paymentTerms || '', expiryDate: quotation.expiryDate ? String(quotation.expiryDate).slice(0, 10) : '', notes: quotation.notes || quotation.sellerMessage || '', enableDirectOrder: Boolean(quotation.directOrderEnabled) })
  const total = Number(form.unitPrice || 0) * Number(form.suppliedQuantity || 0) + Number(quotation.shippingCost || 0) + Number(quotation.taxes?.amount || 0)
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!window.confirm('Generate this Final Quotation with the displayed product details and total amount?')) return
    setBusy(true); setError('')
    try {
      await updateQuotation(id(quotation), { action: 'confirm', suppliedQuantity: Number(form.suppliedQuantity), minimumOrderQuantity: Number(form.minimumOrderQuantity), unitPrice: Number(form.unitPrice), totalPrice: total, leadTime: Number(form.leadTime || 0), shippingTerms: form.shippingTerms, paymentTerms: form.paymentTerms, expiryDate: form.expiryDate || undefined, notes: form.notes, attachments, enableDirectOrder: form.enableDirectOrder, reason: 'Seller prepared the Final Quotation' })
      await onComplete(form.enableDirectOrder ? 'Final Quotation generated. Your Seller signature will activate Place Order for the Buyer.' : 'Final Quotation generated. Add your Seller signature to send it to the Buyer.')
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  return <form className="agreement-preparation" onSubmit={submit}>
    <div className="agreement-section-heading"><span><PenLine /></span><div><h3>Prepare the Final Quotation</h3><p>Product, RFQ and negotiation history are linked automatically. Complete the final execution terms.</p></div></div>
    <FinalPreview quotation={quotation} form={form} total={total} />
    <div className="agreement-form-grid">{[['unitPrice','Unit price','number'],['minimumOrderQuantity','MOQ','number'],['suppliedQuantity','Available quantity','number'],['leadTime','Lead time (days)','number'],['shippingTerms','Shipping method','text'],['paymentTerms','Payment terms','text'],['expiryDate','Valid until','date']].map(([key,title,type]) => <label key={key}>{title}<input type={type} min={type === 'number' ? 0 : undefined} value={form[key] || ''} onChange={event => update(key, event.target.value)} required={['suppliedQuantity','minimumOrderQuantity','unitPrice','leadTime','paymentTerms'].includes(key)} /></label>)}</div>
    <label>Commercial notes<textarea rows="3" value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
    <AttachmentUploader folder="final-quotations" value={attachments} onChange={setAttachments} />
    <label className="final-quotation-consent"><input type="checkbox" checked={form.enableDirectOrder} onChange={event => update('enableDirectOrder', event.target.checked)} /><span><b>Enable Direct Order</b><small>After your Seller signature, the Buyer can select Place Order immediately. No duplicate quotation or additional approval is created.</small></span></label>
    <div className="agreement-total"><span>Final Quotation value</span><b><Money value={total} currency={quotation.currency} /></b></div>
    <button className="button button--primary" disabled={busy}><FileSignature /> {busy ? 'Generating Final Quotation…' : 'Generate Final Quotation'}</button>
  </form>
}

function FinalPreview({ quotation, form, total }) {
  const terms = [['MOQ', form.minimumOrderQuantity], ['Lead time', form.leadTime], ['Shipping', form.shippingTerms], ['Payment', form.paymentTerms], ['Valid until', form.expiryDate]]
  return <section className="live-agreement-preview">
    <header><div><i>E</i><span><b>ESYGLOB ENTERPRISE TRADE</b><small>Official Final Quotation</small></span></div><div><strong>{quotation.finalQuotation?.finalQuotationNumber}</strong><small>Quotation {quotation.quotationNumber}</small><em>Seller signature required</em></div></header>
    <h4>Final Quotation</h4>
    <table><thead><tr><th>Product</th><th>Available quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody><tr><td>{quotation.productId?.name || quotation.rfqId?.title || 'Quoted product'}</td><td>{form.suppliedQuantity || '—'}</td><td><Money value={Number(form.unitPrice || 0)} currency={quotation.currency} /></td><td><Money value={total} currency={quotation.currency} /></td></tr></tbody></table>
    <div className="live-terms-grid">{terms.map(([title, value]) => <span key={title}><small>{title}</small><b>{value || 'To be completed'}</b></span>)}</div>
    {form.notes && <p className="live-contract-notes"><b>Commercial Notes</b>{form.notes}</p>}
    <footer><span>Seller information verified</span><span>{form.enableDirectOrder ? 'Seller signature activates Direct Order' : 'Two-party signature audit'}</span></footer>
  </section>
}

function FinalDocument({ data, quotation, document, versions, user, authStatus, onComplete, setError }) {
  const navigate = useNavigate()
  const previewFrameRef = useRef(null)
  const actorRole = data.actorRole
  const directOrderReady = document.status === 'completed' && quotation.directOrderEnabled
  const signed = document.status === 'completed' && !quotation.directOrderEnabled
  const canSign = !signed && ((actorRole === 'seller' && document.status === 'awaiting_seller_signature') || (actorRole === 'buyer' && document.status === 'awaiting_buyer_signature'))
  const [busy, setBusy] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const [changeFiles, setChangeFiles] = useState([])
  const [signatureType, setSignatureType] = useState('typed')
  const [signerName, setSignerName] = useState(user?.fullName || user?.name || '')
  const [signatureValue, setSignatureValue] = useState('')
  const [previewHeight, setPreviewHeight] = useState(720)
  const previewUrl = resolveApiResourceUrl(document.previewUrl)
  useEffect(() => {
    const previewOrigin = new URL(previewUrl, window.location.href).origin
    const resizePreview = event => {
      if (event.source !== previewFrameRef.current?.contentWindow || event.origin !== previewOrigin) return
      if (event.data?.type !== 'esyglob:document-height' || event.data.documentId !== id(document)) return
      const nextHeight = Math.ceil(Number(event.data.height))
      if (Number.isFinite(nextHeight) && nextHeight >= 320) setPreviewHeight(nextHeight)
    }
    window.addEventListener('message', resizePreview)
    return () => window.removeEventListener('message', resizePreview)
  }, [document, previewUrl])
  async function sign() {
    if (!canSign || !termsAccepted || busy || !signerName.trim() || !signatureValue) return
    setBusy(true); setError('')
    try {
      await signTradeDocument('quotation', id(quotation), document._id, { signerName: signerName.trim(), signatureValue, signatureType, termsAccepted: true, termsVersion: 'final-quotation-terms-v1' })
      setSignOpen(false)
      await onComplete(actorRole === 'seller' ? quotation.directOrderEnabled ? 'Seller signature recorded. Place Order is now available to the Buyer.' : 'Seller signature recorded. The Buyer can now review and sign.' : quotation.directOrderEnabled ? 'Final Quotation signed. Place Order is enabled.' : 'Final Quotation fully signed and locked.')
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
  async function startCheckout() {
    if (!window.confirm('Place this order and open checkout using the locked Final Quotation terms?')) return
    if (busy) return
    if (authStatus !== 'authenticated') {
      navigate('/login', { state: { from: `/quotations/${id(quotation)}` } })
      return
    }
    if (data.order?._id) {
      navigate(`/orders/${id(data.order)}`)
      return
    }
    setBusy(true); setError('')
    try {
      const order = await startSellerOrder({ quotationId: id(quotation) })
      navigate(`/orders/${id(order)}`)
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  return <div className="agreement-document">
    <div className="agreement-document-toolbar"><div><FileSignature /><span><small>{quotation.finalQuotation?.finalQuotationNumber}</small><b>{document.title}</b><em>Version {document.version || 1} · {label(document.status)}</em></span></div><div><Link className="button button--secondary" to={`/agreements?quotation=${id(quotation)}&role=${actorRole}`}>Agreements</Link><a className="button button--secondary" href={previewUrl} target="_blank" rel="noreferrer"><FileText /> Preview</a><a className="button button--secondary" href={`${previewUrl}?format=pdf`} target="_blank" rel="noreferrer"><Download /> Download</a><button type="button" className="button button--secondary" onClick={shareDocument}><Share2 /> Share</button><button type="button" className="button button--secondary" onClick={printDocument}><Printer /> Print</button></div></div>
    <div className="agreement-preview" style={{ height: previewHeight }}><iframe ref={previewFrameRef} title="Final Quotation preview" src={previewUrl} scrolling="no" /></div>
    <div className="final-quotation-version"><History /><span><b>Version history</b><small>{versions.map(item => `v${item.version} ${label(item.status)}`).join(' · ')}</small></span></div>
    {canSign && <div className="final-quotation-signing"><label className="final-quotation-consent"><input type="checkbox" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} /><span><b>I have reviewed and accept this Final Quotation and its terms and conditions.</b><small>This acknowledgement is required and will be recorded with your electronic signature.</small></span></label><div className="final-quotation-actions">{actorRole === 'buyer' && <button type="button" className="button button--secondary" onClick={() => setChangesOpen(true)}><RefreshCw /> Request Changes</button>}<button type="button" className="button button--primary" disabled={!termsAccepted || busy} onClick={() => setSignOpen(true)}><Signature /> Add {label(actorRole)} Signature</button></div></div>}
    {actorRole === 'buyer' && document.status === 'awaiting_seller_signature' && <Waiting title="Seller signature pending" copy="Buyer review and signing opens automatically after the Seller signs this version." />}
    {actorRole === 'seller' && document.status === 'awaiting_buyer_signature' && <Waiting title="Buyer review in progress" copy="The Seller-signed document is locked. The Buyer can request changes or add the final signature." />}
    {directOrderReady && <div className="agreement-active-banner"><CheckCircle2 /><div><b>Direct Order enabled from Seller Final Quotation</b><p>The Seller-signed commercial terms are locked. The Buyer can place the order immediately without another approval.</p></div>{actorRole === 'buyer' ? <button className="button button--primary" disabled={busy} onClick={startCheckout}><PackageCheck /> {busy ? 'Opening checkout…' : 'Place Order'}</button> : data.order?._id ? <Link className="button button--primary" to={`/orders/${id(data.order)}?role=seller`}><PackageCheck /> Open Order</Link> : <span className="agreement-state agreement-state--awaiting_buyer_signature">Waiting for Buyer order</span>}</div>}
    {signed && <div className="agreement-active-banner"><CheckCircle2 /><div><b>Final Quotation fully signed and permanently locked</b><p>Both signatures are embedded in the official PDF. Direct ordering was not enabled for this quotation.</p></div>{actorRole === 'seller' && data.order?._id ? <Link className="button button--primary" to={`/orders/${id(data.order)}?role=seller`}><PackageCheck /> Open Order</Link> : <span className="agreement-state agreement-state--awaiting_buyer_signature">No buyer order action</span>}</div>}
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
