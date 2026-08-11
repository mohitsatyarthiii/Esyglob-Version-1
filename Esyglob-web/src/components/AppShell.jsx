import { Bell, BriefcaseBusiness, ChevronDown, CreditCard, Grid2X2, Heart, Home, LayoutDashboard, LogOut, MapPin, Menu, MessageSquare, Settings, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import Brand from './Brand'
import { fetchAddresses, fetchProfile } from '../api/account'
import { fetchUnreadNotificationCount } from '../api/trade'
import { fetchChats } from '../api/trade'
import BackButton from './BackButton'
import { getRealtimeClient } from '../realtime/socket'
import TradeWorkspaceDock from './TradeWorkspaceDock'
import MarketplaceSearch from './MarketplaceSearch'
import { detectCurrentAddress } from '../utils/current-address'

export default function AppShell({ children }) {
  const { user, status, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const accountRef = useRef(null)
  const [region, setRegion] = useState('Select address')
  const authenticated = status === 'authenticated'
  const sellerAccount = user?.primaryRole === 'seller'
  const chatDetail = /^\/messages\/[^/]+\/?$/.test(location.pathname)
  const aiChat = /^\/ai-chat\/?$/.test(location.pathname)
  const immersive = chatDetail || aiChat
  const accountName = profile?.fullName || profile?.name || user?.fullName || user?.name || 'My EsyGlob'
  const accountImage = profile?.avatarUrl || profile?.profileImage || profile?.avatar || profile?.image || user?.avatarUrl || user?.profileImage || user?.avatar || ''
  const authPath = (path) => authenticated ? path : '/login'
  const syncAddress = useCallback(async () => {
    if (!authenticated) return setRegion('Select address')
    const addresses = await fetchAddresses().catch(() => [])
    const selected = addresses.find(item => item.isDefault) || addresses[0]
    setRegion(selected ? [selected.addressLabel, selected.city || selected.state || selected.country].filter(Boolean).join(' · ') : 'Select address')
  }, [authenticated])
  useEffect(() => {
    const initialSync = window.setTimeout(syncAddress, 0)
    const sync = () => syncAddress()
    window.addEventListener('esyglob-address-change', sync)
    return () => {
      window.clearTimeout(initialSync)
      window.removeEventListener('esyglob-address-change', sync)
    }
  }, [syncAddress])
  useEffect(() => {
    if (!authenticated || !navigator.permissions?.query || !navigator.geolocation) return
    const key = `esyglob.gps-address.${user?._id || user?.id || user?.email || 'session'}`
    if (sessionStorage.getItem(key)) return
    navigator.permissions.query({ name: 'geolocation' }).then(permission => {
      if (permission.state !== 'granted') return
      sessionStorage.setItem(key, 'attempted')
      detectCurrentAddress({ persist: true }).then(syncAddress).catch(() => undefined)
    }).catch(() => undefined)
  }, [authenticated, syncAddress, user?._id, user?.id, user?.email])
  useEffect(() => {
    if (!authenticated) return
    let live = true
    const role = user?.primaryRole === 'seller' ? 'seller' : 'buyer'
    Promise.allSettled([fetchProfile(), fetchUnreadNotificationCount(), fetchChats({ role, limit: 60 })]).then(([profileResult, notificationResult, chatResult]) => {
      if (!live) return
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      if (notificationResult.status === 'fulfilled') setUnreadNotifications(notificationResult.value)
      if (chatResult.status === 'fulfilled') setUnreadMessages(chatResult.value.reduce((total, chat) => total + Number(role === 'seller' ? chat.sellerUnreadCount : chat.buyerUnreadCount), 0))
    })
    return () => { live = false }
  }, [authenticated, location.pathname, user?.primaryRole])
  useEffect(() => {
    if (!authenticated) return
    let socket
    const onNotification = () => setUnreadNotifications((count) => count + 1)
    getRealtimeClient().then((client) => { socket = client; client.on('new_notification', onNotification) }).catch(() => {})
    return () => { if (socket) socket.off('new_notification', onNotification) }
  }, [authenticated])
  useEffect(() => {
    const closeAccount = (event) => { if (!accountRef.current?.contains(event.target)) setAccountOpen(false) }
    document.addEventListener('pointerdown', closeAccount)
    return () => { document.removeEventListener('pointerdown', closeAccount) }
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate('/home', { replace: true })
  }

  const handleAccountTrigger = () => {
    if (window.matchMedia('(max-width: 760px)').matches) navigate('/profile')
    else setAccountOpen(value => !value)
  }

  const close = () => setMenuOpen(false)
  const handleBackCapture = (event) => {
    const control = event.target.closest?.('.back-link')
    if (!control || location.key === 'default' || window.history.length <= 1) return
    event.preventDefault()
    event.stopPropagation()
    navigate(-1)
  }
  return <div className={`site-shell ${chatDetail ? 'site-shell--chat-detail' : ''} ${aiChat ? 'site-shell--ai-chat' : ''}`}>
    <div className="utility-bar"><div className="container utility-bar__inner"><span>Global B2B sourcing, simplified.</span><div><span>Buyer protection</span><span>Verified suppliers</span><span>24/7 trade support</span></div></div></div>
    <header className="site-header">
      <div className="container site-header__main">
        <button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
        <Link to="/home" className="brand-link"><Brand compact asLink={false} /></Link>
        <MarketplaceSearch />
        <div className="header-actions">
          {authenticated ? <>
            <Link className="header-region" to="/addresses"><MapPin /><span>{region}</span></Link>
            <Link className="icon-button notification-button header-messages" to="/messages" aria-label={`${unreadMessages} unread messages`}><MessageSquare />{unreadMessages > 0 && <b>{unreadMessages > 99 ? '99+' : unreadMessages}</b>}</Link>
            <Link className="icon-button" to="/saved" aria-label="Saved items"><Heart /></Link>
            <Link className="icon-button notification-button" to="/notifications" aria-label={`${unreadNotifications} unread notifications`}><Bell />{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? '99+' : unreadNotifications}</b>}</Link>
            <div className={`account-menu ${accountOpen ? 'open' : ''}`} ref={accountRef}><button className="account-menu__trigger" onClick={handleAccountTrigger} aria-expanded={accountOpen}><span className="avatar">{accountImage ? <img src={accountImage} alt="" /> : accountName.slice(0, 1).toUpperCase()}</span><span className="account-menu__copy"><small>{sellerAccount ? 'Seller workspace' : 'Welcome back'}</small><b>{accountName}</b></span><ChevronDown size={16} /></button>{accountOpen && <div className="account-dropdown"><div><span className="avatar">{accountImage ? <img src={accountImage} alt="" /> : accountName.slice(0, 1).toUpperCase()}</span><span><b>{accountName}</b><small>{profile?.email || user?.email}</small></span></div><Link to="/profile" onClick={() => setAccountOpen(false)}><UserRound /> Profile</Link><Link to="/account" onClick={() => setAccountOpen(false)}><LayoutDashboard /> {sellerAccount ? 'Seller account' : 'Account'}</Link>{sellerAccount && <Link to="/seller/business-profile" onClick={() => setAccountOpen(false)}><BriefcaseBusiness /> Business profile</Link>}{sellerAccount && <Link to="/subscriptions" onClick={() => setAccountOpen(false)}><CreditCard /> Subscription</Link>}<Link to="/saved" onClick={() => setAccountOpen(false)}><Heart /> Saved items</Link><Link to="/settings" onClick={() => setAccountOpen(false)}><Settings /> Settings</Link><button onClick={handleSignOut}><LogOut /> Sign out</button></div>}</div>
          </> : <div className="guest-actions"><Link to="/login" state={{ from: location.pathname }}>Login</Link><Link className="button button--primary" to="/signup">Sign up</Link></div>}
        </div>
      </div>
      <nav className="desktop-nav"><div className="container desktop-nav__inner">
        {sellerAccount ? <>
          <NavLink to="/dashboard">Seller dashboard</NavLink><NavLink to="/seller/products">Products</NavLink><NavLink to="/orders?role=seller">Orders</NavLink><NavLink to="/rfqs?role=seller">Enquiries & RFQs</NavLink><NavLink to="/messages">Messages</NavLink><NavLink to="/seller/business-profile">Business profile</NavLink><NavLink to="/subscriptions">Subscription</NavLink><NavLink to="/saved">Saved</NavLink><NavLink to="/settings">Settings</NavLink>
        </> : <>
          <NavLink to="/home">Marketplace</NavLink><NavLink to="/categories">Categories</NavLink><NavLink to="/products">Products</NavLink><NavLink to="/sellers">Manufacturers</NavLink><NavLink to="/explore">Explore</NavLink><NavLink to="/services">Trade services</NavLink>{authenticated && <><NavLink to="/rfqs">RFQs</NavLink><NavLink to="/market-insights">Insights</NavLink><NavLink to="/ai-chat">AI sourcing</NavLink></>}<span className="nav-spacer" /><button onClick={() => navigate(authenticated ? '/rfqs/new' : '/login', { state: { from: '/rfqs/new' } })}><BriefcaseBusiness size={17} /> Post a buying request</button>
        </>}
      </div></nav>
    </header>

    {menuOpen && <div className="drawer-backdrop" onMouseDown={close}><aside className="mobile-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-head"><Brand compact /><button className="icon-button" onClick={close}><X /></button></div>
      {authenticated ? <div className="drawer-user"><span className="avatar">{accountImage ? <img src={accountImage} alt="" /> : accountName.slice(0, 1)}</span><div><b>{accountName}</b><small>{profile?.email || user?.email}</small></div></div> : <div className="drawer-auth"><Link to="/login" onClick={close}>Login</Link><Link to="/signup" onClick={close}>Create account</Link></div>}
      {sellerAccount ? <>
        <NavLink to="/dashboard" onClick={close}>Seller dashboard</NavLink><NavLink to="/seller/products" onClick={close}>Products</NavLink><NavLink to="/seller/order-queue" onClick={close}>Orders</NavLink><NavLink to="/rfqs?role=seller" onClick={close}>Enquiries & RFQs</NavLink><NavLink to="/quotations?role=seller" onClick={close}>Quotations</NavLink><NavLink to="/messages" onClick={close}>Messages</NavLink><NavLink to="/seller/business-profile" onClick={close}>Business profile & verification</NavLink><NavLink to="/subscriptions" onClick={close}>Subscription</NavLink><NavLink to="/settings" onClick={close}>Settings</NavLink><NavLink to="/saved" onClick={close}>Saved</NavLink>
      </> : <>
        <NavLink to="/home" onClick={close}>Marketplace home</NavLink><NavLink to="/categories" onClick={close}>Categories</NavLink><NavLink to="/products" onClick={close}>Products</NavLink><NavLink to="/sellers" onClick={close}>Manufacturers</NavLink><NavLink to="/explore" onClick={close}>Explore</NavLink><NavLink to="/services" onClick={close}>Trade services</NavLink>{authenticated && <><NavLink to="/services/requests" onClick={close}>Service bookings</NavLink><NavLink to="/dashboard" onClick={close}>Dashboard</NavLink><NavLink to="/rfqs" onClick={close}>RFQs</NavLink><NavLink to="/quotations" onClick={close}>Quotations</NavLink><NavLink to="/messages" onClick={close}>Messages</NavLink><NavLink to="/market-insights" onClick={close}>Market insights</NavLink><NavLink to="/ai-chat" onClick={close}>AI sourcing</NavLink><NavLink to="/invoices" onClick={close}>Invoices</NavLink><NavLink to="/documents" onClick={close}>Documents</NavLink><NavLink to="/saved" onClick={close}>Saved items</NavLink><NavLink to="/wallet" onClick={close}>Wallet</NavLink><NavLink to="/addresses" onClick={close}>Addresses</NavLink><NavLink to="/notifications" onClick={close}>Notifications</NavLink></>}
      </>}
      {authenticated && <button className="drawer-signout" onClick={handleSignOut}><LogOut size={18} /> Sign out</button>}
    </aside></div>}

    <main onClickCapture={handleBackCapture}><GlobalBackNavigation pathname={location.pathname} />{children}</main>
    {authenticated && !immersive && <TradeWorkspaceDock />}
    {!immersive && <nav className="mobile-tabbar" aria-label="Mobile navigation">
      {sellerAccount ? <><NavLink to="/dashboard"><LayoutDashboard /><span>Dashboard</span></NavLink><NavLink to="/seller/products"><Grid2X2 /><span>Products</span></NavLink><NavLink to="/seller/order-queue"><BriefcaseBusiness /><span>Orders</span></NavLink><NavLink to="/messages"><MessageSquare /><span>Messages</span></NavLink><NavLink to="/account"><UserRound /><span>Account</span></NavLink></> : <><NavLink to="/home"><Home /><span>Home</span></NavLink><NavLink to="/categories"><Grid2X2 /><span>Categories</span></NavLink><NavLink to="/services"><BriefcaseBusiness /><span>Services</span></NavLink><NavLink to={authPath('/messages')} state={authenticated ? undefined : { from: '/messages' }}><MessageSquare /><span>Messages</span></NavLink><NavLink to={authPath('/account')} state={authenticated ? undefined : { from: '/account' }}><UserRound /><span>Account</span></NavLink></>}
    </nav>}
    {!immersive && <Footer authenticated={authenticated} />}
  </div>
}

function GlobalBackNavigation({ pathname }) {
  const roots = ['/home', '/categories', '/products', '/sellers', '/explore', '/services']
  const excluded = ['/', '/welcome', '/login', '/signup', '/forgot-password', '/reset-password']
  const hasLocalBack = [
    /^\/messages\/[^/]+$/,
    /^\/rfqs\/(new|[^/]+)$/,
    /^\/quotations\/(compare|[^/]+)$/,
    /^\/orders\/[^/]+$/,
    /^\/checkout$/,
    /^\/seller\/products\/(new|[^/]+\/edit)$/,
    /^\/services\/requests\/[^/]+$/,
    /^\/services\/(?!requests(?:\/|$))[^/]+(?:\/book)?$/,
    /^\/search$/,
  ].some((pattern) => pattern.test(pathname))
  if (excluded.includes(pathname) || roots.includes(pathname) || hasLocalBack) return null
  const fallback = pathname.startsWith('/categories/') ? '/categories' : pathname.startsWith('/products/') ? '/products' : pathname.startsWith('/sellers/') ? '/sellers' : pathname.startsWith('/seller/products') ? '/seller/products' : pathname.startsWith('/services') ? '/services' : '/home'
  return <div className="container global-back-nav"><BackButton fallback={fallback} /></div>
}

function Footer({ authenticated }) {
  return <footer className="site-footer"><div className="container footer-grid">
    <div><Brand inverse /><p>One trusted marketplace for global products, verified manufacturers and trade services.</p></div>
    <div><b>Source</b><Link to="/categories">Categories</Link><Link to="/products">Products</Link><Link to="/sellers">Manufacturers</Link></div>
    <div><b>Trade securely</b><span>Verified suppliers</span><span>Buyer protection</span><span>Secure payments</span></div>
    <div><b>Account</b><Link to={authenticated ? '/account' : '/login'}>{authenticated ? 'My EsyGlob' : 'Login'}</Link><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button></div>
  </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} EsyGlob. Global trade, made easier.</span><span>Privacy · Terms · Cookies</span></div></footer>
}
