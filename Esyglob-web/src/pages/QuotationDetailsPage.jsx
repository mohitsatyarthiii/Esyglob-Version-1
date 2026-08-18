import { ArrowLeft, CheckCircle, Download, Edit3, FileText, MessageSquare, PackageCheck, RefreshCw, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createChat, fetchQuotation, respondToQuotation, updateQuotation } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import FinalQuotationPanel from '../components/AgreementPanel'
import { AttachmentUploader, DetailItem, Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { getRealtimeClient } from '../realtime/socket'
import { displayName, resolveId } from '../utils/trade'
import { Field } from './RfqCreatePage'
import { TradeSkeleton } from './RfqsPage'

const SELLER_OPEN = ['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised']
const BUYER_OPEN = ['pending', 'submitted', 'negotiating', 'revised']
const actionToken = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`

function resolveCurrentOffer(item) {
  return item.currentOffer || [...(item.negotiationHistory || [])].reverse().find((entry) => Number(entry.unitPrice) > 0) || {
    action: 'submitted', actorRole: 'seller', unitPrice: item.unitPrice, totalPrice: item.totalPrice,
    suppliedQuantity: item.suppliedQuantity, minimumOrderQuantity: item.minimumOrderQuantity,
    leadTime: item.leadTime, leadTimeUnit: item.leadTimeUnit, notes: item.sellerMessage || item.notes,
    createdAt: item.createdAt,
  }
}

export default function QuotationDetailsPage() {
  const { quotationId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const sellerView = user?.primaryRole === 'seller'
  const query = useAsyncData(useCallback(() => fetchQuotation(quotationId), [quotationId]))
  const reloadQuotation = query.reload
  useEffect(() => {
    let socket
    const refresh = (event) => { if (!event?.quotationId || resolveId(event.quotationId) === quotationId) reloadQuotation() }
    getRealtimeClient().then((client) => { socket = client; client.on('quotation_updated', refresh) }).catch(() => {})
    return () => socket?.off('quotation_updated', refresh)
  }, [reloadQuotation, quotationId])

  const [dialog, setDialog] = useState('')
  const [actionText, setActionText] = useState('')
  const [counterPrice, setCounterPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const rawItem = query.data || {}
  const item = rawItem
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}
  const seller = typeof item.sellerId === 'object' ? item.sellerId : {}
  const product = typeof item.productId === 'object' ? item.productId : {}
  const dealProduct = item.productConfiguration || {}
  const currentOffer = resolveCurrentOffer(item)
  const concurrency = () => ({ expectedNegotiationVersion: Number(item.negotiationVersion || 0), idempotencyKey: actionToken() })
  const workflowMessage = sellerView
    ? item.status === 'countered'
      ? 'The buyer has sent a counter offer. Review the revised terms, update your commercial response, and decide whether to accept, reject, or revise.'
      : item.status === 'buyer_accepted'
        ? 'The buyer accepted this quotation. Prepare the Final Quotation to lock the deal-specific product configuration and commercial terms.'
        : item.status === 'final_quotation_pending'
          ? 'The final quotation is ready for review and signature. Confirm the locked product configuration before moving to the next step.'
          : 'This quotation is active. Keep the commercial terms aligned with the exact deal configuration and keep the buyer informed.'
    : item.status === 'countered'
      ? 'The supplier has revised the offer. Compare the revised price, quantity, and configuration before accepting, rejecting, or countering.'
      : item.status === 'revised'
        ? 'The revised quotation is waiting for your review. Check the updated product configuration and commercial terms before deciding.'
        : 'Review the supplier offer, negotiate the commercial terms, and accept only when the final deal configuration matches your requirements.'

  async function buyerAction(action) {
    if (action === 'accept' && !window.confirm(`Accept this quotation at ${item.currency || 'INR'} ${Number(currentOffer.totalPrice || 0).toLocaleString()} total?`)) return
    setBusy(true); setError('')
    try {
      if (action === 'accept' || action === 'reject') {
        await respondToQuotation(quotationId, action, { ...concurrency(), ...(action === 'reject' ? { reason: actionText || 'Buyer rejected this quotation.' } : {}) })
      } else {
        await updateQuotation(quotationId, {
          ...concurrency(), action,
          reason: actionText || (action === 'counter_offer' ? 'Buyer sent a counter offer.' : 'Buyer requested a revision.'),
          buyerMessage: actionText || undefined,
          ...(action === 'counter_offer' ? { unitPrice: Number(counterPrice), suppliedQuantity: currentOffer.suppliedQuantity || item.suppliedQuantity } : {}),
        })
      }
      setDialog(''); setActionText(''); setCounterPrice('')
      setMessage(action === 'accept' ? 'Quotation accepted. The manufacturer will now prepare the Final Quotation.' : 'Your response was sent to the manufacturer.')
      await query.reload()
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  async function sellerAction(action) {
    if (action === 'confirm') return document.getElementById('final-quotation-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const labels = { accept_counter: `Accept the buyer counter offer at ${item.currency || 'INR'} ${Number(currentOffer.totalPrice || 0).toLocaleString()} total?`, reject: 'Reject this buyer counter offer?', withdraw: 'Withdraw this quotation?', send: 'Submit this quotation to the buyer?' }
    if (!window.confirm(labels[action] || `Confirm ${action.replaceAll('_', ' ')}?`)) return
    setBusy(true); setError('')
    try {
      await updateQuotation(quotationId, { ...concurrency(), action, reason: actionText || undefined })
      setMessage(action === 'accept_counter' ? 'Buyer counter offer accepted.' : action === 'reject' ? 'Counter offer rejected.' : action === 'withdraw' ? 'Quotation withdrawn.' : 'Quotation sent to buyer.')
      await query.reload()
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  async function openChat() {
    setError('')
    try {
      if (resolveId(item.chatId)) return navigate(`/messages/${resolveId(item.chatId)}`)
      const otherUserId = sellerView ? resolveId(rfq.buyerId || rfq.userId) : resolveId(item.userId || seller.userId)
      const result = await createChat({ otherUserId, productId: resolveId(item.productId) || undefined, rfqId: resolveId(item.rfqId), quotationId, role: sellerView ? 'seller' : 'buyer', chatType: 'rfq_negotiation' })
      navigate(`/messages/${resolveId(result.chat)}`)
    } catch (nextError) { setError(nextError.message) }
  }

  if (query.loading) return <AppShell><div className="listing-page container"><TradeSkeleton /></div></AppShell>
  if (query.error) return <AppShell><div className="listing-page container"><div className="inline-error">{query.error.message}</div></div></AppShell>
  const canAccept = BUYER_OPEN.includes(item.status) && Boolean(resolveId(item.productId))

  return <AppShell><div className="detail-page container trade-page quotation-detail-page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back to quotations</button>
    <section className="quotation-hero">
      <div><div className="trade-heading-line"><span className="eyebrow">{item.quotationNumber || 'Supplier quotation'}</span><StatusBadge status={item.status || 'pending'} /></div><h1>{item.title || product.name || rfq.title || 'Quotation'}</h1><p>{sellerView ? `Prepared for ${displayName(rfq.buyerId, 'Buyer')}` : `From ${displayName(seller, 'Supplier')}`}</p></div>
      <div className="quotation-hero__price"><small>Current offer</small><b><Money value={currentOffer.totalPrice || currentOffer.unitPrice} currency={item.currency} /></b><span><Money value={currentOffer.unitPrice} currency={item.currency} /> / unit</span></div>
    </section>
    <section className="quotation-status-panel">
      <div>
        <span>{sellerView ? 'Seller workflow' : 'Buyer workflow'}</span>
        <h3>{workflowMessage.split('. ')[0]}.</h3>
      </div>
      <p>{workflowMessage}</p>
    </section>
    <CurrentOfferCard offer={currentOffer} item={item} rfq={rfq} sellerView={sellerView} />
    {error && <p className="action-error">{error}</p>}{message && <p className="action-success">{message}</p>}
    {!(item.status === 'final_quotation_pending' && !sellerView) && <div className="quotation-actionbar">
      <button className="button button--secondary" onClick={openChat}><MessageSquare /> Continue chat</button>
      {sellerView ? <>
        {SELLER_OPEN.includes(item.status) && <button className="button button--primary" onClick={() => setDialog('edit')}><Edit3 /> {item.status === 'countered' ? 'Revise offer' : 'Revise quotation'}</button>}
        {item.status === 'countered' && <><button className="button button--primary success-button" disabled={busy} onClick={() => sellerAction('accept_counter')}><CheckCircle /> Accept counter</button><button className="danger-text" disabled={busy} onClick={() => sellerAction('reject')}><XCircle /> Reject counter</button></>}
        {item.status === 'buyer_accepted' && <button className="button button--primary success-button" disabled={busy} onClick={() => sellerAction('confirm')}><CheckCircle /> Prepare Final Quotation</button>}
        {SELLER_OPEN.includes(item.status) && <button className="danger-text" disabled={busy} onClick={() => sellerAction('withdraw')}><XCircle /> Withdraw</button>}
      </> : <>
        {canAccept && <button className="button button--primary success-button" onClick={() => buyerAction('accept')} disabled={busy}><CheckCircle /> Accept quotation</button>}
        {BUYER_OPEN.includes(item.status) && <><button onClick={() => setDialog('request_revision')}><RefreshCw /> Request revision</button><button onClick={() => { setCounterPrice(String(currentOffer.unitPrice || item.unitPrice || '')); setDialog('counter_offer') }}>Counter offer</button><button className="danger-text" onClick={() => setDialog('reject')}><XCircle /> Reject</button></>}
        {item.status === 'rejected' && <button onClick={() => window.confirm('Reopen this rejected quotation for another review cycle?') && updateQuotation(quotationId, { ...concurrency(), action: 'reopen', reason: 'Buyer reopened quotation' }).then(() => query.reload())}><RefreshCw /> Reopen</button>}
      </>}
    </div>}
    {!canAccept && !sellerView && BUYER_OPEN.includes(item.status) && <p className="warning-note">A linked product is required before this quotation can create an order.</p>}

    <div className="detail-columns"><div>
      <section className="detail-card"><h2>Commercial details</h2><dl className="trade-detail-grid">
        <DetailItem label="Seller's latest price"><Money value={item.unitPrice} currency={item.currency} /></DetailItem>
        <DetailItem label="Current negotiated price"><Money value={currentOffer.unitPrice} currency={item.currency} /></DetailItem>
        <DetailItem label="Supplied quantity">{currentOffer.suppliedQuantity || item.suppliedQuantity || item.quantity} {item.unit || rfq.unit}</DetailItem>
        <DetailItem label="Minimum order">{currentOffer.minimumOrderQuantity || item.minimumOrderQuantity || '—'} {item.unit || rfq.unit}</DetailItem>
        <DetailItem label="Lead time">{currentOffer.leadTime || item.leadTime} {currentOffer.leadTimeUnit || item.leadTimeUnit}</DetailItem>
        <DetailItem label="Payment terms">{currentOffer.paymentTerms || item.paymentTerms}</DetailItem>
        <DetailItem label="Advance required">{item.advanceRequired !== undefined ? `${item.advanceRequired}%` : undefined}</DetailItem>
        <DetailItem label="Incoterms">{currentOffer.incoterms || item.incoterms}</DetailItem>
        <DetailItem label="Shipping cost"><Money value={item.shippingCost} currency={item.currency} /></DetailItem>
        <DetailItem label="Valid until">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '—'}</DetailItem>
      </dl>{item.sellerMessage && <div className="requirement-copy"><h3>Supplier note</h3><p>{item.sellerMessage}</p></div>}{item.buyerMessage && <div className="requirement-copy"><h3>Buyer response</h3><p>{item.buyerMessage}</p></div>}</section>
      {(dealProduct.name || dealProduct.description || dealProduct.specifications || dealProduct.material || dealProduct.size || dealProduct.color || dealProduct.finish || dealProduct.customNotes) && <section className="detail-card"><h2>Configured product</h2>{dealProduct.name && <h3>{dealProduct.name}</h3>}{dealProduct.description && <p>{dealProduct.description}</p>}<dl className="trade-detail-grid">{dealProduct.material && <DetailItem label="Material">{dealProduct.material}</DetailItem>}{dealProduct.size && <DetailItem label="Size">{dealProduct.size}</DetailItem>}{dealProduct.color && <DetailItem label="Color">{dealProduct.color}</DetailItem>}{dealProduct.finish && <DetailItem label="Finish">{dealProduct.finish}</DetailItem>}{dealProduct.packaging && <DetailItem label="Packaging">{dealProduct.packaging}</DetailItem>}{dealProduct.quantity && <DetailItem label="Deal quantity">{dealProduct.quantity}</DetailItem>}{dealProduct.minimumOrderQuantity && <DetailItem label="MOQ">{dealProduct.minimumOrderQuantity}</DetailItem>}{dealProduct.customNotes && <DetailItem label="Deal note">{dealProduct.customNotes}</DetailItem>}</dl>{dealProduct.specifications && <div className="requirement-copy"><h3>Specifications</h3><p>{dealProduct.specifications}</p></div>}</section>}
      {(item.specifications || item.description || item.notes) && <section className="detail-card"><h2>Offer notes</h2>{item.description && <p>{item.description}</p>}{item.specifications && <p>{item.specifications}</p>}{item.notes && <p>{item.notes}</p>}</section>}
      {item.attachments?.length > 0 && <section className="detail-card"><h2>Attachments</h2><div className="attachment-list">{item.attachments.map((file, index) => <a href={file.url || file} target="_blank" rel="noreferrer" key={file._id || index}><FileText /> {file.filename || file.name || `Document ${index + 1}`} <Download /></a>)}</div></section>}
    </div><aside>
      <section className="detail-card"><h2><ShieldCheck /> Supplier</h2><h3>{displayName(seller, 'Supplier')}</h3><p>{seller.companyDescription || 'Verified marketplace supplier information is linked to this offer.'}</p>{resolveId(seller) && <Link to={`/sellers/${resolveId(seller)}`}>View supplier profile</Link>}</section>
      <section className="detail-card"><h2><PackageCheck /> Linked RFQ</h2><h3>{rfq.title || 'Request for quotation'}</h3><p>{rfq.quantity} {rfq.unit} · {rfq.deliveryCountry || rfq.destinationCountry}</p>{resolveId(item.rfqId) && <Link to={`/rfqs/${resolveId(item.rfqId)}`}>View RFQ details</Link>}</section>
      <NegotiationTimeline history={item.negotiationHistory || []} currency={item.currency} />
      <section className="detail-card"><h2>Workflow</h2><p>Current: <b>{String(item.status || '').replaceAll('_', ' ')}</b></p><p>Previous: {String(item.previousStatus || '—').replaceAll('_', ' ')}</p>{item.lifecycle?.allowedActions?.length > 0 && <p>Next: {item.lifecycle.allowedActions.map((entry) => String(entry.action).replaceAll('_', ' ')).join(', ')}</p>}</section>
    </aside></div>
  </div><FinalQuotationPanel quotationId={quotationId} />
  {dialog && dialog !== 'edit' && <ActionDialog type={dialog} text={actionText} setText={setActionText} counterPrice={counterPrice} setCounterPrice={setCounterPrice} busy={busy} currentOffer={currentOffer} currency={item.currency} onClose={() => setDialog('')} onSubmit={() => buyerAction(dialog)} />}
  {dialog === 'edit' && <QuotationEditDialog item={item} currentOffer={currentOffer} onClose={() => setDialog('')} onSuccess={() => { setDialog(''); setMessage('Quotation revised successfully.'); query.reload() }} />}
  </AppShell>
}

function CurrentOfferCard({ offer, item, rfq, sellerView }) {
  const difference = Number(offer.previousUnitPrice || 0) - Number(offer.unitPrice || 0)
  const buyerCounter = offer.action === 'buyer_counter'
  const isWaitingForMe = sellerView && buyerCounter || !sellerView && ['pending', 'submitted', 'negotiating'].includes(item.status)
  
  const nextStep = sellerView
    ? buyerCounter
      ? 'Action needed: review the counter, confirm the updated deal terms, and decide whether to accept or revise.'
      : item.status === 'buyer_accepted'
        ? 'Buyer accepted the quote. Prepare the final quotation and confirm the locked commercial terms.'
        : 'Keep this offer aligned with the exact product configuration before finalizing the deal.'
    : buyerCounter
      ? 'Buyer counter received: compare this revised offer against the original deal terms before responding.'
      : item.status === 'revised'
        ? 'The seller revised the proposal. Review the updated configuration and send your decision.'
        : 'Review the current offer and accept only when the negotiated product details match your required specifications.'
  
  return <section className={`quotation-current-offer ${buyerCounter ? 'countered' : ''} ${isWaitingForMe ? 'awaiting-action' : ''}`}>
    <header>
      <div>
        <span>Current offer</span>
        <h2><Money value={offer.unitPrice} currency={item.currency} /> <small>/ {rfq.unit || 'unit'}</small></h2>
      </div>
      <div className="offer-status">
        <StatusBadge status={buyerCounter ? 'countered' : item.status} />
        {isWaitingForMe && <span className="awaiting-badge">Your turn</span>}
      </div>
    </header>
    <div className="offer-details">
      <span><small>Offered by</small><b>{offer.actorRole === 'buyer' ? 'Buyer' : 'Seller'}</b></span>
      <span><small>Quantity</small><b>{offer.suppliedQuantity || item.suppliedQuantity || rfq.quantity} {rfq.unit}</b></span>
      <span><small>Total</small><b><Money value={offer.totalPrice} currency={item.currency} /></b></span>
      {offer.previousUnitPrice && <span className="previous-price"><small>Previous</small><b><Money value={offer.previousUnitPrice} currency={item.currency} /></b></span>}
      {offer.previousUnitPrice && <span className="price-change"><small>Changed</small><b className={difference > 0 ? 'decreased' : 'increased'}>{difference > 0 ? '−' : difference < 0 ? '+' : ''}<Money value={Math.abs(difference)} currency={item.currency} /></b></span>}
    </div>
    {buyerCounter && sellerView && <p className="counter-alert"><b>Buyer sent a counter offer.</b> Review the previous and proposed prices, then revise, accept, or reject it.</p>}
    <p className="quotation-next-step">{nextStep}</p>
    {offer.notes && <blockquote>{offer.notes}</blockquote>}
  </section>
}

function NegotiationTimeline({ history, currency }) {
  return <section className="detail-card quotation-history"><h2><Truck /> Negotiation history</h2><div className="mini-timeline">{history.map((entry, index) => <span className={index === history.length - 1 ? 'latest' : ''} key={entry._id || entry.idempotencyKey || index}><i /><div><b>{String(entry.action || 'Update').replaceAll('_', ' ')}</b><p>{entry.actorRole === 'buyer' ? 'Buyer' : entry.actorRole === 'seller' ? 'Seller' : ''}{entry.unitPrice ? <> · <Money value={entry.unitPrice} currency={currency} /> / unit</> : null}</p>{entry.previousUnitPrice && <p>Previous: <Money value={entry.previousUnitPrice} currency={currency} /></p>}{entry.message && <p>{entry.message}</p>}<small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</small></div></span>)}</div></section>
}

function ActionDialog({ type, text, setText, counterPrice, setCounterPrice, busy, currentOffer, currency, onClose, onSubmit }) {
  const title = type === 'reject' ? 'Reject quotation' : type === 'counter_offer' ? 'Send counter offer' : 'Request revision'
  const confirmLabel = type === 'counter_offer' ? <>Yes, Send Counter Offer — <Money value={Number(counterPrice || 0)} currency={currency} /> / unit</> : type === 'reject' ? 'Yes, Reject Quotation' : 'Yes, Request Revision'
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="action-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="compact-heading"><h2>{title}</h2><button onClick={onClose}>×</button></div>{type === 'counter_offer' && <><p className="counter-reference">Current offer: <b><Money value={currentOffer.unitPrice} currency={currency} /> / unit</b></p><Field label="Counter price per unit"><input type="number" min="0.01" step="0.01" required value={counterPrice} onChange={(event) => setCounterPrice(event.target.value)} /></Field></>}<Field label="Message"><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Explain your response to the supplier" /></Field><button className={`button button--full ${type === 'reject' ? 'button--danger' : 'button--primary'}`} disabled={busy || (type === 'counter_offer' && !(Number(counterPrice) > 0))} onClick={onSubmit}>{busy ? 'Sending…' : confirmLabel}</button></div></div>
}

function QuotationEditDialog({ item, currentOffer, onClose, onSuccess }) {
  const [attachments, setAttachments] = useState(item.attachments || [])
  const dealProduct = item.productConfiguration || {}
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}
  const [form, setForm] = useState({
    unitPrice: currentOffer.unitPrice || item.unitPrice || '',
    suppliedQuantity: currentOffer.suppliedQuantity || item.suppliedQuantity || item.quantity || '',
    minimumOrderQuantity: currentOffer.minimumOrderQuantity || item.minimumOrderQuantity || '',
    leadTime: currentOffer.leadTime || item.leadTime || '',
    leadTimeUnit: currentOffer.leadTimeUnit || item.leadTimeUnit || 'days',
    productionTime: item.productionTime || '',
    productionTimeUnit: item.productionTimeUnit || 'days',
    productName: dealProduct.name || item.title || rfq.title || '',
    productDescription: dealProduct.description || item.description || rfq.description || '',
    productSpecifications: dealProduct.specifications || item.specifications || rfq.specifications || '',
    material: dealProduct.material || '',
    size: dealProduct.size || '',
    color: dealProduct.color || '',
    finish: dealProduct.finish || '',
    packaging: dealProduct.packaging || (typeof item.packaging === 'string' ? item.packaging : item.packaging?.description || ''),
    customNotes: dealProduct.customNotes || item.sellerMessage || '',
    samplePrice: item.samplePrice || '',
    taxRate: item.taxes?.taxRate || '',
    shippingTerms: item.shippingTerms || '',
    paymentTerms: currentOffer.paymentTerms || item.paymentTerms || '',
    incoterms: currentOffer.incoterms || item.incoterms || 'FOB',
    shippingCost: item.shippingCost || 0,
    shippingEstimate: item.shippingEstimate || '',
    sellerMessage: '',
    specifications: item.specifications || '',
  })
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const total = useMemo(() => {
    const subtotal = Number(form.unitPrice || 0) * Number(form.suppliedQuantity || 0)
    return subtotal + Number(form.shippingCost || 0) + subtotal * Number(form.taxRate || 0) / 100
  }, [form.shippingCost, form.suppliedQuantity, form.taxRate, form.unitPrice])
  async function submit(event) {
    event.preventDefault()
    if (!window.confirm(`Submit this revised quotation at ${item.currency || 'INR'} ${Number(total).toLocaleString()} total?`)) return
    setBusy(true); setError('')
    try {
      const productConfiguration = {
        ...(dealProduct || {}),
        productId: resolveId(item.productId) || undefined,
        name: form.productName || rfq.title || 'Configured product',
        description: form.productDescription || item.description || rfq.description || '',
        specifications: form.productSpecifications || item.specifications || rfq.specifications || '',
        material: form.material || '',
        size: form.size || '',
        color: form.color || '',
        finish: form.finish || '',
        packaging: form.packaging || '',
        customNotes: form.customNotes || form.sellerMessage || '',
        quantity: Number(form.suppliedQuantity),
        minimumOrderQuantity: Number(form.minimumOrderQuantity),
        unitPrice: Number(form.unitPrice),
        currency: item.currency || 'INR',
        leadTime: Number(form.leadTime),
        leadTimeUnit: form.leadTimeUnit || 'days',
        paymentTerms: form.paymentTerms || item.paymentTerms || 'negotiable',
        shippingTerms: form.shippingTerms || item.shippingTerms || '',
      }
      await updateQuotation(resolveId(item), { ...form, productConfiguration, expectedNegotiationVersion: Number(item.negotiationVersion || 0), idempotencyKey: actionToken(), unitPrice: Number(form.unitPrice), suppliedQuantity: Number(form.suppliedQuantity), minimumOrderQuantity: Number(form.minimumOrderQuantity), leadTime: Number(form.leadTime), shippingCost: Number(form.shippingCost), productionTime: Number(form.productionTime) || undefined, samplePrice: Number(form.samplePrice) || undefined, taxes: form.taxRate ? { taxRate: Number(form.taxRate) } : undefined, packaging: form.packaging || undefined, shippingTerms: form.shippingTerms || undefined, attachments })
      if (item.status === 'draft') await updateQuotation(resolveId(item), { action: 'send', expectedNegotiationVersion: Number(item.negotiationVersion || 0) + 1, idempotencyKey: actionToken() })
      onSuccess()
    } catch (nextError) { setError(nextError.message); setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="quotation-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="compact-heading"><h2>{item.status === 'countered' ? 'Revise counter offer' : 'Revise quotation'}</h2><button type="button" onClick={onClose}>×</button></div>{item.status === 'countered' && <p className="counter-reference">Buyer counter: <b><Money value={currentOffer.unitPrice} currency={item.currency} /> / unit</b>. Edit the fields below to send your revision.</p>}<div className="form-grid form-grid--3">{[['unitPrice', 'Unit price'], ['suppliedQuantity', 'Quantity'], ['minimumOrderQuantity', 'MOQ']].map(([key, label]) => <Field key={key} label={label}><input type="number" min="0.01" step="0.01" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required /></Field>)}</div><div className="form-grid"><Field label="Lead time"><input type="number" min="1" value={form.leadTime} onChange={(event) => setForm({ ...form, leadTime: event.target.value })} required /></Field><Field label="Incoterms"><input value={form.incoterms} onChange={(event) => setForm({ ...form, incoterms: event.target.value })} /></Field><Field label="Shipping cost"><input type="number" min="0" value={form.shippingCost} onChange={(event) => setForm({ ...form, shippingCost: event.target.value })} /></Field><Field label="Shipping estimate"><input value={form.shippingEstimate} onChange={(event) => setForm({ ...form, shippingEstimate: event.target.value })} /></Field></div><div className="requirement-copy"><h3>Deal product configuration</h3><p>Update the exact product configuration for this negotiation. These values are retained with the quotation and used in the Final Quotation.</p></div><div className="form-grid form-grid--3"><Field label="Deal product name"><input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder={rfq.title || 'Configured product'} /></Field><Field label="Material"><input value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value })} /></Field><Field label="Finish"><input value={form.finish} onChange={(event) => setForm({ ...form, finish: event.target.value })} /></Field></div><div className="form-grid form-grid--3"><Field label="Size / model"><input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></Field><Field label="Color"><input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></Field><Field label="Packaging"><input value={form.packaging} onChange={(event) => setForm({ ...form, packaging: event.target.value })} /></Field></div><div className="form-grid"><Field label="Product description"><textarea rows="2" value={form.productDescription} onChange={(event) => setForm({ ...form, productDescription: event.target.value })} /></Field><Field label="Technical specifications"><textarea rows="2" value={form.productSpecifications} onChange={(event) => setForm({ ...form, productSpecifications: event.target.value })} /></Field></div><Field label="Custom notes"><textarea rows="2" value={form.customNotes} onChange={(event) => setForm({ ...form, customNotes: event.target.value })} /></Field><Field label="Payment terms"><input value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })} /></Field><Field label="Message"><textarea value={form.sellerMessage} onChange={(event) => setForm({ ...form, sellerMessage: event.target.value })} placeholder="Explain this revision to the buyer" /></Field><AttachmentUploader folder="quotations" value={attachments} onChange={setAttachments} />{error && <p className="action-error">{error}</p>}<button className="button button--primary button--full" disabled={busy}>{busy ? 'Saving…' : 'Submit revision'}</button></form></div>
}
