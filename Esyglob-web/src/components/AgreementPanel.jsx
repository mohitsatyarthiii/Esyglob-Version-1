import { Check, CheckCircle2, Download, FileSignature, FileText, PackageCheck, PenLine, RefreshCw, ShieldCheck, Signature, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUnifiedTradeWorkspace, signTradeDocument, updateQuotation } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import { getRealtimeClient } from '../realtime/socket'
import { AttachmentUploader, Money } from './TradeUI'

const agreementStatuses = new Set(['buyer_accepted', 'agreement_pending', 'agreement_signed', 'won'])
const steps = ['Quotation Accepted', 'Agreement Preparation', 'Seller Signature', 'Buyer Signature', 'Agreement Active', 'Order Enabled']
const id = value => String(value?._id || value || '')

export default function AgreementPanel({ quotationId }) {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setData(await fetchUnifiedTradeWorkspace('quotation', quotationId)); setError('') }
    catch (next) { if (!quiet) setError(next.message) }
    finally { if (!quiet) setLoading(false) }
  }, [quotationId])

  useEffect(() => { const task = Promise.resolve().then(() => load()); return () => { void task } }, [load])
  useEffect(() => { const timer = window.setInterval(() => load(true), 12000); return () => window.clearInterval(timer) }, [load])
  useEffect(() => { let socket; const onUpdate = event => { if (id(event.quotationId) === id(quotationId)) load(true) }; getRealtimeClient().then(client => { socket = client; client.on('quotation_updated', onUpdate) }).catch(() => {}); return () => socket?.off('quotation_updated', onUpdate) }, [load, quotationId])
  useEffect(() => { if (!success) return undefined; const timer = window.setTimeout(() => setSuccess(''), 6500); return () => window.clearTimeout(timer) }, [success])

  const quotation = data?.activeQuotation || {}
  const document = useMemo(() => (data?.documents || []).find(item => item.entityType === 'quotation' && id(item.entityId) === id(quotationId) && ['purchase_agreement', 'commercial_agreement'].includes(item.documentType) && item.status !== 'void'), [data?.documents, quotationId])
  if (!loading && (!quotation._id || !agreementStatuses.has(quotation.status))) return null

  async function completed(message) { setSuccess(message); await load(true) }

  return <section className="container agreement-lifecycle-section" aria-labelledby="agreement-workflow-title">
    {success && <div className="workflow-success-banner" role="status"><CheckCircle2 /><span>{success}</span><button onClick={() => setSuccess('')} aria-label="Dismiss"><X /></button></div>}
    <header><div><span className="eyebrow"><ShieldCheck /> Secure trade agreement</span><h2 id="agreement-workflow-title">Agreement signing workflow</h2><p>The accepted quotation is converted into one controlled commercial agreement before order execution.</p></div><span className={`agreement-state agreement-state--${document?.status || quotation.agreement?.status || 'preparation'}`}>{label(document?.status || quotation.agreement?.status || 'Agreement preparation')}</span></header>
    <AgreementStepper quotation={quotation} document={document} />
    {loading ? <div className="agreement-loading"><RefreshCw /> Loading agreement…</div> : error ? <div className="inline-error">{error}<button onClick={() => load()}>Retry</button></div> : quotation.status === 'buyer_accepted' && data.actorRole === 'seller' ? <AgreementPreparation quotation={quotation} document={document} onComplete={completed} setError={setError} /> : document ? <AgreementDocument data={data} quotation={quotation} document={document} user={user} onComplete={completed} setError={setError} /> : <AgreementWaiting title="Agreement document is being generated" copy="The pre-filled live Agreement will become available here automatically." />}
  </section>
}

function AgreementStepper({ quotation, document }) {
  const sellerSigned = document?.signatures?.some(item => item.signerRole === 'seller')
  const buyerSigned = document?.signatures?.some(item => item.signerRole === 'buyer')
  const active = document?.status === 'completed' || quotation.status === 'agreement_signed' || quotation.status === 'won'
  const completedCount = active ? 6 : buyerSigned ? 4 : sellerSigned ? 3 : document ? 2 : 1
  return <ol className="agreement-stepper">{steps.map((step, index) => <li className={index < completedCount ? 'done' : index === completedCount ? 'current' : ''} key={step}><i>{index < completedCount ? <Check /> : index + 1}</i><span>{step}</span></li>)}</ol>
}

function AgreementPreparation({ quotation, document, onComplete, setError }) {
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState(quotation.attachments || [])
  const [form, setForm] = useState({ suppliedQuantity: quotation.suppliedQuantity || '', minimumOrderQuantity: quotation.minimumOrderQuantity || '', unitPrice: quotation.unitPrice || '', totalPrice: quotation.totalPrice || '', taxRate: quotation.taxes?.taxRate || '', taxAmount: quotation.taxes?.amount || '', shippingCost: quotation.shippingCost || 0, packaging: typeof quotation.packaging === 'string' ? quotation.packaging : quotation.packaging?.details || '', productionTime: quotation.productionTime || '', shippingEstimate: quotation.shippingEstimate || '', shippingTerms: quotation.shippingTerms || '', leadTime: quotation.leadTime || '', incoterms: quotation.incoterms || '', paymentTerms: quotation.paymentTerms || '', warranty: quotation.warranty || '', notes: quotation.notes || quotation.sellerMessage || '', specialClauses: (quotation.specialClauses || []).join('\n') })
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const calculatedTotal = Number(form.unitPrice || 0) * Number(form.suppliedQuantity || 0) + Number(form.shippingCost || 0) + Number(form.taxAmount || 0)

  async function submit(event) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      await updateQuotation(id(quotation), { action: 'confirm', suppliedQuantity: Number(form.suppliedQuantity), minimumOrderQuantity: Number(form.minimumOrderQuantity), unitPrice: Number(form.unitPrice), totalPrice: Number(form.totalPrice || calculatedTotal), taxes: { taxRate: Number(form.taxRate || 0), amount: Number(form.taxAmount || 0) }, shippingCost: Number(form.shippingCost || 0), packaging: { details: form.packaging }, productionTime: Number(form.productionTime || 0), shippingEstimate: form.shippingEstimate, shippingTerms: form.shippingTerms, leadTime: Number(form.leadTime || 0), incoterms: form.incoterms, paymentTerms: form.paymentTerms, warranty: form.warranty, notes: form.notes, specialClauses: form.specialClauses, attachments, reason: 'Seller prepared and locked the final Agreement terms' })
      await onComplete('Agreement prepared successfully. Seller signature is now required.')
    } catch (next) { setError(next.message) }
    finally { setBusy(false) }
  }

  return <form className="agreement-preparation" onSubmit={submit}><div className="agreement-section-heading"><span><PenLine /></span><div><h3>Complete the live Agreement</h3><p>The Agreement was generated automatically from the accepted quotation. Complete only the remaining commercial fields.</p></div></div><LiveAgreementPreview quotation={quotation} document={document} form={form} calculatedTotal={calculatedTotal} /><div className="agreement-form-grid">{[['suppliedQuantity','Final quantity','number'],['minimumOrderQuantity','Final MOQ','number'],['unitPrice','Final unit price','number'],['totalPrice','Total amount','number'],['taxRate','Tax rate (%)','number'],['taxAmount','Tax amount','number'],['shippingCost','Shipping charges','number'],['packaging','Packaging details','text'],['productionTime','Production timeline (days)','number'],['shippingEstimate','Delivery timeline','text'],['shippingTerms','Shipping method / terms','text'],['incoterms','Incoterms','text'],['paymentTerms','Payment terms','text'],['warranty','Warranty','text']].map(([key, title, type]) => <label key={key}>{title}<input type={type} min={type === 'number' ? 0 : undefined} value={form[key] || ''} onChange={event => update(key, event.target.value)} required={['suppliedQuantity','minimumOrderQuantity','unitPrice','incoterms','paymentTerms'].includes(key)} /></label>)}</div><label>Commercial notes<textarea rows="3" value={form.notes} onChange={event => update('notes', event.target.value)} /></label><label>Special conditions <small>One condition per line</small><textarea rows="4" value={form.specialClauses} onChange={event => update('specialClauses', event.target.value)} /></label><AttachmentUploader folder="agreements" value={attachments} onChange={setAttachments} /><div className="agreement-total"><span>Final Agreement value</span><b><Money value={Number(form.totalPrice || calculatedTotal)} currency={quotation.currency} /></b></div><button className="button button--primary" disabled={busy}><FileSignature /> {busy ? 'Saving Agreement…' : 'Save Agreement & continue to signature'}</button></form>
}

function LiveAgreementPreview({ quotation, document, form, calculatedTotal }) {
  const content = document?.metadata?.content || {}
  return <section className="live-agreement-preview"><header><div><i>E</i><span><b>ESYGLOB ENTERPRISE TRADE</b><small>International Commercial Agreement</small></span></div><div><strong>{content.agreementNumber || quotation.agreement?.agreementNumber}</strong><small>Trade reference {content.tradeReference || quotation.quotationNumber || quotation.rfqId?.rfqNumber || id(quotation)}</small><em>Version {document?.version || 1} · Pending Seller Signature</em></div></header><h4>Purchase Agreement</h4><div className="live-party-grid"><article><small>Buyer</small><b>{content.buyer?.company || content.buyer?.name || quotation.rfqId?.buyerId?.companyName || 'Marketplace Buyer'}</b><p>{content.buyer?.name}</p></article><article><small>Seller</small><b>{content.seller?.company || content.seller?.name || quotation.sellerId?.companyName || 'Marketplace Seller'}</b><p>{content.seller?.name}</p></article></div><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody><tr><td>{quotation.productId?.name || content.products?.[0]?.name || quotation.rfqId?.title || 'Quoted product'}</td><td>{form.suppliedQuantity || '—'}</td><td><Money value={Number(form.unitPrice || 0)} currency={quotation.currency} /></td><td><Money value={Number(form.totalPrice || calculatedTotal)} currency={quotation.currency} /></td></tr></tbody></table><div className="live-terms-grid">{[['MOQ',form.minimumOrderQuantity],['Production',form.productionTime],['Delivery',form.shippingEstimate],['Shipping',form.shippingTerms],['Payment',form.paymentTerms],['Incoterms',form.incoterms],['Packaging',form.packaging],['Warranty',form.warranty]].map(([title,value]) => <span key={title}><small>{title}</small><b>{value || 'To be completed'}</b></span>)}</div>{form.notes && <p className="live-contract-notes"><b>Commercial Notes</b>{form.notes}</p>}<footer><span>Seller signature pending</span><span>Buyer signature follows Seller signature</span></footer>{document?.previewUrl && <div className="live-preview-actions"><a href={document.previewUrl} target="_blank" rel="noreferrer"><FileText /> Expand document</a><a href={`${document.previewUrl}?format=pdf`} target="_blank" rel="noreferrer"><Download /> Download draft PDF</a></div>}</section>
}

function AgreementDocument({ data, quotation, document, user, onComplete, setError }) {
  const actorRole = data.actorRole
  const signed = document.signatures?.some(item => item.signerRole === actorRole)
  const canSign = !signed && ((actorRole === 'seller' && document.status === 'awaiting_seller_signature') || (actorRole === 'buyer' && document.status === 'awaiting_buyer_signature'))
  const [busy, setBusy] = useState(false)
  const [signOpen, setSignOpen] = useState(false)
  const [signatureType, setSignatureType] = useState('typed')
  const [signerName, setSignerName] = useState(user?.fullName || user?.name || '')
  const [signatureValue, setSignatureValue] = useState('')
  const previewUrl = document.previewUrl

  async function sign() {
    if (!canSign || busy || !signerName.trim() || !signatureValue) return
    setBusy(true); setError('')
    try { await signTradeDocument('quotation', id(quotation), document._id, { signerName: signerName.trim(), signatureValue, signatureType }); setSignOpen(false); await onComplete(actorRole === 'seller' ? 'Seller has signed the Agreement. Buyer signature is now required.' : 'Agreement is fully signed and active. Order is ready to begin.') }
    catch (next) { setError(next.message) }
    finally { setBusy(false) }
  }

  return <div className="agreement-document"><div className="agreement-document-toolbar"><div><FileSignature /><span><small>{document.metadata?.content?.agreementNumber || quotation.agreement?.agreementNumber}</small><b>{document.title}</b><em>Version {document.version || 1} · {label(document.status)}</em></span></div><div><a className="button button--secondary" href={previewUrl} target="_blank" rel="noreferrer"><FileText /> Preview</a><a className="button button--secondary" href={`${previewUrl}?format=pdf`} target="_blank" rel="noreferrer"><Download /> Download PDF</a></div></div><div className="agreement-preview"><iframe title="Agreement preview" src={previewUrl} /></div><div className="agreement-signatures"><h3>Electronic signatures</h3>{['seller','buyer'].map(role => { const value = document.signatures?.find(item => item.signerRole === role); return <article className={value ? 'signed' : ''} key={role}><Signature /><div><b>{label(role)} signature</b>{value ? <><strong>{value.signerName}</strong><small>Signed {new Date(value.signedAt).toLocaleString()} · v{document.version || 1}</small></> : <small>{role === 'seller' ? 'Seller signs first' : 'Available after Seller signature'}</small>}</div>{value && <CheckCircle2 />}</article> })}</div>{canSign && <><button type="button" className="button button--primary agreement-sign-trigger" onClick={() => setSignOpen(true)}><Signature /> Sign Agreement</button>{signOpen && <div className="modal-backdrop agreement-sign-modal" onMouseDown={() => !busy && setSignOpen(false)}><section className="agreement-sign-box" onMouseDown={event => event.stopPropagation()}><header><div><span className="eyebrow">Secure e-signature</span><h3>{actorRole === 'seller' ? 'Sign and issue to Buyer' : 'Review and countersign Agreement'}</h3></div><button type="button" onClick={() => setSignOpen(false)} disabled={busy} aria-label="Close signature"><X /></button></header><label>Legal signer name<input value={signerName} onChange={event => setSignerName(event.target.value)} /></label><div className="signature-type-tabs"><button type="button" className={signatureType === 'typed' ? 'active' : ''} onClick={() => { setSignatureType('typed'); setSignatureValue('') }}>Typed signature</button><button type="button" className={signatureType === 'drawn' ? 'active' : ''} onClick={() => { setSignatureType('drawn'); setSignatureValue('') }}>Draw signature</button></div>{signatureType === 'typed' ? <label>Type your signature<input className="typed-signature" value={signatureValue} onChange={event => setSignatureValue(event.target.value)} placeholder="Type full legal signature" /></label> : <SignatureCanvas onChange={setSignatureValue} />}<p><ShieldCheck /> By signing, you confirm this Agreement version and its commercial terms.</p><button className="button button--primary" disabled={busy || !signerName.trim() || !signatureValue} onClick={sign}><Signature /> {busy ? 'Recording signature…' : `${actorRole === 'seller' ? 'Seller' : 'Buyer'} sign Agreement`}</button></section></div>}</>}{document.status === 'awaiting_buyer_signature' && actorRole === 'seller' && <AgreementWaiting title="Buyer signature requested" copy="The Buyer was notified in the notification center and trade chat. This page updates automatically." />}{document.status === 'completed' && <div className="agreement-active-banner"><CheckCircle2 /><div><b>Agreement fully signed and active</b><p>The signed PDF is available to both parties and order execution is unlocked.</p></div><Link className="button button--primary" to={`/trade-workspace/quotation/${id(quotation)}`}><PackageCheck /> Open Order Workspace</Link></div>}</div>
}

function SignatureCanvas({ onChange }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  function point(event) { const canvas = canvasRef.current; const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height } }
  function start(event) { const canvas = canvasRef.current; drawingRef.current = true; canvas.setPointerCapture(event.pointerId); const next = point(event); const context = canvas.getContext('2d'); context.beginPath(); context.moveTo(next.x, next.y) }
  function move(event) { if (!drawingRef.current) return; const next = point(event); const context = canvasRef.current.getContext('2d'); context.lineWidth = 2.2; context.lineCap = 'round'; context.strokeStyle = '#0f172a'; context.lineTo(next.x, next.y); context.stroke() }
  function stop() { if (!drawingRef.current) return; drawingRef.current = false; onChange(canvasRef.current.toDataURL('image/png')) }
  function clear() { const canvas = canvasRef.current; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); onChange('') }
  return <div className="signature-canvas"><canvas ref={canvasRef} width="700" height="180" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><button type="button" onClick={clear}>Clear signature</button></div>
}

function AgreementWaiting({ title, copy }) { return <div className="agreement-waiting"><RefreshCw /><div><b>{title}</b><p>{copy}</p></div></div> }
function label(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
