import { ArrowRight, GitCompareArrows, Search } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchQuotations } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import { displayName, resolveId } from '../utils/trade'
import useAsyncData from '../hooks/useAsyncData'
import { PageHead } from '../components/PageHead'
import { TradeSkeleton } from './RfqsPage'

const statuses = ['all', 'pending', 'negotiating', 'countered', 'revision_requested', 'revised', 'accepted', 'rejected', 'converted', 'lost']
export default function QuotationsPage() {
  const { user } = useAuth()
  const roles = user?.roles || ['buyer']
  const [params, setParams] = useSearchParams()
  const role = roles.includes('seller') && params.get('role') === 'seller' ? 'seller' : 'buyer'
  const status = params.get('status') || 'all'
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const query = useAsyncData(useCallback(() => fetchQuotations({ scope: role, status: status === 'all' ? undefined : status }), [role, status]))
  const rows = (query.data?.quotations || []).filter((item) => !search || [item.title, item.rfqId?.title, item.sellerId?.companyName].some((value) => String(value || '').toLowerCase().includes(search.toLowerCase())))
  const set = (key, value) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next) }
  function toggle(id) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current) }
  return <AppShell><div className="listing-page container trade-page"><PageHead eyebrow={role === 'seller' ? 'Seller quotation desk' : 'Buyer offer management'} title="Quotations" description={role === 'seller' ? 'Track submitted offers, buyer responses and revision requests.' : 'Review, compare and negotiate offers received for your RFQs.'} /><div className="trade-page-actions">{roles.includes('seller') && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => set('role', 'buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => set('role', 'seller')}>Seller</button></div>}<Link className="button button--secondary" to={`/rfqs?role=${role}`}>View RFQs</Link>{role === 'buyer' && selected.length > 1 && <Link className="button button--primary" to={`/quotations/compare?ids=${selected.join(',')}`}><GitCompareArrows /> Compare {selected.length}</Link>}</div><div className="trade-toolbar"><label><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotations" /></label><label>Status<select value={status} onChange={(e) => set('status', e.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : rows.length ? <div className="quotation-list">{rows.map((item) => { const id = resolveId(item); const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}; return <article key={id}><div className="quotation-list__check">{role === 'buyer' && <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} aria-label="Select for comparison" />}</div><div><span className="eyebrow">{item.quotationNumber || displayName(item.sellerId, 'Quotation')}</span><h2><Link to={`/quotations/${id}?role=${role}`}>{item.title || rfq.title || item.productId?.name || 'Quotation'}</Link></h2><p>{role === 'seller' ? `Buyer RFQ: ${rfq.title || 'Request'}` : `From ${displayName(item.sellerId, 'Supplier')}`}</p></div><div className="quotation-list__price"><b><Money value={item.totalPrice || item.unitPrice} currency={item.currency} /></b><small>{item.unitPrice && <><Money value={item.unitPrice} currency={item.currency} /> / unit</>}</small></div><div><StatusBadge status={item.status || 'pending'} /><Link to={`/quotations/${id}?role=${role}`}>Review <ArrowRight /></Link></div></article>})}</div> : <div className="empty-results"><GitCompareArrows /><h2>No quotations found</h2><p>{role === 'seller' ? 'Respond to an eligible RFQ to create your first quotation.' : 'Supplier quotations will appear here after sellers respond.'}</p></div>}</div></AppShell>
}
