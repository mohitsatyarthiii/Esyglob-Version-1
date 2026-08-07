import { ArrowLeft, Check, Clock, PackageCheck, ShieldCheck, Truck } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchQuotation } from '../api/trade'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { displayName, resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

export default function QuotationComparePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const idsParam = params.get('ids') || ''
  const query = useAsyncData(useCallback(() => Promise.all(idsParam.split(',').filter(Boolean).slice(0, 4).map(fetchQuotation)), [idsParam]))
  return <AppShell><div className="listing-page container trade-page"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back to quotations</button><header className="page-head"><span className="eyebrow">Buyer decision workspace</span><h1>Compare quotations</h1><p>Compare commercial terms side by side before continuing negotiation or accepting an offer.</p></header>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : <div className="compare-grid">{query.data?.map((item) => <article key={resolveId(item)}><div className="compare-head"><StatusBadge status={item.status} /><h2>{displayName(item.sellerId, 'Supplier')}</h2><strong><Money value={item.totalPrice || item.unitPrice} currency={item.currency} /></strong><small><Money value={item.unitPrice} currency={item.currency} /> / unit</small></div><CompareRow icon={PackageCheck} label="Quantity" value={`${item.suppliedQuantity || item.quantity || '—'} ${item.unit || 'units'}`} /><CompareRow icon={PackageCheck} label="MOQ" value={item.minimumOrderQuantity || '—'} /><CompareRow icon={Clock} label="Lead time" value={`${item.leadTime || '—'} ${item.leadTimeUnit || ''}`} /><CompareRow icon={Truck} label="Incoterms" value={item.incoterms || '—'} /><CompareRow icon={Truck} label="Shipping" value={<Money value={item.shippingCost} currency={item.currency} />} /><CompareRow icon={ShieldCheck} label="Payment" value={item.paymentTerms || 'Negotiable'} /><Link className="button button--primary button--full" to={`/quotations/${resolveId(item)}`}><Check /> Review offer</Link></article>)}</div>}</div></AppShell>
}
function CompareRow({ icon: Icon, label, value }) { return <div className="compare-row"><Icon /><span><small>{label}</small><b>{value}</b></span></div> }
