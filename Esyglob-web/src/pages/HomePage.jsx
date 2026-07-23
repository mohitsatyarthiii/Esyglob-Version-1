// pages/HomePage.jsx
import { Calculator, Camera, Grid2X2, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchCategories, fetchProducts } from '../api/marketplace';
import { useAuth } from '../auth/auth-context';
import AppShell from '../components/AppShell';
import { CategoryBubble, ProductCard, SkeletonCards } from '../components/MarketplaceCards';
import MarketplaceSearch from '../components/MarketplaceSearch';
import useAsyncData from '../hooks/useAsyncData';

const featuredLoader = () => fetchProducts({ limit: 10, sort: 'latest', verifiedOnly: true });
const feedLoader = () => fetchProducts({ limit: 16, sort: 'latest' });

export default function HomePage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const categories = useAsyncData(fetchCategories);
  const featured = useAsyncData(featuredLoader);
  const feed = useAsyncData(feedLoader);
  const quickScrollRef = useRef(null);
  const catScrollRef = useRef(null);
  const featScrollRef = useRef(null);

  const orderedCategories = useMemo(
    () => [...(categories.data || [])].sort((a, b) => Number(b.productCount || 0) - Number(a.productCount || 0)),
    [categories.data]
  );

  function authRoute(path) {
    navigate(status === 'authenticated' ? path : '/login', { state: { from: path } });
  }

  return (
    <AppShell>
      <div className="bg-white">

        <div className="mobile-home-search">
          <MarketplaceSearch />
        </div>

        {/* ─── Quick Actions ─────────────────────────────────────── */}
        <div className="border-b border-gray-100">
          <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 sm:py-3">
            <div className="hidden sm:grid sm:grid-cols-4 sm:gap-2">
              <QuickAction icon={<Calculator size={18} />} label="Trade Calculator" color="bg-violet-50 text-violet-600" to="/services/calculator" />
              <QuickAction icon={<Target size={18} />} label="Create RFQ" color="bg-amber-50 text-amber-600" onClick={() => authRoute('/rfqs/new')} />
              <QuickAction icon={<Camera size={18} />} label="Image Search" color="bg-orange-50 text-orange-600" to={status === 'authenticated' ? '/explore/image-search' : '/login'} state={{ from: '/explore/image-search' }} />
              <QuickAction icon={<Grid2X2 size={18} />} label="Categories" color="bg-emerald-50 text-emerald-600" to="/categories" />
            </div>
            <div ref={quickScrollRef} className="flex gap-2 overflow-x-auto scrollbar-hide sm:hidden -mx-4 px-4 snap-x">
              <QuickAction icon={<Calculator size={16} />} label="Trade Calculator" color="bg-violet-50 text-violet-600" to="/services/calculator" mobile />
              <QuickAction icon={<Target size={16} />} label="RFQ" color="bg-amber-50 text-amber-600" onClick={() => authRoute('/rfqs/new')} mobile />
              <QuickAction icon={<Grid2X2 size={16} />} label="Categories" color="bg-emerald-50 text-emerald-600" to="/categories" mobile />
              <QuickAction icon={<Camera size={16} />} label="Image Search" color="bg-orange-50 text-orange-600" to={status === 'authenticated' ? '/explore/image-search' : '/login'} state={{ from: '/explore/image-search' }} mobile />
            </div>
          </div>
        </div>

        {/* ─── AI Banner ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex items-center gap-3 py-2.5 sm:py-3">
              <div className="relative flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/20 sm:h-9 sm:w-9">
                  <img src="/favicon-logo.jpeg" alt="AI" className="h-full w-full object-cover" />
                </div>
                <div className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500">
                  <Sparkles size={7} className="text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-blue-300 sm:text-[11px]">EsyAI Sourcing</p>
                <p className="text-[10px] text-blue-200/70 sm:text-[11px]">AI-powered product discovery</p>
              </div>
              <button
                onClick={() => status === 'authenticated' ? navigate('/ai-chat') : navigate('/login', { state: { from: '/explore/image-search' } })}
                className="flex flex-shrink-0 items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-white/25 transition-colors sm:px-3 sm:text-[11px]"
              >
                <Zap size={11} className="text-amber-400" />
                Try AI
              </button>
            </div>
          </div>
        </div>

        {/* ─── Categories ────────────────────────────────────────── */}
        <div className="py-3 sm:py-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-2 flex items-end justify-between sm:mb-2.5">
              <h2 className="text-sm font-extrabold text-gray-900 sm:text-base">Categories</h2>
              <Link to="/categories" className="text-[10px] font-bold text-blue-600 sm:text-xs">See all</Link>
            </div>
            <div className="hidden sm:flex sm:gap-3 sm:overflow-x-auto scrollbar-hide">
              {categories.loading
                ? <SkeletonCards count={8} variant="category" />
                : orderedCategories.slice(0, 14).map((item) => (
                    <CategoryBubble key={item._id || item.slug} category={item} />
                  ))
              }
            </div>
            <div ref={catScrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide sm:hidden snap-x">
              {categories.loading
                ? <SkeletonCards count={8} variant="category" />
                : orderedCategories.slice(0, 14).map((item) => (
                    <CategoryBubble key={item._id || item.slug} category={item} />
                  ))
              }
            </div>
          </div>
        </div>

        {/* ─── Featured Products ─────────────────────────────────── */}
        <div className="bg-gray-50/80 py-3 sm:py-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-2 flex items-end justify-between sm:mb-2.5">
              <h2 className="text-sm font-extrabold text-gray-900 sm:text-base">Featured Products</h2>
              <Link to="/products" className="text-[10px] font-bold text-blue-600 sm:text-xs">View all</Link>
            </div>
            <div className="hidden sm:flex sm:gap-3 sm:overflow-x-auto scrollbar-hide">
              {featured.loading
                ? <SkeletonCards count={5} variant="product" />
                : featured.data?.products?.map((item) => (
                    <div key={item._id || item.id} className="w-[190px] flex-shrink-0 sm:w-[210px]">
                      <ProductCard product={item} />
                    </div>
                  ))
              }
            </div>
            <div ref={featScrollRef} className="flex gap-2.5 overflow-x-auto scrollbar-hide sm:hidden snap-x">
              {featured.loading
                ? <SkeletonCards count={4} variant="product" />
                : featured.data?.products?.map((item) => (
                    <div key={item._id || item.id} className="w-[42vw] max-w-[165px] flex-shrink-0 snap-start">
                      <ProductCard product={item} />
                    </div>
                  ))
              }
            </div>
          </div>
        </div>

        {/* ─── All Products ──────────────────────────────────────── */}
        <div className="py-3 sm:py-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-2 flex items-end justify-between sm:mb-2.5">
              <h2 className="text-sm font-extrabold text-gray-900 sm:text-base">All Products</h2>
              <Link to="/products" className="text-[10px] font-bold text-blue-600 sm:text-xs">Browse all</Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
              {feed.loading
                ? <SkeletonCards count={8} variant="product" />
                : feed.data?.products?.map((item) => (
                    <ProductCard key={item._id || item.id} product={item} />
                  ))
              }
            </div>
          </div>
        </div>

        {/* ─── Trust Strip ───────────────────────────────────────── */}
        <div className="border-t border-gray-100 py-3 sm:py-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex items-center justify-center gap-4 sm:gap-8">
              {['Verified suppliers', 'Buyer protection', 'Secure payments'].map((text) => (
                <span key={text} className="flex items-center gap-1.5 text-[9px] font-semibold text-gray-400 sm:text-[10px]">
                  <ShieldCheck size={12} className="text-emerald-500 sm:size-[14px]" />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Quick Action ────────────────────────────────────────────
function QuickAction({ icon, label, color, to, onClick, state, mobile = false }) {
  const className = mobile
    ? "flex flex-shrink-0 items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 snap-start w-[120px] active:scale-[0.97] transition-transform"
    : "flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2.5 transition-all hover:shadow-sm hover:-translate-y-0.5";

  const content = (
    <>
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${color} sm:h-9 sm:w-9`}>
        {icon}
      </span>
      <span className="text-[10px] font-bold text-gray-700 leading-tight sm:text-[11px]">{label}</span>
    </>
  );

  if (to) return <Link to={to} state={state} className={className}>{content}</Link>;
  return <button onClick={onClick} className={className}>{content}</button>;
}
