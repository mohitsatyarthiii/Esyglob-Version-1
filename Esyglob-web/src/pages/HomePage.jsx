import {
  ArrowRight, BadgeCheck, Banknote, Bot, Box, Building2, Calculator, Camera,
  CheckCircle2, ClipboardCheck, Construction, Factory, FileCheck2, FileSignature,
  Globe2, GraduationCap, Grid2X2, Handshake, HeartHandshake, Leaf,
  LockKeyhole, Map, PackageCheck, PackageSearch, Quote, Search, Send, ShieldCheck,
  Shirt, Sparkles, Star, Stethoscope, Target, TrendingUp, Truck, Users, Utensils,
  Warehouse, Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  fetchCategories, fetchMarketplaceStatistics, fetchProducts, fetchReviews, fetchSellers,
} from '../api/marketplace'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import {
  CategoryBubble, ManufacturerCard, ProductCard, SafeImage, SkeletonCards,
} from '../components/MarketplaceCards'
import MarketplaceSearch from '../components/MarketplaceSearch'
import useAsyncData from '../hooks/useAsyncData'

const featuredLoader = () => fetchProducts({ limit: 10, sort: 'latest', verifiedOnly: true })
const feedLoader = () => fetchProducts({ limit: 16, sort: 'latest' })
const sellerLoader = () => fetchSellers({ limit: 8, isVerified: true, sort: 'latest' })
const reviewLoader = () => fetchReviews({ limit: 6, sort: 'latest' })
const statisticsLoader = () => fetchMarketplaceStatistics()

const advantages = [
  [BadgeCheck, 'Verified global suppliers', 'Business, identity and factory evidence helps buyers source with confidence.'],
  [Bot, 'AI product discovery', 'Search, compare and understand sourcing options with marketplace-aware AI.'],
  [ShieldCheck, 'Secure trade workflow', 'Every commercial milestone remains traceable from RFQ through delivery.'],
  [ClipboardCheck, 'Smart RFQ & quotations', 'Structured requirements, revisions and quotation history keep negotiations clear.'],
  [FileSignature, 'Digital agreements', 'Final commercial terms and both signatures stay together in a live record.'],
  [Warehouse, 'Unified Trade Workspace', 'Messages, documents, payments, logistics and activity live in one place.'],
  [Truck, 'Global logistics support', 'Plan landed costs, shipment options and fulfillment without losing trade context.'],
  [LockKeyhole, 'Secure payments', 'Verified payment workflows connect checkout, invoices and settlement records.'],
]

const journey = [
  [Search, 'Search'], [Building2, 'Supplier'], [Target, 'RFQ'], [Send, 'Quotation'],
  [Handshake, 'Negotiate'], [FileCheck2, 'Final quote'], [FileSignature, 'Sign'],
  [Banknote, 'Checkout'], [Factory, 'Production'], [Truck, 'Shipping'], [PackageCheck, 'Delivery'],
]

const industries = [
  [Leaf, 'Agriculture', 'agriculture'], [Factory, 'Industrial machinery', 'industrial machinery'],
  [Zap, 'Electronics', 'electronics'], [Sparkles, 'Chemicals', 'chemicals'],
  [Shirt, 'Textiles', 'textiles'], [Utensils, 'Food processing', 'food'],
  [Box, 'Packaging', 'packaging'], [Construction, 'Construction', 'construction'],
  [Stethoscope, 'Medical equipment', 'medical equipment'],
]

const services = [
  [Bot, 'AI Assistant', 'Find products, suppliers and sourcing answers faster.', '/ai-chat'],
  [Target, 'RFQ Management', 'Create structured requirements and collect comparable offers.', '/rfqs'],
  [FileSignature, 'Digital Agreements', 'Review, sign and retain final commercial documents.', '/agreements'],
  [Warehouse, 'Trade Workspace', 'Operate the complete trade lifecycle from one shared view.', '/rfqs'],
  [Truck, 'Logistics Support', 'Plan shipping, landed cost and fulfillment milestones.', '/services/logistics'],
  [Banknote, 'Payment Solutions', 'Secure checkout, settlement accounts and transaction history.', '/wallet'],
  [FileCheck2, 'Documentation', 'Keep compliance and commercial records organized.', '/documents'],
  [ClipboardCheck, 'Invoice Generation', 'Access issued invoices and downloadable PDFs.', '/invoices'],
  [TrendingUp, 'Market Insights', 'Turn live marketplace context into clearer decisions.', '/market-insights'],
]

const knowledge = [
  ['How international trade works', 'Understand the milestones between sourcing, contracting, payment and delivery.', '/market-insights', Globe2],
  ['Export documentation guide', 'Learn where invoices, packing lists, origin certificates and transport records fit.', '/services/customs-brokerage', FileCheck2],
  ['RFQ best practices', 'Create requirements suppliers can quote accurately and efficiently.', '/rfqs/new', Target],
  ['Build your Business Profile', 'Manage company, factory, evidence and trust information from one workspace.', '/seller/business-profile', ShieldCheck],
]

export default function HomePage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const categories = useAsyncData(fetchCategories)
  const featured = useAsyncData(featuredLoader)
  const feed = useAsyncData(feedLoader)
  const sellers = useAsyncData(sellerLoader)
  const reviews = useAsyncData(reviewLoader)
  const statistics = useAsyncData(statisticsLoader)
  const orderedCategories = useMemo(
    () => [...(categories.data || [])].sort((a, b) => Number(b.productCount || 0) - Number(a.productCount || 0)),
    [categories.data]
  )
  const regions = useMemo(() => [...new Set((sellers.data || []).map(item => item.address?.country || item.country).filter(Boolean))].slice(0, 5), [sellers.data])
  const authRoute = path => navigate(status === 'authenticated' ? path : '/login', { state: { from: path } })

  return <AppShell><div className="home-marketplace"><div className="mobile-home-search"><MarketplaceSearch /></div>

    <section className="home-quick-strip">
      <div className="container">
        <div className="home-quick-grid home-quick-grid--desktop">
          <QuickAction icon={<Calculator />} label="Trade Calculator" tone="violet" to="/services/calculator" />
          <QuickAction icon={<Target />} label="Create RFQ" tone="amber" onClick={() => authRoute('/rfqs/new')} />
          <QuickAction icon={<Camera />} label="Image Search" tone="orange" to={status === 'authenticated' ? '/explore/image-search' : '/login'} state={{ from: '/explore/image-search' }} />
          <QuickAction icon={<Grid2X2 />} label="Categories" tone="emerald" to="/categories" />
        </div>
        <div className="home-quick-grid home-quick-grid--mobile">
          <QuickAction icon={<Calculator />} label="Trade Calculator" tone="violet" to="/services/calculator" />
          <QuickAction icon={<Target />} label="RFQ" tone="amber" onClick={() => authRoute('/rfqs/new')} />
          <QuickAction icon={<ShieldCheck />} label="Verified Manufacturers" tone="blue" to="/sellers" />
          <QuickAction icon={<Grid2X2 />} label="Categories" tone="emerald" to="/categories" />
          <QuickAction icon={<Camera />} label="Image Search" tone="orange" to={status === 'authenticated' ? '/explore/image-search' : '/login'} state={{ from: '/explore/image-search' }} />
        </div>
      </div>
    </section>

    <section className="home-ai-strip">
      <div className="container"><div><span className="home-ai-mark"><img src="/favicon-logo.jpeg" alt="" /><Sparkles /></span><span><b>EsyAI Sourcing</b><small>AI-powered product and supplier discovery</small></span></div><button onClick={() => authRoute('/ai-chat')}><Zap /> Try AI <ArrowRight /></button></div>
    </section>

    <MarketplaceCategories query={categories} ordered={orderedCategories} />
    <FeaturedProducts query={featured} />

    <AllProducts query={feed} />
    <AllProducts query={feed} />
  </div></AppShell>
}

function SectionHeading({ eyebrow, title, description, action, centered = false }) {
  return <header className={`home-section-heading ${centered ? 'centered' : ''}`}><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</header>
}

function MarketplaceCategories({ query, ordered }) {
  return <section className="home-list-section"><div className="container"><div className="home-list-heading"><h2>Categories</h2><Link to="/categories">See all</Link></div><div className="home-category-row">{query.loading ? <SkeletonCards count={8} variant="category" /> : ordered.slice(0, 14).map(item => <CategoryBubble key={item._id || item.slug} category={item} />)}</div></div></section>
}

function FeaturedProducts({ query }) {
  return <section className="home-list-section home-list-section--muted"><div className="container"><div className="home-list-heading"><h2>Featured products</h2><Link to="/products">View all</Link></div><div className="home-product-row">{query.loading ? <SkeletonCards count={5} variant="product" /> : query.data?.products?.map(item => <div key={item._id || item.id}><ProductCard product={item} /></div>)}</div></div></section>
}

function AllProducts({ query }) {
  return <section className="home-list-section home-reveal"><div className="container"><div className="home-list-heading"><h2>Trending products</h2><Link to="/products">Browse all</Link></div><div className="home-product-grid">{query.loading ? <SkeletonCards count={8} variant="product" /> : query.data?.products?.map(item => <ProductCard key={item._id || item.id} product={item} />)}</div></div></section>
}

function QuickAction({ icon, label, tone, to, onClick, state }) {
  const content = <><span className={`tone-${tone}`}>{icon}</span><b>{label}</b></>
  return to ? <Link to={to} state={state}>{content}</Link> : <button onClick={onClick}>{content}</button>
}

function Stat({ value, label, icon: Icon, loading }) {
  return <article><i><Icon /></i><strong>{loading ? '—' : <AnimatedNumber value={Number(value || 0)} />}</strong><span>{label}</span></article>
}

function AnimatedNumber({ value }) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const started = performance.now()
      const tick = now => {
        const progress = Math.min(1, (now - started) / 1100)
        setDisplay(Math.round(value * (1 - ((1 - progress) ** 3))))
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: .35 })
    observer.observe(node)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])
  return <span ref={ref}>{display.toLocaleString()}</span>
}

function SuccessStories({ reviews }) {
  const items = (reviews.data || []).filter(item => item.comment || item.review || item.content).slice(0, 3)
  return <section className="home-testimonial-section home-reveal"><div className="container">
    <SectionHeading eyebrow="Marketplace voices" title="Confidence built through real business experiences." description="Recent marketplace feedback from buyers and businesses using EsyGlob." centered />
    {reviews.loading ? <div className="home-testimonial-grid"><SkeletonCards count={3} variant="category" /></div> : items.length ? <div className="home-testimonial-grid">{items.map((item, index) => {
      const name = item.reviewerId?.fullName || item.userId?.fullName || item.user?.fullName || item.name || 'Marketplace member'
      const company = item.companyName || item.sellerId?.companyName || item.productId?.sellerId?.companyName || 'EsyGlob business'
      const country = item.country || item.reviewerId?.metadata?.country || 'Global marketplace'
      return <article key={item._id || index}><Quote /><div className="home-rating">{Array.from({ length: 5 }, (_, star) => <Star key={star} className={star < Number(item.rating || 5) ? 'active' : ''} />)}</div><blockquote>{item.comment || item.review || item.content}</blockquote><footer><span>{item.avatarUrl ? <SafeImage src={item.avatarUrl} alt="" /> : name.slice(0, 1)}</span><div><b>{company}</b><small>{name} · {country}</small></div></footer></article>
    })}</div> : <div className="home-story-empty"><GraduationCap /><h3>Success stories are built from verified marketplace reviews.</h3><p>Completed trade feedback will appear here as the public story of EsyGlob grows.</p></div>}
  </div></section>
}

function WorldMap() {
  return <svg className="home-world-map" viewBox="0 0 760 380" role="img" aria-label="Stylized world map">
    <g fill="currentColor">
      <path d="M52 118l31-39 68-20 64 18 34 39-21 35-42 6-22 25-39-4-18-29-41-8zM181 188l39 18 15 55-19 67-25-18-12-53-26-32z" />
      <path d="M306 83l35-23 68 4 27 27 54 7 31 25-22 24-45-2-25 28-28-8-16 23-45-16-9-34-40-17zM400 189l46 10 32 34-16 78-36 40-28-56-16-48z" />
      <path d="M514 104l46-29 86 12 61 37-20 29-62 3-24 28-52-4-34-30zM610 252l42-18 52 23-12 42-55 13-37-24z" />
    </g>
    <g fill="none" stroke="currentColor" strokeDasharray="5 8" strokeWidth="2" opacity=".45"><path d="M140 127Q310 15 405 127T643 139" /><path d="M216 228Q380 115 622 270" /></g>
  </svg>
}
