import { ArrowLeft, CheckCircle, ChevronDown, Download, Edit3, FileText, Image, MessageSquare, PackageCheck, RefreshCw, ShieldCheck, Truck, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createChat, fetchQuotation, respondToQuotation, updateQuotation } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import FinalQuotationPanel from '../components/AgreementPanel'
import { SafeImage } from '../components/MarketplaceCards'
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

// Helper function to safely render specifications
function SpecificationsDisplay({ specifications }) {
  if (!specifications) return null;
  
  // If string, render directly
  if (typeof specifications === 'string') {
    return (
      <div className="requirement-copy">
        <h3>Specifications</h3>
        <p>{specifications}</p>
      </div>
    );
  }
  
  // If object, render key-value pairs
  return (
    <div className="requirement-copy">
      <h3>Specifications</h3>
      <dl className="trade-detail-grid">
        {Object.entries(specifications).map(([key, value]) => (
          <DetailItem key={key} label={key}>
            {typeof value === 'object' ? JSON.stringify(value) : value || '—'}
          </DetailItem>
        ))}
      </dl>
    </div>
  );
}

// Helper to convert specifications to string for textarea
function specificationsToString(specifications) {
  if (!specifications) return '';
  if (typeof specifications === 'string') return specifications;
  try {
    return JSON.stringify(specifications, null, 2);
  } catch {
    return '';
  }
}

// Helper to parse specifications from form
function parseSpecifications(specifications) {
  if (!specifications) return '';
  if (typeof specifications === 'object') return specifications;
  try {
    const trimmed = specifications.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    return specifications;
  } catch {
    return specifications;
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
  const productEditable = sellerView && SELLER_OPEN.includes(item.status)

  return <AppShell><div className="detail-page container trade-page quotation-detail-page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back to quotations</button>
    <section className="quotation-hero">
      <div><div className="trade-heading-line"><span className="eyebrow">{item.quotationNumber || 'Supplier quotation'}</span><StatusBadge status={item.status || 'pending'} /></div><h1>{item.title || product.name || rfq.title || 'Quotation'}</h1><p>{sellerView ? `Prepared for ${displayName(rfq.buyerId, 'Buyer')}` : `From ${displayName(seller, 'Supplier')}`}</p></div>
      <div className="quotation-hero__price"><small>Current offer</small><b><Money value={currentOffer.totalPrice || currentOffer.unitPrice} currency={item.currency} /></b><span><Money value={currentOffer.unitPrice} currency={item.currency} /> / unit</span></div>
    </section>
    {sellerView && (productEditable
      ? <button className="button button--primary quotation-product-edit" onClick={() => setDialog('product')}><Edit3 /> Edit Product Details</button>
      : <div className="quotation-locked-note"><ShieldCheck /><span><b>Deal product locked</b>These deal terms are locked because the agreement has been finalized.</span></div>)}
    <section className="quotation-status-panel">
      <div>
        <span>{sellerView ? 'Seller workflow' : 'Buyer workflow'}</span>
        <h3>{workflowMessage.split('. ')[0]}.</h3>
      </div>
      <p>{workflowMessage}</p>
    </section>
    <CurrentOfferCard offer={currentOffer} item={item} rfq={rfq} sellerView={sellerView} />
    <DealProductHighlights product={dealProduct} unit={item.unit || rfq.unit} />
    {error && <p className="action-error">{error}</p>}{message && <p className="action-success">{message}</p>}
    {!(item.status === 'final_quotation_pending' && !sellerView) && <div className="quotation-actionbar">
      <button className="button button--secondary" onClick={openChat}><MessageSquare /> Continue chat</button>
      {sellerView ? <>
        {SELLER_OPEN.includes(item.status) && <button className="button button--primary" onClick={() => setDialog('edit')}><Edit3 /> {item.status === 'countered' ? 'Revise offer' : 'Revise quotation'}</button>}
        {item.status === 'countered' && <><button className="button button--primary success-button" disabled={busy} onClick={() => setDialog('seller_accept_counter')}><CheckCircle /> Accept counter</button><button className="danger-text" disabled={busy} onClick={() => setDialog('seller_reject')}><XCircle /> Reject counter</button></>}
        {item.status === 'buyer_accepted' && <button className="button button--primary success-button" disabled={busy} onClick={() => sellerAction('confirm')}><CheckCircle /> Prepare Final Quotation</button>}
        {SELLER_OPEN.includes(item.status) && <button className="danger-text" disabled={busy} onClick={() => setDialog('seller_withdraw')}><XCircle /> Withdraw</button>}
      </> : <>
        {canAccept && <button className="button button--primary success-button" onClick={() => setDialog('accept')} disabled={busy}><CheckCircle /> Accept quotation</button>}
        {BUYER_OPEN.includes(item.status) && <><button onClick={() => setDialog('request_revision')}><RefreshCw /> Request revision</button><button onClick={() => { setCounterPrice(String(currentOffer.unitPrice || item.unitPrice || '')); setDialog('counter_offer') }}>Counter offer</button><button className="danger-text" onClick={() => setDialog('reject')}><XCircle /> Reject</button></>}
        {item.status === 'rejected' && <button onClick={() => setDialog('reopen')}><RefreshCw /> Reopen</button>}
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
      
      {(dealProduct.name || dealProduct.description || dealProduct.specifications || dealProduct.material || dealProduct.size || dealProduct.color || dealProduct.finish || dealProduct.customNotes) && <section className="detail-card"><h2>Configured product</h2>{dealProduct.name && <h3>{dealProduct.name}</h3>}{dealProduct.description && <p>{dealProduct.description}</p>}<dl className="trade-detail-grid">{dealProduct.material && <DetailItem label="Material">{dealProduct.material}</DetailItem>}{dealProduct.size && <DetailItem label="Size">{dealProduct.size}</DetailItem>}{dealProduct.color && <DetailItem label="Color">{dealProduct.color}</DetailItem>}{dealProduct.finish && <DetailItem label="Finish">{dealProduct.finish}</DetailItem>}{dealProduct.packaging && <DetailItem label="Packaging">{dealProduct.packaging}</DetailItem>}{dealProduct.quantity && <DetailItem label="Deal quantity">{dealProduct.quantity}</DetailItem>}{dealProduct.minimumOrderQuantity && <DetailItem label="MOQ">{dealProduct.minimumOrderQuantity}</DetailItem>}{dealProduct.customNotes && <DetailItem label="Deal note">{dealProduct.customNotes}</DetailItem>}</dl><SpecificationsDisplay specifications={dealProduct.specifications} /></section>}
      
      {(item.specifications || item.description || item.notes) && <section className="detail-card"><h2>Offer notes</h2>{item.description && <p>{item.description}</p>}<SpecificationsDisplay specifications={item.specifications} />{item.notes && <p>{item.notes}</p>}</section>}
      
      {item.attachments?.length > 0 && <section className="detail-card"><h2>Attachments</h2><div className="attachment-list">{item.attachments.map((file, index) => <a href={file.url || file} target="_blank" rel="noreferrer" key={file._id || index}><FileText /> {file.filename || file.name || `Document ${index + 1}`} <Download /></a>)}</div></section>}
    </div><aside>
      <section className="detail-card"><h2><ShieldCheck /> Supplier</h2><h3>{displayName(seller, 'Supplier')}</h3><p>{seller.companyDescription || 'Verified marketplace supplier information is linked to this offer.'}</p>{resolveId(seller) && <Link to={`/sellers/${resolveId(seller)}`}>View supplier profile</Link>}</section>
      <section className="detail-card"><h2><PackageCheck /> Linked RFQ</h2><h3>{rfq.title || 'Request for quotation'}</h3><p>{rfq.quantity} {rfq.unit} · {rfq.deliveryCountry || rfq.destinationCountry}</p>{resolveId(item.rfqId) && <Link to={`/rfqs/${resolveId(item.rfqId)}`}>View RFQ details</Link>}</section>
      <NegotiationTimeline history={item.negotiationHistory || []} currency={item.currency} />
      <ProductChangeHistory history={item.productConfigurationHistory || []} />
      <section className="detail-card"><h2>Workflow</h2><p>Current: <b>{String(item.status || '').replaceAll('_', ' ')}</b></p><p>Previous: {String(item.previousStatus || '—').replaceAll('_', ' ')}</p>{item.lifecycle?.allowedActions?.length > 0 && <p>Next: {item.lifecycle.allowedActions.map((entry) => String(entry.action).replaceAll('_', ' ')).join(', ')}</p>}</section>
    </aside></div>
  </div><FinalQuotationPanel quotationId={quotationId} />
  {dialog && !['edit', 'product'].includes(dialog) && <ActionDialog type={dialog} text={actionText} setText={setActionText} counterPrice={counterPrice} setCounterPrice={setCounterPrice} busy={busy} currentOffer={currentOffer} currency={item.currency} onClose={() => setDialog('')} onSubmit={async () => {
    if (dialog.startsWith('seller_')) return sellerAction(dialog.replace('seller_', ''))
    if (dialog === 'reopen') { setBusy(true); setError(''); try { await updateQuotation(quotationId, { ...concurrency(), action: 'reopen', reason: 'Buyer reopened quotation' }); setDialog(''); await query.reload() } catch (next) { setError(next.message) } finally { setBusy(false) } return }
    return buyerAction(dialog)
  }} />}
  {['edit', 'product'].includes(dialog) && <QuotationEditDialog mode={dialog} item={item} currentOffer={currentOffer} onClose={() => setDialog('')} onSuccess={() => { setDialog(''); setMessage(dialog === 'product' ? 'Deal product details updated. The buyer can now review the latest configuration.' : 'Quotation revised successfully.'); query.reload() }} />}
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
      <span><small>Lead time</small><b>{offer.leadTime || item.leadTime || '—'} {offer.leadTimeUnit || item.leadTimeUnit || ''}</b></span>
      <span><small>Important terms</small><b>{offer.paymentTerms || item.paymentTerms || offer.incoterms || item.incoterms || 'To be agreed'}</b></span>
      {offer.previousUnitPrice && <span className="previous-price"><small>Previous</small><b><Money value={offer.previousUnitPrice} currency={item.currency} /></b></span>}
      {offer.previousUnitPrice && <span className="price-change"><small>Changed</small><b className={difference > 0 ? 'decreased' : 'increased'}>{difference > 0 ? '−' : difference < 0 ? '+' : ''}<Money value={Math.abs(difference)} currency={item.currency} /></b></span>}
    </div>
    <div className="current-status-line"><small>Current status</small><b>{isWaitingForMe ? `Waiting for ${sellerView ? 'Seller' : 'Buyer'}` : sellerView ? 'Waiting for Buyer' : 'Waiting for Seller'}</b></div>
    {buyerCounter && sellerView && <p className="counter-alert"><b>Buyer sent a counter offer.</b> Review the previous and proposed prices, then revise, accept, or reject it.</p>}
    <p className="quotation-next-step">{nextStep}</p>
    {offer.notes && <blockquote>{offer.notes}</blockquote>}
  </section>
}

function DealProductHighlights({ product, unit }) {
  if (!product?.name) return null
  return <section className="deal-product-highlight"><SafeImage src={typeof product.image === 'object' ? product.image.url : product.image} alt={product.name} /><div><span className="eyebrow">Current deal product</span><h2>{product.name}</h2><p>{product.description || 'Configured specifically for this quotation.'}</p><dl><DetailItem label="Material">{product.material}</DetailItem><DetailItem label="Finish">{product.finish}</DetailItem><DetailItem label="Size">{product.size}</DetailItem><DetailItem label="Color">{product.color}</DetailItem><DetailItem label="Packaging">{product.packaging}</DetailItem><DetailItem label="Quantity">{product.quantity ? `${product.quantity} ${unit || ''}` : undefined}</DetailItem><DetailItem label="Customization">{product.customization}</DetailItem><DetailItem label="OEM / private label">{product.oemRequirements}</DetailItem></dl></div></section>
}

function NegotiationTimeline({ history, currency }) {
  const [expanded, setExpanded] = useState(Math.max(0, history.length - 1))
  return <section className="detail-card quotation-history"><h2><Truck /> Negotiation history</h2><div className="mini-timeline">{history.map((entry, index) => <button type="button" aria-expanded={expanded === index} onClick={() => setExpanded(expanded === index ? -1 : index)} className={`${index === history.length - 1 ? 'latest' : ''} ${expanded === index ? 'expanded' : ''}`} key={entry._id || entry.idempotencyKey || index}><i /><div><header><b>{entry.actorRole === 'buyer' ? 'Buyer' : entry.actorRole === 'seller' ? 'Seller' : 'System'} — {String(entry.action || 'Update').replaceAll('_', ' ')}</b><ChevronDown /></header>{entry.unitPrice ? <strong><Money value={entry.unitPrice} currency={currency} /> / unit</strong> : null}<section><p>{entry.suppliedQuantity ? `Quantity: ${entry.suppliedQuantity}` : ''}</p>{entry.previousUnitPrice && <p>Previous price: <Money value={entry.previousUnitPrice} currency={currency} /></p>}{entry.message && <p>{entry.message}</p>}<small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</small></section></div></button>)}</div></section>
}

const PRODUCT_FIELD_LABELS = { name: 'Product name', image: 'Product image', material: 'Material', finish: 'Finish', size: 'Size', color: 'Color', packaging: 'Packaging', description: 'Description', specifications: 'Specifications', customization: 'Customization', oemRequirements: 'OEM / private label', customNotes: 'Deal notes', quantity: 'Quantity', minimumOrderQuantity: 'MOQ' }
function displayConfigValue(value) { if (value === undefined || value === null || value === '') return 'Not specified'; return typeof value === 'object' ? Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(', ') : String(value) }
function ProductChangeHistory({ history }) {
  const changes = history.filter(entry => entry.changedFields?.some(field => PRODUCT_FIELD_LABELS[field]))
  if (!changes.length) return null
  return <section className="detail-card product-change-history"><h2><RefreshCw /> Product revisions</h2>{[...changes].reverse().map((entry, index) => <details key={entry._id || entry.version || index} open={index === 0}><summary><span><b>Product revision {entry.version}</b><small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</small></span><ChevronDown /></summary><p>{entry.reason || 'Deal product updated'}</p><dl>{entry.changedFields.filter(field => PRODUCT_FIELD_LABELS[field]).map(field => <div key={field}><dt>{PRODUCT_FIELD_LABELS[field]}</dt><dd><del>{displayConfigValue(entry.previousSnapshot?.[field])}</del><span>→</span><ins>{displayConfigValue(entry.snapshot?.[field])}</ins></dd></div>)}</dl></details>)}</section>
}

function ActionDialog({ type, text, setText, counterPrice, setCounterPrice, busy, currentOffer, currency, onClose, onSubmit }) {
  const titles = { reject: 'Reject quotation?', counter_offer: 'Send counter offer', request_revision: 'Request a revision', accept: 'Accept quotation?', reopen: 'Reopen quotation?', seller_accept_counter: 'Accept buyer counter?', seller_reject: 'Reject buyer counter?', seller_withdraw: 'Withdraw quotation?' }
  const dangerous = ['reject', 'seller_reject', 'seller_withdraw'].includes(type)
  const confirmLabel = type === 'counter_offer' ? <>Send Counter Offer — <Money value={Number(counterPrice || 0)} currency={currency} /> / unit</> : ({ accept: 'Accept Quotation', reopen: 'Reopen Quotation', seller_accept_counter: 'Accept Counter Offer', seller_reject: 'Reject Counter Offer', seller_withdraw: 'Withdraw Quotation', reject: 'Reject Quotation', request_revision: 'Request Revision' }[type] || 'Confirm')
  const showMessage = ['reject', 'counter_offer', 'request_revision', 'seller_reject', 'seller_withdraw'].includes(type)
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="action-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="compact-heading"><h2>{titles[type]}</h2><button aria-label="Close" onClick={onClose}>×</button></div><p>{type === 'accept' ? <>You are about to accept {currentOffer.suppliedQuantity || 'the agreed quantity'} units at <b><Money value={currentOffer.unitPrice} currency={currency} /> per unit</b>, total <b><Money value={currentOffer.totalPrice} currency={currency} /></b>.</> : type === 'seller_accept_counter' ? <>Confirm the buyer's counter at <b><Money value={currentOffer.unitPrice} currency={currency} /> per unit</b>.</> : type === 'reopen' ? 'This starts another review cycle so the quotation can be negotiated again.' : dangerous ? 'This action changes the active negotiation and the other party will be notified.' : 'The other party will be notified and can respond from this quotation.'}</p>{type === 'counter_offer' && <><p className="counter-reference">Current offer: <b><Money value={currentOffer.unitPrice} currency={currency} /> / unit</b></p><Field label="Counter price per unit"><input type="number" min="0.01" step="0.01" required value={counterPrice} onChange={(event) => setCounterPrice(event.target.value)} /></Field></>}{showMessage && <Field label={dangerous ? 'Reason' : 'Message'}><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Add a clear note for the other party" /></Field>}<footer><button className="button button--secondary" onClick={onClose}>Cancel</button><button className={`button ${dangerous ? 'button--danger' : 'button--primary'}`} disabled={busy || (type === 'counter_offer' && !(Number(counterPrice) > 0))} onClick={onSubmit}>{busy ? 'Working…' : confirmLabel}</button></footer></div></div>
}

function QuotationEditDialog({ mode = 'edit', item, currentOffer, onClose, onSuccess }) {
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
    productImage: typeof dealProduct.image === 'object' ? dealProduct.image.url || '' : dealProduct.image || '',
    productDescription: dealProduct.description || item.description || rfq.description || '',
    productSpecifications: specificationsToString(dealProduct.specifications || item.specifications || rfq.specifications),
    material: dealProduct.material || '',
    size: dealProduct.size || '',
    color: dealProduct.color || '',
    finish: dealProduct.finish || '',
    packaging: dealProduct.packaging || (typeof item.packaging === 'string' ? item.packaging : item.packaging?.description || ''),
    customNotes: dealProduct.customNotes || item.sellerMessage || '',
    customization: dealProduct.customization || dealProduct.customizationDetails || '',
    oemRequirements: dealProduct.oemRequirements || dealProduct.privateLabelRequirements || '',
    productChangeReason: '',
    samplePrice: item.samplePrice || '',
    taxRate: item.taxes?.taxRate || '',
    shippingTerms: item.shippingTerms || '',
    paymentTerms: currentOffer.paymentTerms || item.paymentTerms || '',
    incoterms: currentOffer.incoterms || item.incoterms || 'FOB',
    shippingCost: item.shippingCost || 0,
    shippingEstimate: item.shippingEstimate || '',
    sellerMessage: '',
    specifications: specificationsToString(item.specifications),
  })
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const productConfiguration = {
        ...(dealProduct || {}),
        productId: resolveId(item.productId) || undefined,
        name: form.productName || rfq.title || 'Configured product',
        image: form.productImage || '',
        description: form.productDescription || item.description || rfq.description || '',
        specifications: parseSpecifications(form.productSpecifications || item.specifications || rfq.specifications),
        material: form.material || '',
        size: form.size || '',
        color: form.color || '',
        finish: form.finish || '',
        packaging: form.packaging || '',
        customNotes: form.customNotes || form.sellerMessage || '',
        customization: form.customization || '',
        oemRequirements: form.oemRequirements || '',
        quantity: Number(form.suppliedQuantity),
        minimumOrderQuantity: Number(form.minimumOrderQuantity),
        unitPrice: Number(form.unitPrice),
        currency: item.currency || 'INR',
        leadTime: Number(form.leadTime),
        leadTimeUnit: form.leadTimeUnit || 'days',
        paymentTerms: form.paymentTerms || item.paymentTerms || 'negotiable',
        shippingTerms: form.shippingTerms || item.shippingTerms || '',
      }
      await updateQuotation(resolveId(item), { 
        ...form,
        productChangeReason: form.productChangeReason || (mode === 'product' ? 'Seller updated deal product details.' : undefined),
        productConfiguration, 
        expectedNegotiationVersion: Number(item.negotiationVersion || 0), 
        idempotencyKey: actionToken(), 
        unitPrice: Number(form.unitPrice), 
        suppliedQuantity: Number(form.suppliedQuantity), 
        minimumOrderQuantity: Number(form.minimumOrderQuantity), 
        leadTime: Number(form.leadTime), 
        shippingCost: Number(form.shippingCost), 
        productionTime: Number(form.productionTime) || undefined, 
        samplePrice: Number(form.samplePrice) || undefined, 
        taxes: form.taxRate ? { taxRate: Number(form.taxRate) } : undefined, 
        packaging: form.packaging || undefined, 
        shippingTerms: form.shippingTerms || undefined, 
        specifications: parseSpecifications(form.specifications),
        attachments 
      })
      if (item.status === 'draft') await updateQuotation(resolveId(item), { action: 'send', expectedNegotiationVersion: Number(item.negotiationVersion || 0) + 1, idempotencyKey: actionToken() })
      onSuccess()
    } catch (nextError) { setError(nextError.message); setBusy(false) }
  }

  if (mode === 'product') return <div className="modal-backdrop" onMouseDown={onClose}><form className="quotation-modal deal-product-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
    <div className="compact-heading"><div><span className="eyebrow">Deal-specific configuration</span><h2>Edit Product Details</h2></div><button type="button" aria-label="Close" onClick={onClose}>×</button></div>
    <p className="configuration-scope-note"><ShieldCheck /> These changes apply only to this deal. Your public catalogue product is not modified.</p>
    <div className="form-grid form-grid--3"><Field label="Product name"><input required value={form.productName} onChange={event => setForm({ ...form, productName: event.target.value })} /></Field><Field label="Deal quantity"><input type="number" min="1" required value={form.suppliedQuantity} onChange={event => setForm({ ...form, suppliedQuantity: event.target.value })} /></Field><Field label="MOQ"><input type="number" min="1" required value={form.minimumOrderQuantity} onChange={event => setForm({ ...form, minimumOrderQuantity: event.target.value })} /></Field></div>
    <Field label="Product image URL"><div className="input-with-icon"><Image /><input type="url" value={form.productImage} onChange={event => setForm({ ...form, productImage: event.target.value })} placeholder="https://..." /></div></Field>
    <div className="form-grid form-grid--3"><Field label="Material"><input value={form.material} onChange={event => setForm({ ...form, material: event.target.value })} /></Field><Field label="Finish"><input value={form.finish} onChange={event => setForm({ ...form, finish: event.target.value })} /></Field><Field label="Size / model"><input value={form.size} onChange={event => setForm({ ...form, size: event.target.value })} /></Field><Field label="Color"><input value={form.color} onChange={event => setForm({ ...form, color: event.target.value })} /></Field><Field label="Packaging"><input value={form.packaging} onChange={event => setForm({ ...form, packaging: event.target.value })} /></Field></div>
    <div className="form-grid"><Field label="Product description"><textarea rows="3" value={form.productDescription} onChange={event => setForm({ ...form, productDescription: event.target.value })} /></Field><Field label="Specifications"><textarea rows="3" value={form.productSpecifications} onChange={event => setForm({ ...form, productSpecifications: event.target.value })} /></Field><Field label="Customization requirements"><textarea rows="3" value={form.customization} onChange={event => setForm({ ...form, customization: event.target.value })} /></Field><Field label="OEM / private-label requirements"><textarea rows="3" value={form.oemRequirements} onChange={event => setForm({ ...form, oemRequirements: event.target.value })} /></Field></div>
    <Field label="Deal notes"><textarea rows="2" value={form.customNotes} onChange={event => setForm({ ...form, customNotes: event.target.value })} /></Field><Field label="What changed?"><textarea required value={form.productChangeReason} onChange={event => setForm({ ...form, productChangeReason: event.target.value })} placeholder="Example: Changed finish to matte and packaging to export grade" /></Field>
    {error && <p className="action-error">{error}</p>}<footer className="quotation-modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Product Details'}</button></footer>
  </form></div>
  
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="quotation-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="compact-heading"><h2>{item.status === 'countered' ? 'Revise counter offer' : 'Revise quotation'}</h2><button type="button" onClick={onClose}>×</button></div>{item.status === 'countered' && <p className="counter-reference">Buyer counter: <b><Money value={currentOffer.unitPrice} currency={item.currency} /> / unit</b>. Edit the fields below to send your revision.</p>}<div className="form-grid form-grid--3">{[['unitPrice', 'Unit price'], ['suppliedQuantity', 'Quantity'], ['minimumOrderQuantity', 'MOQ']].map(([key, label]) => <Field key={key} label={label}><input type="number" min="0.01" step="0.01" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required /></Field>)}</div><div className="form-grid"><Field label="Lead time"><input type="number" min="1" value={form.leadTime} onChange={(event) => setForm({ ...form, leadTime: event.target.value })} required /></Field><Field label="Incoterms"><input value={form.incoterms} onChange={(event) => setForm({ ...form, incoterms: event.target.value })} /></Field><Field label="Shipping cost"><input type="number" min="0" value={form.shippingCost} onChange={(event) => setForm({ ...form, shippingCost: event.target.value })} /></Field><Field label="Shipping estimate"><input value={form.shippingEstimate} onChange={(event) => setForm({ ...form, shippingEstimate: event.target.value })} /></Field></div><div className="requirement-copy"><h3>Deal product configuration</h3><p>Update the exact product configuration for this negotiation. These values are retained with the quotation and used in the Final Quotation.</p></div><div className="form-grid form-grid--3"><Field label="Deal product name"><input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder={rfq.title || 'Configured product'} /></Field><Field label="Material"><input value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value })} /></Field><Field label="Finish"><input value={form.finish} onChange={(event) => setForm({ ...form, finish: event.target.value })} /></Field></div><div className="form-grid form-grid--3"><Field label="Size / model"><input value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></Field><Field label="Color"><input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></Field><Field label="Packaging"><input value={form.packaging} onChange={(event) => setForm({ ...form, packaging: event.target.value })} /></Field></div><div className="form-grid"><Field label="Product description"><textarea rows="2" value={form.productDescription} onChange={(event) => setForm({ ...form, productDescription: event.target.value })} /></Field><Field label="Technical specifications"><textarea rows="2" value={form.productSpecifications} onChange={(event) => setForm({ ...form, productSpecifications: event.target.value })} /></Field></div><Field label="Custom notes"><textarea rows="2" value={form.customNotes} onChange={(event) => setForm({ ...form, customNotes: event.target.value })} /></Field><Field label="Payment terms"><input value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })} /></Field><Field label="Message"><textarea value={form.sellerMessage} onChange={(event) => setForm({ ...form, sellerMessage: event.target.value })} placeholder="Explain this revision to the buyer" /></Field><AttachmentUploader folder="quotations" value={attachments} onChange={setAttachments} />{error && <p className="action-error">{error}</p>}<button className="button button--primary button--full" disabled={busy}>{busy ? 'Saving…' : 'Submit revision'}</button></form></div>
}
