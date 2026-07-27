import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Boxes, CreditCard, Gift, PackageCheck, Store, Tag, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getOverview } from '../api/client'

const metricConfig = [
  ['totalUsers', 'Total users', Users, '/users'], ['sellers', 'Sellers', Store, '/sellers'], ['manufacturers', 'Manufacturers', Store, '/sellers'],
  ['products', 'Products', Boxes, '/products'], ['orders', 'Orders', PackageCheck, '/orders'], ['payments', 'Payments', CreditCard, '/payments'],
  ['revenue', 'Revenue', TrendingUp, '/payments', true], ['pendingVerifications', 'Pending verification', BadgeCheck, '/verifications'],
  ['coupons', 'Coupons', Tag, '/coupons'], ['giftCards', 'Gift cards', Gift, '/gift-cards'],
]

export default function DashboardPage() {
  const query = useQuery({ queryKey: ['admin', 'overview'], queryFn: getOverview })
  const data = query.data || {}
  return <div className="dashboard-page"><header className="page-heading"><div><span>Operations overview</span><h1>Dashboard</h1><p>Live marketplace health, trust and commerce activity.</p></div><div><Link to="/verifications" className="primary">Review verification</Link></div></header>
    {query.isLoading ? <DashboardSkeleton /> : query.error ? <div className="dashboard-error"><b>Dashboard unavailable</b><p>{query.error.message}</p><button onClick={() => query.refetch()}>Retry</button></div> : <>
      <section className="metric-grid">{metricConfig.map(([key, label, Icon, to, monetary]) => <Link to={to} key={key}><header><span>{label}</span><Icon /></header><b>{monetary ? money(data.metrics?.[key]) : Number(data.metrics?.[key] || 0).toLocaleString()}</b><small>View details <ArrowRight /></small></Link>)}</section>
      <section className="dashboard-grid"><Panel title="Recent signups" link="/users"><div className="activity-list">{data.recentUsers?.map((user) => <Link to="/users" key={user._id}><Avatar value={user.fullName || user.email} /><span><b>{user.fullName || user.email}</b><small>{user.roles?.join(', ')} · {date(user.createdAt)}</small></span><em className={`status status--${user.isActive ? 'active' : 'inactive'}`}>{user.isActive ? 'active' : 'inactive'}</em></Link>)}</div></Panel>
        <Panel title="Recent orders" link="/orders"><div className="activity-list">{data.recentOrders?.map((order) => <Link to="/orders" key={order._id}><Avatar value={order.orderNumber} /><span><b>{order.orderNumber}</b><small>{order.buyerId?.fullName || 'Buyer'} → {order.sellerId?.companyName || 'Seller'}</small></span><div><strong>{money(order.totalAmount || order.grandTotal, order.currency)}</strong><em className={`status status--${order.status}`}>{order.status}</em></div></Link>)}</div></Panel>
        <Panel title="Pending reviews" link="/verifications"><div className="activity-list">{data.pendingReviews?.map((item) => <Link to="/verifications" key={item._id}><Avatar value={item.sellerId?.companyName} /><span><b>{item.sellerId?.companyName || 'Seller application'}</b><small>{item.documents?.length || 0} documents · {date(item.updatedAt)}</small></span><em className={`status status--${item.status}`}>{item.status?.replaceAll('_', ' ')}</em></Link>)}</div></Panel>
        <Panel title="Quick actions"><div className="quick-actions"><Link to="/verifications"><BadgeCheck />Review seller applications<ArrowRight /></Link><Link to="/products"><Boxes />Moderate products<ArrowRight /></Link><Link to="/coupons"><Tag />Manage campaigns<ArrowRight /></Link><Link to="/orders"><PackageCheck />Review trade orders<ArrowRight /></Link></div></Panel></section>
    </>}
  </div>
}

function Panel({ title, link, children }) { return <section className="dashboard-panel"><header><h2>{title}</h2>{link && <Link to={link}>View all <ArrowRight /></Link>}</header>{children}</section> }
function Avatar({ value }) { return <i className="activity-avatar">{String(value || '?').slice(0, 1).toUpperCase()}</i> }
function date(value) { return value ? new Date(value).toLocaleDateString([], { dateStyle: 'medium' }) : '—' }
function money(value, currency = 'INR') { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(Number(value || 0)) }
function DashboardSkeleton() { return <div className="dashboard-skeleton">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div> }
