import { ArrowRight, Calculator, Camera, Grid2X2, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchCategories, fetchProducts } from '../api/marketplace'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { CategoryBubble, ProductCard, SkeletonCards } from '../components/MarketplaceCards'
import MarketplaceSearch from '../components/MarketplaceSearch'
import useAsyncData from '../hooks/useAsyncData'

const featuredLoader = () => fetchProducts({ limit: 10, sort: 'latest', verifiedOnly: true })
const feedLoader = () => fetchProducts({ limit: 16, sort: 'latest' })

export default function HomePage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const categories = useAsyncData(fetchCategories)
  const featured = useAsyncData(featuredLoader)
  const feed = useAsyncData(feedLoader)
  const orderedCategories = useMemo(
    () => [...(categories.data || [])].sort((a, b) => Number(b.productCount || 0) - Number(a.productCount || 0)),
    [categories.data],
  )
  const authRoute = path => navigate(status === 'authenticated' ? path : '/login', { state: { from: path } })

  return <AppShell><div className="home-marketplace">
    <div className="mobile-home-search"><MarketplaceSearch /></div>
    <section className="home-quick-strip"><div className="container">
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
    </div></section>
    <section className="home-ai-strip"><div className="container">
      <div><span className="home-ai-mark"><img src="/favicon-logo.jpeg" alt="" /><Sparkles /></span><span><b>EsyAI Sourcing</b><small>AI-powered product and supplier discovery</small></span></div>
      <button onClick={() => authRoute('/ai-chat')}><Zap /> Try AI <ArrowRight /></button>
    </div></section>
    <MarketplaceCategories query={categories} ordered={orderedCategories} />
    <FeaturedProducts query={featured} />
    <AllProducts query={feed} />
  </div></AppShell>
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
