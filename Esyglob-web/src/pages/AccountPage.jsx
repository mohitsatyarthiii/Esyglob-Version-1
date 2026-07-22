import { BarChart3, Bell, Bot, Boxes, CheckCircle2, ChevronRight, CircleUserRound, CreditCard, FileSignature, FileText, Heart, HelpCircle, LockKeyhole, LogOut, MapPin, MessageSquare, PackageCheck, Plus, Settings, ShieldCheck, Store, Target, Truck, WalletCards } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAccountSummary } from '../api/marketplace'
import { fetchChats, fetchQuotations, fetchRfqs } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import useAsyncData from '../hooks/useAsyncData'
import { CURRENCIES, useCurrency } from '../preferences/currency-context'
import { TradeSkeleton } from './RfqsPage'

const buyerSections = [
  { title: 'My Orders', items: [
    ['All Orders', '/orders', PackageCheck, 'violet'], ['Pending', '/orders?status=pending', Bell, 'amber'], ['Shipped', '/orders?status=shipped', Truck, 'sky'], ['Completed', '/orders?status=completed', CheckCircle2, 'green'],
  ] },
  { title: 'Buying Services', items: [
    ['My RFQs', '/rfqs', Target, 'amber', 'rfqs'], ['Quotations', '/quotations', FileText, 'green', 'quotations'], ['Agreements', '/agreements?role=buyer', FileSignature, 'violet'], ['Wallet', '/wallet', WalletCards, 'green'], ['Saved Items', '/saved', Heart, 'rose'], ['Addresses', '/addresses', MapPin, 'sky'],
  ] },
  { title: 'Tools & Insights', items: [
    ['AI Sourcing', '/ai-chat', Bot, 'violet'], ['Market Insights', '/market-insights', BarChart3, 'violet'], ['Find Manufacturers', '/sellers', Store, 'green'], ['Messages', '/messages', MessageSquare, 'sky', 'messages'],
  ] },
]

const sellerSections = [
  { title: 'Store Management', items: [
    ['Profile', '/profile', CircleUserRound, 'sky'], ['Products', '/seller/products', Boxes, 'violet'], ['Order Queue', '/seller/order-queue', Target, 'amber'], ['Orders', '/orders?role=seller', PackageCheck, 'green'], ['Store Settings', '/settings', Settings, 'rose'],
  ] },
  { title: 'Sales Services', items: [
    ['RFQs', '/rfqs?role=seller', Target, 'amber', 'rfqs'], ['Quotations', '/quotations?role=seller', FileText, 'green', 'quotations'], ['Agreements', '/agreements?role=seller', FileSignature, 'violet'], ['Wallet', '/wallet?role=seller', WalletCards, 'green'], ['Verification', '/seller/verification', ShieldCheck, 'sky'], ['Factory', '/seller/factory', Store, 'green'], ['Membership', '/subscriptions', CreditCard, 'violet'],
  ] },
  { title: 'Analytics & Tools', items: [
    ['Analytics', '/market-insights', BarChart3, 'violet'], ['AI Assistant', '/ai-chat', Bot, 'violet'], ['Messages', '/messages?role=seller', MessageSquare, 'sky', 'messages'], ['Support', '/services', HelpCircle, 'rose'],
  ] },
]

export default function AccountPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const roles = user?.roles || [user?.primaryRole || 'buyer']
  const canSell = roles.includes('seller')
  const [role, setRole] = useState(canSell && user?.primaryRole === 'seller' ? 'seller' : 'buyer')
  const { selectedCurrency, setCurrency } = useCurrency()
  const query = useAsyncData(useCallback(async () => {
    const [summary, rfqs, quotations, chats] = await Promise.all([
      fetchAccountSummary(role), fetchRfqs({ scope: role, limit: 1 }), fetchQuotations({ scope: role, limit: 1 }), fetchChats({ role, limit: 60 }),
    ])
    return { summary, rfqs, quotations, chats }
  }, [role]))
  const [profileResult, ordersResult, , , sellerResult] = query.data?.summary || []
  const profile = profileResult?.profile || profileResult || {}
  const orders = ordersResult?.orders || ordersResult?.items || []
  const name = profile.fullName || user?.name || user?.fullName || user?.email || 'EsyGlob member'
  const image = profile.avatarUrl || user?.avatarUrl || user?.profileImage || ''
  const badges = useMemo(() => ({
    rfqs: query.data?.rfqs?.pagination?.total || query.data?.rfqs?.rfqs?.length || 0,
    quotations: query.data?.quotations?.pagination?.total || query.data?.quotations?.quotations?.length || 0,
    messages: (query.data?.chats || []).reduce((total, chat) => total + Number(role === 'seller' ? chat.sellerUnreadCount : chat.buyerUnreadCount), 0),
  }), [query.data, role])
  const sections = role === 'seller' ? sellerSections : buyerSections
  const verification = sellerResult?.seller || sellerResult || {}
  const verificationComplete = verification.isVerified || verification.verificationStatus === 'verified'
  const verificationPercent = verificationComplete ? 100 : Number(verification.completionPercentage || verification.profileCompletion || 0)

  async function logout() { await signOut(); navigate('/home') }

  return <AppShell><div className="container mobile-account-page"><header className="mobile-account-title"><h1>{role === 'seller' ? 'EsyGlob Seller Account' : 'EsyGlob Buyer Account'}</h1></header><Link className="mobile-account-profile" to="/profile"><span className="mobile-account-avatar">{image ? <img src={image} alt="" /> : name.slice(0, 1).toUpperCase()}</span><span><b>{name}</b><small>{profile.email || user?.email}</small></span><ChevronRight /></Link>{canSell && <div className="role-switch mobile-account-role"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Seller</button></div>}{role === 'seller' && <Link to="/dashboard?role=seller" className={`seller-verification-card ${verificationComplete ? 'complete' : ''}`}><i><ShieldCheck /></i><span><b>{verificationComplete ? 'Verification Completed' : 'Seller verification'}</b><small>Trust {verification.trustScore || 0}/100 · {verificationComplete ? 'Verified seller' : `${Math.max(0, 100 - verificationPercent)}% remaining`}</small>{!verificationComplete && <em><i style={{ width: `${Math.min(100, verificationPercent)}%` }} /></em>}</span><ChevronRight /></Link>}<section className="mobile-account-quick">{[[CreditCard, 'Add Card', '/wallet', 'orange'], [MapPin, 'Address', '/addresses', 'green'], [Truck, 'Orders', role === 'seller' ? '/orders?role=seller' : '/orders', 'sky']].map(([Icon, label, to, color]) => <Link to={to} key={label}><i className={color}><Icon /></i><span>{label}</span></Link>)}</section>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : <><section className="mobile-account-preference"><header><CreditCard /><h2>Preferred Currency</h2></header><p>All prices will be displayed in your selected currency.</p><select value={selectedCurrency} onChange={(event) => setCurrency(event.target.value)}>{CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></section><Link className="mobile-account-location" to="/location"><i><MapPin /></i><span><b>My Location</b><small>Set location for nearby suppliers and accurate shipping.</small></span><ChevronRight /></Link><div className="mobile-account-sections">{sections.map((section) => <section key={section.title}><h2>{section.title}</h2><div>{section.items.map(([label, to, Icon, color, badge]) => <Link to={to} key={label}><i className={color}><Icon />{badges[badge] > 0 && <b>{badges[badge]}</b>}</i><span>{label}</span></Link>)}</div></section>)}</div><Link className="mobile-account-addresses" to="/addresses"><header><h2>Saved Addresses</h2><span><Plus /> Add New</span></header><div><i><MapPin /></i><span><b>Manage your delivery addresses</b><small>Add, edit, or remove shipping addresses.</small></span><ChevronRight /></div></Link><section className="mobile-account-bottom-actions"><Link to="/settings"><Settings /><span>Settings</span><ChevronRight /></Link><Link to="/security"><LockKeyhole /><span>Security & Privacy</span><ChevronRight /></Link><a href="mailto:support@esyglob.com"><HelpCircle /><span>Help & Support</span><ChevronRight /></a></section>{orders.length > 0 && <p className="mobile-account-footnote">Your latest order: <Link to={`/orders/${orders[0]._id || orders[0].id}`}>{orders[0].orderNumber || 'View order'}</Link></p>}</>}<button className="mobile-account-logout" onClick={logout}><LogOut /> Sign out</button></div></AppShell>
}
