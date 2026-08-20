import { ArrowRight, Calculator, Camera, Grid2X2, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchCategories, fetchProducts } from '../api/marketplace'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { ProductCard, SkeletonCards } from '../components/MarketplaceCards'
import MarketplaceSearch from '../components/MarketplaceSearch'
import { MarketplaceError } from '../components/MarketplaceFeedback'
import useAsyncData from '../hooks/useAsyncData'
import { useRef } from 'react';
import { useState } from 'react'
import { useEffect } from 'react'

const featuredLoader = () => fetchProducts({ limit: 10, sort: 'latest', verifiedOnly: true })
const feedLoader = () => fetchProducts({ limit: 16, sort: 'latest' })

export default function HomePage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const categories = useAsyncData(fetchCategories)
  const featured = useAsyncData(featuredLoader, { refreshOnAddressChange: true })
  const feed = useAsyncData(feedLoader, { refreshOnAddressChange: true })
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
  const sliderRef = useRef(null);
  const [visibleItems, setVisibleItems] = useState(10);

  useEffect(() => {
    const updateVisibleItems = () => {
      const width = window.innerWidth;
      if (width < 480) {
        setVisibleItems(6); // Mobile: 6 items
      } else if (width < 768) {
        setVisibleItems(8); // Tablet: 8 items
      } else if (width < 1024) {
        setVisibleItems(10); // Small laptop: 10 items
      } else if (width < 1280) {
        setVisibleItems(12); // Desktop: 12 items
      } else {
        setVisibleItems(14); // Large desktop: 14 items
      }
    };

    updateVisibleItems();
    window.addEventListener('resize', updateVisibleItems);
    return () => window.removeEventListener('resize', updateVisibleItems);
  }, []);

  const scroll = (direction) => {
    const container = sliderRef.current;
    if (container) {
      const scrollAmount = direction === 'left' ? -120 : 120;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section className="py-4">
      <div className="container mx-auto max-w-[1400px] px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Categories</h2>
          <div className="flex items-center gap-2">
            <Link 
              to="/categories" 
              className="text-xs sm:text-sm text-gray-600 hover:text-gray-900"
            >
              See all
            </Link>
            <div className="flex gap-1">
              <button
                onClick={() => scroll('left')}
                className="w-6 h-6 rounded-full border border-gray-200 hover:bg-gray-100 flex items-center justify-center transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-6 h-6 rounded-full border border-gray-200 hover:bg-gray-100 flex items-center justify-center transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Slider */}
        {query.error ? (
          <MarketplaceError error={query.error} onRetry={query.reload} />
        ) : (
          <div
            ref={sliderRef}
            className="flex gap-4 sm:gap-5 overflow-x-auto scroll-smooth scrollbar-hide py-2"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            {query.loading ? (
              <SkeletonCards count={8} variant="category" />
            ) : (
              ordered.slice(0, 20).map(item => (
                <div
                  key={item._id || item.slug}
                  className="flex-shrink-0 cursor-pointer group"
                  style={{
                    width: `calc((100% - ${(visibleItems - 1) * 16}px) / ${visibleItems})`,
                    minWidth: '45px',
                    maxWidth: '65px'
                  }}
                >
                  <div className="relative w-full aspect-square rounded-full overflow-hidden bg-gray-50 transition-all duration-300 group-hover:shadow-lg group-hover:scale-105 group-hover:ring-2 group-hover:ring-blue-500">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-full" />
                  </div>
                  <p className="text-center mt-1.5 text-[9px] sm:text-[10px] text-gray-700 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2 min-h-[24px] sm:min-h-[28px] px-0.5">
                    {item.name}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </section>
  );
}

function FeaturedProducts({ query }) {
  return <section className="home-list-section home-list-section--muted"><div className="container"><div className="home-list-heading"><h2>Featured products</h2><Link to="/products">View all</Link></div>{query.error ? <MarketplaceError error={query.error} onRetry={query.reload} /> : <div className="home-product-row">{query.loading ? <SkeletonCards count={5} variant="product" /> : query.data?.products?.map(item => <div key={item._id || item.id}><ProductCard product={item} /></div>)}</div>}</div></section>
}

function AllProducts({ query }) {
  return <section className="home-list-section home-reveal"><div className="container"><div className="home-list-heading"><h2>Trending products</h2><Link to="/products">Browse all</Link></div>{query.error ? <MarketplaceError error={query.error} onRetry={query.reload} /> : <div className="home-product-grid">{query.loading ? <SkeletonCards count={8} variant="product" /> : query.data?.products?.map(item => <ProductCard key={item._id || item.id} product={item} />)}</div>}</div></section>
}

function QuickAction({ icon, label, tone, to, onClick, state }) {
  const content = <><span className={`tone-${tone}`}>{icon}</span><b>{label}</b></>
  return to ? <Link to={to} state={state}>{content}</Link> : <button onClick={onClick}>{content}</button>
}
