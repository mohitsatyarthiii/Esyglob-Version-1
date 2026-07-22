import { ArrowLeft, CheckCircle, Download, Edit3, FileText, MessageSquare, PackageCheck, RefreshCw, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createChat, fetchQuotation, respondToQuotation, updateQuotation } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { AttachmentUploader, DetailItem, Money, StatusBadge } from '../components/TradeUI'
import { displayName, resolveId } from '../utils/trade'
import useAsyncData from '../hooks/useAsyncData'
import { Field } from './RfqCreatePage'
import { TradeSkeleton } from './RfqsPage'

export default function QuotationDetailsPage() {
  const { quotationId } = useParams()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const roles = user?.roles || ['buyer']
  const requestedRole = params.get('role')
  const sellerView = roles.includes('seller') && (requestedRole === 'seller' || (requestedRole !== 'buyer' && (user?.primaryRole === 'seller' || !roles.includes('buyer'))))
  const openStatuses = sellerView
    ? ['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised']
    : ['pending', 'submitted', 'negotiating', 'revised']
  const query = useAsyncData(useCallback(() => fetchQuotation(quotationId), [quotationId]))
  const [dialog, setDialog] = useState('')
  const [actionText, setActionText] = useState('')
  const [counterPrice, setCounterPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const item = query.data || {}
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}
  const seller = typeof item.sellerId === 'object' ? item.sellerId : {}
  const product = typeof item.productId === 'object' ? item.productId : {}

  async function buyerAction(action) {
    setBusy(true); setError('')
    try {
      let result
      if (action === 'accept' || action === 'reject' || action === 'start_order') result = await respondToQuotation(quotationId, action, action === 'reject' ? { reason: actionText || 'Buyer rejected this quotation.' } : {})
      else result = await updateQuotation(quotationId, { action, reason: actionText || (action === 'counter_offer' ? 'Buyer sent a counter offer.' : 'Buyer requested a revision.'), ...(action === 'counter_offer' && counterPrice ? { unitPrice: Number(counterPrice) } : {}) })
      setDialog(''); setActionText(''); setCounterPrice(''); setMessage(action === 'accept' ? 'Quotation accepted. Waiting for seller confirmation and signatures.' : action === 'start_order' ? 'Order started successfully.' : 'Your response was sent to the supplier.'); await query.reload()
      const orderId = resolveId(result?.tradeOrder || result?.order || result?.orderId)
      if (action === 'start_order' && orderId) navigate(`/orders/${orderId}`)
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }
  async function sellerAction(action) {
    setBusy(true); setError('')
    try { await updateQuotation(quotationId, { action, reason: actionText || undefined }); setMessage(action === 'withdraw' ? 'Quotation withdrawn.' : action === 'confirm' ? 'Final terms confirmed. Sign the generated agreement next.' : 'Quotation sent to buyer.'); await query.reload() }
    catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }
  async function openChat() {
    setError('')
    try {
      const existing = resolveId(item.chatId)
      if (existing) return navigate(`/messages/${existing}`)
      const otherUserId = sellerView ? resolveId(rfq.buyerId || rfq.userId) : resolveId(item.userId || seller.userId)
      const result = await createChat({ otherUserId, productId: resolveId(item.productId) || undefined, rfqId: resolveId(item.rfqId), quotationId, role: sellerView ? 'seller' : 'buyer', chatType: 'rfq_negotiation' })
      navigate(`/messages/${resolveId(result.chat)}`)
    } catch (nextError) { setError(nextError.message) }
  }
  if (query.loading) return <AppShell><div className="listing-page container"><TradeSkeleton /></div></AppShell>
  if (query.error) return <AppShell><div className="listing-page container"><div className="inline-error">{query.error.message}</div></div></AppShell>
  const canAccept = openStatuses.includes(item.status)
  return <AppShell><div className="detail-page container trade-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back to quotations</button><section className="quotation-hero"><div><div className="trade-heading-line"><span className="eyebrow">{item.quotationNumber || 'Supplier quotation'}</span><StatusBadge status={item.status || 'pending'} /></div><h1>{item.title || product.name || rfq.title || 'Quotation'}</h1><p>{sellerView ? `Prepared for ${displayName(rfq.buyerId, 'Buyer')}` : `From ${displayName(seller, 'Supplier')}`}</p></div><div className="quotation-hero__price"><small>Total value</small><b><Money value={item.totalPrice || item.unitPrice} currency={item.currency} /></b><span><Money value={item.unitPrice} currency={item.currency} /> / unit</span></div></section>{error && <p className="action-error">{error}</p>}{message && <p className="action-success">{message}</p>}<div className="quotation-actionbar"><button className="button button--secondary" onClick={openChat}><MessageSquare /> Continue chat</button>{sellerView ? <>{openStatuses.includes(item.status) && <button className="button button--primary" onClick={() => setDialog('edit')}><Edit3 /> Revise quotation</button>}{item.status === 'buyer_accepted' && <button className="button button--primary success-button" disabled={busy} onClick={() => sellerAction('confirm')}><CheckCircle /> Confirm final terms</button>}{item.status === 'agreement_signed' && <Link className="button button--primary success-button" to={`/trade-workspace/quotation/${quotationId}`}><PackageCheck /> Configure & Start Order</Link>}{['draft','pending','submitted','negotiating','countered','revision_requested','revised'].includes(item.status) && <button className="danger-text" disabled={busy} onClick={() => sellerAction('withdraw')}><XCircle /> Withdraw</button>}</> : <>{canAccept && <button className="button button--primary success-button" onClick={() => buyerAction('accept')} disabled={busy}><CheckCircle /> Accept quotation</button>}{openStatuses.includes(item.status) && <><button onClick={() => setDialog('request_revision')}><RefreshCw /> Request revision</button><button onClick={() => setDialog('counter_offer')}>Counter offer</button><button className="danger-text" onClick={() => setDialog('reject')}><XCircle /> Reject</button></>}{item.status === 'rejected' && <button onClick={() => updateQuotation(quotationId, { action: 'reopen', reason: 'Buyer reopened quotation' }).then(() => query.reload())}><RefreshCw /> Reopen</button>}</>}</div>{!canAccept && !sellerView && openStatuses.includes(item.status) && <p className="warning-note">A linked product is required before this quotation can create an order.</p>}<div className="detail-columns"><div><section className="detail-card"><h2>Commercial details</h2><dl className="trade-detail-grid"><DetailItem label="Unit price"><Money value={item.unitPrice} currency={item.currency} /></DetailItem><DetailItem label="Supplied quantity">{item.suppliedQuantity || item.quantity} {item.unit || rfq.unit}</DetailItem><DetailItem label="Minimum order">{item.minimumOrderQuantity || '—'} {item.unit || rfq.unit}</DetailItem><DetailItem label="Lead time">{item.leadTime} {item.leadTimeUnit}</DetailItem><DetailItem label="Payment terms">{item.paymentTerms}</DetailItem><DetailItem label="Advance required">{item.advanceRequired !== undefined ? `${item.advanceRequired}%` : undefined}</DetailItem><DetailItem label="Incoterms">{item.incoterms}</DetailItem><DetailItem label="Shipping cost"><Money value={item.shippingCost} currency={item.currency} /></DetailItem><DetailItem label="Shipping estimate">{item.shippingEstimate}</DetailItem><DetailItem label="Valid until">{item.expiryDate || item.validUntil ? new Date(item.expiryDate || item.validUntil).toLocaleDateString() : item.validity}</DetailItem></dl>{item.sellerMessage && <div className="requirement-copy"><h3>Supplier note</h3><p>{item.sellerMessage}</p></div>}{item.buyerMessage && <div className="requirement-copy"><h3>Buyer response</h3><p>{item.buyerMessage}</p></div>}</section>{(item.specifications || item.description || item.notes) && <section className="detail-card"><h2>Offer notes</h2>{item.description && <p>{item.description}</p>}{item.specifications && <p>{item.specifications}</p>}{item.notes && <p>{item.notes}</p>}</section>}{item.attachments?.length > 0 && <section className="detail-card"><h2>Attachments</h2><div className="attachment-list">{item.attachments.map((file, index) => <a href={file.url || file} target="_blank" rel="noreferrer" key={index}><FileText /> {file.filename || file.name || `Document ${index + 1}`} <Download /></a>)}</div></section>}</div><aside><section className="detail-card"><h2><ShieldCheck /> Supplier</h2><h3>{displayName(seller, 'Supplier')}</h3><p>{seller.companyDescription || 'Verified marketplace supplier information is linked to this offer.'}</p>{resolveId(seller) && <Link to={`/sellers/${resolveId(seller)}`}>View supplier profile</Link>}</section><section className="detail-card"><h2><PackageCheck /> Linked RFQ</h2><h3>{rfq.title || 'Request for quotation'}</h3><p>{rfq.quantity} {rfq.unit} · {rfq.deliveryCountry || rfq.destinationCountry}</p>{resolveId(item.rfqId) && <Link to={`/rfqs/${resolveId(item.rfqId)}`}>View RFQ details</Link>}</section><section className="detail-card"><h2><Truck /> Negotiation history</h2><div className="mini-timeline">{(item.negotiationHistory || []).map((entry, index) => <span key={index}><i /><div><b>{String(entry.action || 'Update').replaceAll('_', ' ')}</b><p>{entry.message}</p><small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</small></div></span>)}</div></section>{item.revisionHistory?.length > 0 && <section className="detail-card"><h2>Revision history</h2><div className="mini-timeline">{[...item.revisionHistory].reverse().map((revision,index)=><span key={revision._id||index}><i/><div><b>Version {revision.version||index+1}</b><p>{revision.reason||revision.notes||'Commercial terms updated'}</p><small>{revision.revisedAt?new Date(revision.revisedAt).toLocaleString():''}</small></div></span>)}</div></section>}<section className="detail-card"><h2>Workflow</h2><p>Current: <b>{String(item.status||'').replaceAll('_',' ')}</b></p><p>Previous: {String(item.previousStatus||'—').replaceAll('_',' ')}</p>{item.lifecycle?.allowedActions?.length>0&&<p>Next: {item.lifecycle.allowedActions.map(entry=>String(entry.action).replaceAll('_',' ')).join(', ')}</p>}</section></aside></div></div>{dialog && dialog !== 'edit' && <ActionDialog type={dialog} text={actionText} setText={setActionText} counterPrice={counterPrice} setCounterPrice={setCounterPrice} busy={busy} onClose={() => setDialog('')} onSubmit={() => buyerAction(dialog)} />}{dialog === 'edit' && <QuotationEditDialog item={item} onClose={() => setDialog('')} onSuccess={() => { setDialog(''); setMessage('Quotation revised successfully.'); query.reload() }} />}</AppShell>
}

function ActionDialog({ type, text, setText, counterPrice, setCounterPrice, busy, onClose, onSubmit }) {
  const title = type === 'reject' ? 'Reject quotation' : type === 'counter_offer' ? 'Send counter offer' : 'Request revision'
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="action-dialog" onMouseDown={(e) => e.stopPropagation()}><div className="compact-heading"><h2>{title}</h2><button onClick={onClose}>×</button></div>{type === 'counter_offer' && <Field label="Proposed unit price"><input type="number" min="0" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} /></Field>}<Field label="Message"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Explain your response to the supplier" /></Field><button className={`button button--full ${type === 'reject' ? 'button--danger' : 'button--primary'}`} disabled={busy} onClick={onSubmit}>{busy ? 'Sending…' : 'Send response'}</button></div></div>
}

function QuotationEditDialog({ item, onClose, onSuccess }) {
  const [attachments, setAttachments] = useState(item.attachments || [])
  const [form, setForm] = useState({ unitPrice: item.unitPrice || '', suppliedQuantity: item.suppliedQuantity || item.quantity || '', minimumOrderQuantity: item.minimumOrderQuantity || '', leadTime: item.leadTime || '', leadTimeUnit: item.leadTimeUnit || 'days', productionTime: item.productionTime || '', productionTimeUnit: item.productionTimeUnit || 'days', packaging: typeof item.packaging === 'string' ? item.packaging : item.packaging?.description || '', samplePrice: item.samplePrice || '', taxRate: item.taxes?.taxRate || '', shippingTerms: item.shippingTerms || '', paymentTerms: item.paymentTerms || '', incoterms: item.incoterms || 'FOB', shippingCost: item.shippingCost || 0, shippingEstimate: item.shippingEstimate || '', sellerMessage: item.sellerMessage || '', specifications: item.specifications || '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const total = useMemo(() => Number(form.unitPrice || 0) * Number(form.suppliedQuantity || 0) + Number(form.shippingCost || 0), [form.shippingCost, form.suppliedQuantity, form.unitPrice])
  async function submit(e) { e.preventDefault(); setBusy(true); try { await updateQuotation(resolveId(item), { ...form, unitPrice: Number(form.unitPrice), suppliedQuantity: Number(form.suppliedQuantity), minimumOrderQuantity: Number(form.minimumOrderQuantity), shippingCost: Number(form.shippingCost), productionTime: Number(form.productionTime)||undefined, samplePrice: Number(form.samplePrice)||undefined, taxes: form.taxRate ? { taxRate: Number(form.taxRate) } : undefined, packaging: form.packaging||undefined, shippingTerms: form.shippingTerms||undefined, totalPrice: total, attachments }); onSuccess() } catch (nextError) { setError(nextError.message); setBusy(false) } }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="quotation-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}><div className="compact-heading"><h2>Revise quotation</h2><button type="button" onClick={onClose}>×</button></div><div className="form-grid form-grid--3">{[['unitPrice','Unit price'],['suppliedQuantity','Quantity'],['minimumOrderQuantity','MOQ']].map(([key,label]) => <Field key={key} label={label}><input type="number" min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required /></Field>)}</div><div className="form-grid"><Field label="Lead time"><input value={form.leadTime} onChange={(e) => setForm({ ...form, leadTime: e.target.value })} required /></Field><Field label="Incoterms"><input value={form.incoterms} onChange={(e) => setForm({ ...form, incoterms: e.target.value })} /></Field><Field label="Shipping cost"><input type="number" min="0" value={form.shippingCost} onChange={(e) => setForm({ ...form, shippingCost: e.target.value })} /></Field><Field label="Shipping estimate"><input value={form.shippingEstimate} onChange={(e) => setForm({ ...form, shippingEstimate: e.target.value })} /></Field></div><Field label="Payment terms"><input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} /></Field><Field label="Message"><textarea value={form.sellerMessage} onChange={(e) => setForm({ ...form, sellerMessage: e.target.value })} /></Field><AttachmentUploader folder="quotations" value={attachments} onChange={setAttachments} />{error && <p className="action-error">{error}</p>}<button className="button button--primary button--full" disabled={busy}>{busy ? 'Saving…' : 'Submit revision'}</button></form></div>
}
