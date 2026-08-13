import { Calendar, FileText, MapPin, PackageCheck, Send, ShieldCheck } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRfq } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import RfqDetailsPage from './RfqDetailsPage'
import { TradeSkeleton } from './RfqsPage'

export default function RfqRoutePage() {
  const { status } = useAuth()
  return status === 'authenticated' ? <RfqDetailsPage /> : <PublicRfqDetail />
}

function PublicRfqDetail() {
  const { rfqId } = useParams()
  const query = useAsyncData(useCallback(() => fetchRfq(rfqId), [rfqId]))
  if (query.loading) return <AppShell><div className="detail-page container"><TradeSkeleton /></div></AppShell>
  if (query.error || !query.data?.rfq) return <AppShell><div className="detail-page container"><p className="inline-error">{query.error?.message || 'Public RFQ not found.'}</p></div></AppShell>
  const rfq = query.data.rfq
  const attachments = [...(rfq.attachments || []), ...(rfq.images || []), ...(rfq.documents || [])]
  return <AppShell><main className="detail-page container trade-page">
    <Link className="back-link" to="/rfqs">Back to public RFQs</Link>
    <section className="rfq-detail-hero">
      <div><div className="trade-heading-line"><span className="eyebrow">Public RFQ opportunity</span><StatusBadge status={rfq.status} /></div><h1>{rfq.title}</h1><p>{rfq.description}</p><div className="rfq-meta"><span><Calendar /> Posted {new Date(rfq.createdAt).toLocaleDateString()}</span><span><MapPin /> {rfq.deliveryCountry}</span><span><ShieldCheck /> {rfq.isVerifiedSuppliersOnly ? 'Verified manufacturers only' : 'Open to eligible manufacturers'}</span></div></div>
      <div className="rfq-detail-actions"><Link className="button button--primary" to="/login" state={{ from: `/rfqs/${rfqId}`, notice: 'Sign in as a manufacturer to submit a quotation.' }}><Send /> Sign in to submit quotation</Link></div>
    </section>
    <div className="detail-columns"><div>
      <section className="detail-card"><h2>Buyer requirements</h2><dl className="trade-detail-grid"><div><dt>Category</dt><dd>{rfq.category}{rfq.subcategory ? ` / ${rfq.subcategory}` : ''}</dd></div><div><dt>Quantity</dt><dd>{rfq.quantity} {rfq.unit}</dd></div><div><dt>Target price</dt><dd><Money value={rfq.targetPrice} currency={rfq.currency} /></dd></div><div><dt>Destination</dt><dd>{rfq.deliveryCountry}</dd></div><div><dt>Delivery timeline</dt><dd>{String(rfq.deliveryTimeline || '').replaceAll('_', ' ')}</dd></div><div><dt>Incoterms</dt><dd>{rfq.incoterms || 'To be agreed'}</dd></div><div><dt>Closing date</dt><dd>{rfq.expiresAt ? new Date(rfq.expiresAt).toLocaleDateString() : 'Open'}</dd></div><div><dt>Quotations</dt><dd>{rfq.quotationCount || 0}</dd></div></dl>{rfq.specifications && <div className="requirement-copy"><h3>Specifications</h3><p>{rfq.specifications}</p></div>}</section>
      {!!rfq.items?.length && <section className="detail-card"><h2>Requested items</h2><div className="line-item-list">{rfq.items.map((item, index) => <article key={item._id || index}><PackageCheck /><div><b>{item.name || `Item ${index + 1}`}</b><p>{item.specifications}</p></div><span>{item.quantity} {item.unit}</span></article>)}</div></section>}
      {!!attachments.length && <section className="detail-card"><h2>Public attachments</h2><div className="attachment-list">{attachments.map((file, index) => <a href={file.url || file} target="_blank" rel="noreferrer" key={file.url || index}><FileText /> {file.filename || `Attachment ${index + 1}`}</a>)}</div></section>}
    </div><aside className="detail-card"><h2>Respond to this RFQ</h2><p>Sign in with an eligible manufacturer account to submit pricing, MOQ, available quantity, lead time, shipping terms, validity and commercial notes. Your quotation will be linked to the RFQ and negotiation chat.</p></aside></div>
  </main></AppShell>
}
