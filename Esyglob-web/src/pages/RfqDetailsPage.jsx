import { Archive, ArrowLeft, Calendar, FileText, MapPin, MessageSquare, PackageCheck, Save, Send, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { archiveRfq, createChat, createQuotation, fetchRfq, updateRfq } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { AttachmentUploader, DetailItem, Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { displayName, resolveId } from '../utils/trade'
import { Field } from './RfqCreatePage'
import { TradeSkeleton } from './RfqsPage'

export default function RfqDetailsPage() {
  const { rfqId } = useParams()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const roles = user?.roles || ['buyer']
  const sellerView = roles.includes('seller') && (params.get('role') === 'seller' || (!roles.includes('buyer') && roles.includes('seller')))
  const query = useAsyncData(useCallback(() => fetchRfq(rfqId), [rfqId]))
  const [quoteOpen, setQuoteOpen] = useState(() => sellerView && params.get('action') === 'quote')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const data = query.data || {}
  const rfq = data.rfq || {}

  useEffect(() => {
    if (sellerView && rfqId && query.data?.rfq) updateRfq(rfqId, { action: 'mark_viewed' }).catch(() => {})
  }, [query.data?.rfq, rfqId, sellerView])

  const buyerId = resolveId(rfq.buyerId || rfq.userId)
  const productId = resolveId(rfq.productId)
  const rfqSellerUserId = resolveId(rfq.sellerUserId || rfq.sellerId?.userId)
  const openChat = useCallback(async (quotation) => {
    setError('')
    try {
      const existing = quotation?.chatId || data.chats?.find((chat) => !quotation || resolveId(chat.quotationId) === resolveId(quotation))
      if (existing) return navigate(`/messages/${resolveId(existing.chatId || existing)}`)
      const otherUserId = sellerView ? buyerId : resolveId(quotation?.userId || quotation?.sellerId?.userId || rfqSellerUserId)
      if (!otherUserId) throw new Error('The other participant is not available for this conversation.')
      const result = await createChat({ otherUserId, productId: productId || undefined, rfqId, quotationId: resolveId(quotation) || undefined, role: sellerView ? 'seller' : 'buyer', chatType: 'rfq_negotiation' })
      navigate(`/messages/${resolveId(result.chat)}`)
    } catch (nextError) { setError(nextError.message) }
  }, [buyerId, data.chats, navigate, productId, rfqId, rfqSellerUserId, sellerView])

  useEffect(() => {
    if (!sellerView || !query.data?.rfq) return
    if (params.get('action') === 'chat') {
      const timer = window.setTimeout(() => openChat(), 0)
      return () => window.clearTimeout(timer)
    }
  }, [openChat, params, query.data?.rfq, sellerView])
  async function action(type) {
    setError('')
    try { if (type === 'archive') await archiveRfq(rfqId); else await updateRfq(rfqId, { action: type }); setMessage(`RFQ ${type === 'archive' ? 'archived' : `${type}d`}.`); query.reload() }
    catch (nextError) { setError(nextError.message) }
  }

  if (query.loading) return <AppShell><div className="listing-page container"><TradeSkeleton /></div></AppShell>
  if (query.error || !data.rfq) return <AppShell><div className="listing-page container"><div className="inline-error">{query.error?.message || 'RFQ not found.'}</div></div></AppShell>
  const attachments = [...(rfq.attachments || []), ...(rfq.images || []), ...(rfq.documents || [])]
  return <AppShell><div className="detail-page container trade-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back to RFQs</button><section className="rfq-detail-hero"><div><div className="trade-heading-line"><span className="eyebrow">{rfq.rfqNumber || 'Request for quotation'}</span><StatusBadge status={rfq.status || 'active'} /></div><h1>{rfq.title || rfq.productName}</h1><p>{rfq.description}</p><div className="rfq-meta"><span><Calendar /> Submitted {new Date(rfq.createdAt).toLocaleDateString()}</span><span><MapPin /> {rfq.deliveryCountry || rfq.destinationCountry}</span><span><ShieldCheck /> {rfq.isVerifiedSuppliersOnly ? 'Verified suppliers only' : 'Public marketplace'}</span></div></div><div className="rfq-detail-actions">{sellerView ? <><button className="button button--secondary" onClick={() => openChat()}><MessageSquare /> Chat with buyer</button><button className="button button--primary" onClick={() => action('accept')}><ShieldCheck /> Accept RFQ</button><button className="button button--secondary" onClick={() => action('request_information')}><MessageSquare /> Request information</button><button className="button button--primary" onClick={() => setQuoteOpen(true)}><Send /> Send quotation</button><button className="danger-text" onClick={() => action('decline')}>Decline RFQ</button></> : <><button className="button button--secondary" onClick={() => openChat(data.quotations?.[0])} disabled={!data.quotations?.length}><MessageSquare /> Continue chat</button>{['active','draft','closed'].includes(rfq.status) && <button className="button button--secondary" onClick={() => action(rfq.status === 'closed' ? 'reopen' : 'close')}>{rfq.status === 'closed' ? 'Reopen' : 'Close'}</button>}{['information_requested','rejected'].includes(rfq.status) && <button className="button button--primary" onClick={() => action('resubmit')}><Send /> Revise and resubmit</button>}<button className="danger-text" onClick={() => action('cancel')}>Cancel RFQ</button><button className="icon-danger" onClick={() => action('archive')}><Archive /></button></>}</div></section>{error && <p className="action-error">{error}</p>}{message && <p className="action-success">{message}</p>}<div className="detail-columns"><div><section className="detail-card"><h2>Requirements</h2><dl className="trade-detail-grid"><DetailItem label="Category">{rfq.category}{rfq.subcategory ? ` / ${rfq.subcategory}` : ''}</DetailItem><DetailItem label="Quantity">{rfq.quantity} {rfq.unit}</DetailItem><DetailItem label="Target price"><Money value={rfq.targetPrice} currency={rfq.currency} /></DetailItem><DetailItem label="Minimum order">{rfq.minimumOrderQuantity ? `${rfq.minimumOrderQuantity} ${rfq.unit}` : 'Flexible'}</DetailItem><DetailItem label="Delivery timeline">{rfq.deliveryTimeline}</DetailItem><DetailItem label="Incoterms">{rfq.incoterms}</DetailItem><DetailItem label="Delivery port">{rfq.deliveryPort}</DetailItem><DetailItem label="Deadline">{rfq.deadline || rfq.expiresAt ? new Date(rfq.deadline || rfq.expiresAt).toLocaleDateString() : undefined}</DetailItem></dl>{rfq.specifications && <div className="requirement-copy"><h3>Specifications</h3><p>{rfq.specifications}</p></div>}</section>{rfq.items?.length > 0 && <section className="detail-card"><h2>Line items</h2><div className="line-item-list">{rfq.items.map((item, index) => <article key={index}><PackageCheck /><div><b>{item.name || `Item ${index + 1}`}</b><p>{item.specifications}</p></div><span>{item.quantity} {item.unit}</span></article>)}</div></section>}{attachments.length > 0 && <section className="detail-card"><h2>Attachments</h2><div className="attachment-list">{attachments.map((file, index) => <a href={file.url || file} target="_blank" rel="noreferrer" key={index}><FileText /> {file.filename || file.name || `Attachment ${index + 1}`}</a>)}</div></section>}</div><aside className="detail-card"><h2>{sellerView ? 'Buyer summary' : 'RFQ progress'}</h2>{sellerView ? <><p>{displayName(rfq.buyerId, 'Marketplace buyer')}</p><p>Review all requirements before submitting a commercial offer. Your quotation will automatically create or update the RFQ negotiation conversation.</p></> : <div className="rfq-timeline">{['RFQ submitted', 'Relevant sellers notified', data.quotations?.length ? `${data.quotations.length} quotation(s) received` : 'Awaiting quotations', rfq.status === 'converted' ? 'Converted to order' : 'Negotiation / selection'].map((item, index) => <span className={index < 2 || (index === 2 && data.quotations?.length) ? 'done' : ''} key={item}><i />{item}</span>)}</div>}</aside></div>{!sellerView && <section className="trade-section"><div className="compact-heading"><h2>Supplier quotations</h2>{data.quotations?.length > 1 && <Link to={`/quotations/compare?ids=${data.quotations.map(resolveId).join(',')}`}>Compare offers</Link>}</div>{data.quotations?.length ? <div className="quotation-grid">{data.quotations.map((quote) => <QuotationPreview key={resolveId(quote)} quote={quote} onChat={() => openChat(quote)} />)}</div> : <div className="empty-panel"><Send /><h3>No quotations received yet</h3><p>Matching sellers can review and respond while this RFQ is active.</p></div>}</section>}</div>{quoteOpen && <QuotationForm rfq={rfq} onClose={() => setQuoteOpen(false)} onSuccess={(quotation) => navigate(`/quotations/${resolveId(quotation)}?role=seller`)} />}</AppShell>
}

function QuotationPreview({ quote, onChat }) {
  const id = resolveId(quote)
  return <article className="quotation-card"><div className="trade-heading-line"><span className="eyebrow">{displayName(quote.sellerId, 'Supplier')}</span><StatusBadge status={quote.status || 'pending'} /></div><strong><Money value={quote.totalPrice || quote.unitPrice} currency={quote.currency} /></strong><p><Money value={quote.unitPrice} currency={quote.currency} /> / unit · MOQ {quote.minimumOrderQuantity || quote.suppliedQuantity || '—'}</p><dl><DetailItem label="Lead time">{quote.leadTime} {quote.leadTimeUnit}</DetailItem><DetailItem label="Incoterms">{quote.incoterms}</DetailItem></dl><div><button onClick={onChat}><MessageSquare /> Chat</button><Link to={`/quotations/${id}`}>Review quotation</Link></div></article>
}

function QuotationForm({ rfq, onClose, onSuccess }) {
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ suppliedQuantity: rfq.quantity || 1, minimumOrderQuantity: rfq.minimumOrderQuantity || 1, unitPrice: '', currency: rfq.currency || 'INR', leadTime: '15', leadTimeUnit: 'days', paymentTerms: '30% advance, balance before dispatch', advanceRequired: 30, incoterms: rfq.incoterms || 'FOB', shippingCost: 0, shippingEstimate: '', expiryDate: '', specifications: '', sellerMessage: '' })
  const total = useMemo(() => Number(form.unitPrice || 0) * Number(form.suppliedQuantity || 0) + Number(form.shippingCost || 0), [form.shippingCost, form.suppliedQuantity, form.unitPrice])
  const update = (key, value) => setForm({ ...form, [key]: value })
  async function submit(event, status = 'submitted') { event.preventDefault(); setBusy(true); setError(''); try { const quote = await createQuotation({ rfqId: resolveId(rfq), status, ...form, unitPrice: Number(form.unitPrice), totalPrice: total, suppliedQuantity: Number(form.suppliedQuantity), minimumOrderQuantity: Number(form.minimumOrderQuantity), advanceRequired: Number(form.advanceRequired), shippingCost: Number(form.shippingCost), expiryDate: form.expiryDate || undefined, attachments }); onSuccess(quote) } catch (nextError) { setError(nextError.message); setBusy(false) } }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="quotation-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}><div className="compact-heading"><div><span className="eyebrow">Commercial response</span><h2>Prepare quotation</h2></div><button type="button" onClick={onClose}>×</button></div><div className="form-grid form-grid--3"><Field label="Unit price" required><input type="number" min="0.01" step="0.01" value={form.unitPrice} onChange={(e) => update('unitPrice', e.target.value)} required /></Field><Field label="Quantity" required><input type="number" min="1" value={form.suppliedQuantity} onChange={(e) => update('suppliedQuantity', e.target.value)} required /></Field><Field label="MOQ" required><input type="number" min="0" value={form.minimumOrderQuantity} onChange={(e) => update('minimumOrderQuantity', e.target.value)} required /></Field></div><div className="form-grid"><Field label="Lead time" required><div className="compound-input"><input type="number" min="1" value={form.leadTime} onChange={(e) => update('leadTime', e.target.value)} required /><select value={form.leadTimeUnit} onChange={(e) => update('leadTimeUnit', e.target.value)}><option>days</option><option>weeks</option></select></div></Field><Field label="Incoterms"><select value={form.incoterms} onChange={(e) => update('incoterms', e.target.value)}>{['FOB','CIF','EXW','CFR','DDP','DAP'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Shipping cost"><input type="number" min="0" value={form.shippingCost} onChange={(e) => update('shippingCost', e.target.value)} /></Field><Field label="Valid until"><input type="date" value={form.expiryDate} onChange={(e) => update('expiryDate', e.target.value)} /></Field></div><Field label="Payment terms"><input value={form.paymentTerms} onChange={(e) => update('paymentTerms', e.target.value)} /></Field><Field label="Shipping estimate"><input value={form.shippingEstimate} onChange={(e) => update('shippingEstimate', e.target.value)} /></Field><Field label="Specifications"><textarea value={form.specifications} onChange={(e) => update('specifications', e.target.value)} /></Field><Field label="Message to buyer"><textarea value={form.sellerMessage} onChange={(e) => update('sellerMessage', e.target.value)} /></Field><AttachmentUploader folder="quotations" value={attachments} onChange={setAttachments} /><div className="quote-total"><span>Total quotation</span><b><Money value={total} currency={form.currency} /></b></div>{error && <p className="action-error">{error}</p>}<div className="quotation-submit-actions"><button type="button" className="button button--ghost" disabled={busy} onClick={(event) => submit(event, 'draft')}><Save /> Save draft</button><button className="button button--primary" disabled={busy}><Send /> {busy ? 'Submitting…' : 'Send quotation'}</button></div></form></div>
}
