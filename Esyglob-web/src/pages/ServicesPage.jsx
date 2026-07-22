import { ArrowRight, BadgeCheck, Banknote, Boxes, Calculator, ClipboardCheck, Clock3, FileCheck2, Search, ShieldCheck, Ship } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchServiceRequests, servicesForRole } from '../api/services'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import { StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { resolveId } from '../utils/trade'

const icons = { Logistics: Ship, 'Trade Finance': Banknote, Inspection: ClipboardCheck, Protection: ShieldCheck, Verification: BadgeCheck, Advisory: FileCheck2 }

export default function ServicesPage() {
  const { user, status } = useAuth(); const authenticated = status === 'authenticated'
  const roles = user?.roles || [user?.primaryRole || 'buyer']; const [role, setRole] = useState(roles.includes('seller') && user?.primaryRole === 'seller' ? 'seller' : 'buyer')
  const [category, setCategory] = useState('All'); const [search, setSearch] = useState('')
  const activity = useAsyncData(useCallback(() => authenticated ? fetchServiceRequests({ role }) : Promise.resolve([]), [authenticated, role]))
  const catalog = servicesForRole(role); const categories = ['All', ...new Set(catalog.map((item) => item.category))]
  const visible = useMemo(() => catalog.filter((item) => (category === 'All' || item.category === category) && `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [catalog, category, search])
  const active = activity.data?.filter((item) => !['completed', 'cancelled'].includes(item.status)).length || 0
  return <AppShell><div className="container services-page"><PageHead eyebrow="End-to-end trade operations" title="Trade services" description="Book, pay for and track professional support across logistics, finance, quality, verification and compliance." />
    <Link className="service-calculator-card" to="/services/calculator"><i><Calculator /></i><div><span>Primary trade tool</span><h2>Esy Trade Calculator</h2><p>Plan landed cost, GST, customs duty, freight, currency, profit, MOQ and packaging with the same tools as the mobile app.</p></div><strong>Open calculator <ArrowRight /></strong></Link>
    {roles.includes('seller') && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Buyer services</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Seller services</button></div>}
    {authenticated && <section className="service-overview"><div><span>Available services</span><b>{catalog.length}</b></div><div><span>Active requests</span><b>{active}</b></div><div><span>Total bookings</span><b>{activity.data?.length || 0}</b></div><Link to="/services/requests">Booking history <ArrowRight /></Link></section>}
    <div className="service-toolbar"><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search logistics, finance, inspection…" /></label><div>{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
    <div className="service-catalog">{visible.map((item) => { const Icon = icons[item.category] || Boxes; return <article key={item.key}><div className="service-card-icon"><Icon /></div><span>{item.category}</span><h2>{item.title}</h2><p>{item.description}</p><ul>{item.steps.map((step) => <li key={step}><BadgeCheck /> {step}</li>)}</ul><footer><div><small>Starting at</small><b>{item.startingPrice}</b></div><Link to={`/services/${item.key}`}>View service <ArrowRight /></Link></footer></article> })}</div>
    {!visible.length && <div className="empty-results"><Search /><h2>No matching services</h2><p>Try another service name or category.</p></div>}
    {authenticated && activity.data?.length > 0 && <section className="module-panel recent-services"><div className="compact-heading"><h2><Clock3 /> Recent bookings</h2><Link to="/services/requests">View all</Link></div>{activity.data.slice(0, 4).map((item) => <Link key={resolveId(item)} to={`/services/requests/${resolveId(item)}`}><div><b>{item.serviceTitle}</b><small>{item.requestNumber} · {new Date(item.createdAt).toLocaleDateString()}</small></div><StatusBadge status={item.status} /><ArrowRight /></Link>)}</section>}
    {!authenticated && <section className="service-cta"><ShieldCheck /><div><h2>Ready to manage a trade service?</h2><p>Sign in to receive a live quote, book securely and track every milestone.</p></div><Link className="button button--primary" to="/login" state={{ from: '/services' }}>Login to continue</Link></section>}
  </div></AppShell>
}
