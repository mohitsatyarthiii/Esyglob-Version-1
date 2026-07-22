import { Archive, ArrowRight, Filter, Plus, Search } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchRfqs } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { PageHead } from '../components/PageHead'

const filters = ['all', 'active', 'draft', 'quoted', 'negotiating', 'converted', 'closed', 'archived']

export default function RfqsPage() {
  const { user } = useAuth()
  const roles = user?.roles || ['buyer']
  const [params, setParams] = useSearchParams()
  const role = roles.includes('seller') && params.get('role') === 'seller' ? 'seller' : 'buyer'
  const status = params.get('status') || 'all'
  const q = params.get('q') || ''
  const [search, setSearch] = useState(q)
  const loader = useCallback(() => fetchRfqs({ scope: role, status: status === 'all' ? undefined : status, q, sort: 'createdAt', order: 'desc' }), [q, role, status])
  const query = useAsyncData(loader)
  const rows = query.data?.rfqs || []
  const heading = role === 'seller' ? 'Available RFQs' : 'My RFQs'
  const set = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next) }
  return <AppShell><div className="listing-page container trade-page"><PageHead eyebrow={role === 'seller' ? 'Seller opportunities' : 'Buyer sourcing'} title={heading} description={role === 'seller' ? 'Review relevant public requirements and respond with a quotation.' : 'Create, track and manage sourcing requirements and seller responses.'} /><div className="trade-page-actions">{roles.includes('seller') && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => set('role', 'buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => set('role', 'seller')}>Seller</button></div>}{role === 'buyer' && <Link className="button button--primary" to="/rfqs/new"><Plus /> Create RFQ</Link>}<Link className="button button--secondary" to={`/quotations?role=${role}`}>Quotations <ArrowRight /></Link></div><div className="trade-toolbar"><form onSubmit={(e) => { e.preventDefault(); set('q', search.trim()) }}><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search RFQs" /><button>Search</button></form><label><Filter /> Status<select value={status} onChange={(e) => set('status', e.target.value)}>{filters.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label></div><div className="filter-chips">{filters.slice(0, 7).map((item) => <button className={status === item ? 'active' : ''} key={item} onClick={() => set('status', item)}>{item}</button>)}</div>{query.loading ? <TradeSkeleton count={5} /> : query.error ? <div className="inline-error">{query.error.message}</div> : rows.length ? <div className="rfq-list">{rows.map((item) => <RfqCard key={item._id || item.id} item={item} sellerView={role === 'seller'} />)}</div> : <div className="empty-results"><Archive /><h2>No RFQs found</h2><p>{role === 'seller' ? 'New matching buyer requirements will appear here.' : 'Create an RFQ to start receiving supplier quotations.'}</p></div>}</div></AppShell>
}

export function RfqCard({ item, sellerView }) {
  const id = item._id || item.id
  const deadline = item.deadline || item.expiresAt
  const path = `/rfqs/${id}${sellerView ? '?role=seller' : ''}`
  return <article className="rfq-card"><div className="rfq-card__top"><div><span className="eyebrow">{item.rfqNumber || item.category || 'Request for quotation'}</span><h2><Link to={path}>{item.title || item.productName || 'RFQ'}</Link></h2></div><StatusBadge status={item.status || 'active'} /></div><p>{item.description || item.specifications || 'Buyer requirements available in RFQ details.'}</p><div className="rfq-card__facts"><span><small>Quantity</small><b>{item.quantity || '—'} {item.unit || 'units'}</b></span><span><small>Target</small><b><Money value={item.targetPrice} currency={item.currency} /></b></span><span><small>Destination</small><b>{item.deliveryCountry || item.destinationCountry || '—'}</b></span><span><small>{deadline ? 'Deadline' : 'Submitted'}</small><b>{new Date(deadline || item.createdAt).toLocaleDateString()}</b></span></div><div className="rfq-card__footer"><span>{item.quotationCount || 0} quotation{Number(item.quotationCount) === 1 ? '' : 's'}</span><Link to={path}>{sellerView ? 'Review and quote' : 'View responses'} <ArrowRight /></Link></div></article>
}

export function TradeSkeleton({ count = 4 }) { return <div className="trade-skeletons">{Array.from({ length: count }, (_, i) => <div key={i}><i /><span /><span /></div>)}</div> }
