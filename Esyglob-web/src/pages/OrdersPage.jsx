import { ArrowRight, PackageCheck, Search, Truck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrders } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import { displayName, resolveId } from '../utils/trade'
import useAsyncData from '../hooks/useAsyncData'
import { PageHead } from '../components/PageHead'
import { TradeSkeleton } from './RfqsPage'

export default function OrdersPage() {
  const { user } = useAuth(); const roles = user?.roles || ['buyer']; const [params, setParams] = useSearchParams(); const role = roles.includes('seller') && params.get('role') === 'seller' ? 'seller' : 'buyer'; const status = params.get('status') || ''; const [search, setSearch] = useState('')
  const query = useAsyncData(useCallback(() => fetchOrders({ type: role, status: status || undefined, q: search || undefined }), [role, search, status]))
  return <AppShell><div className="listing-page container trade-page"><PageHead eyebrow="Trade execution" title="Orders" description="Orders created from accepted quotations, with payment and fulfillment status." /><div className="trade-page-actions">{roles.includes('seller') && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setParams({ role: 'buyer' })}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setParams({ role: 'seller' })}>Seller</button></div>}</div><div className="trade-toolbar"><label><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders" /></label><label>Status<select value={status} onChange={(e) => { const next = new URLSearchParams(params); e.target.value ? next.set('status', e.target.value) : next.delete('status'); setParams(next) }}><option value="">All</option>{['pending','confirmed','processing','shipped','delivered','completed','cancelled'].map((item) => <option key={item}>{item}</option>)}</select></label></div>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : query.data?.length ? <div className="order-list">{query.data.map((item) => <article key={resolveId(item)}><i>{item.status === 'shipped' ? <Truck /> : <PackageCheck />}</i><div><span className="eyebrow">{item.orderNumber || 'Trade order'}</span><h2>{item.productId?.name || item.products?.[0]?.name || item.rfqId?.title || 'Marketplace order'}</h2><p>{role === 'seller' ? `Buyer: ${displayName(item.buyerId)}` : `Seller: ${displayName(item.sellerId)}`}</p></div><div><b><Money value={item.totalAmount} currency={item.currency} /></b><StatusBadge status={item.status || 'pending'} /></div><Link to={`/orders/${resolveId(item)}`}>View order <ArrowRight /></Link></article>)}</div> : <div className="empty-results"><PackageCheck /><h2>No orders found</h2><p>Accepted quotations create trade orders automatically.</p></div>}</div></AppShell>
}
