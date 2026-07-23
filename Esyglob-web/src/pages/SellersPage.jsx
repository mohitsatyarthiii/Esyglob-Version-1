// pages/SellersPage.jsx
import { Search, X, SlidersHorizontal, Star, Shield, Globe, Factory, MapPin, CheckCircle2, Award, Users, Package, Clock, MessageCircle, BadgeCheck, Heart, Send, ChevronRight, TrendingUp, Building2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { fetchSellers } from '../api/marketplace';
import AppShell from '../components/AppShell';
import { SkeletonCards, SafeImage } from '../components/MarketplaceCards';
import useAsyncData from '../hooks/useAsyncData';
import { Link } from 'react-router-dom';
import WishlistButton from '../components/WishlistButton';

const COMPANY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'trading', label: 'Trading Company' },
];

const SORT_OPTIONS = [
  { value: 'verified', label: 'Verified First' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'products', label: 'Most Products' },
  { value: 'newest', label: 'Newest' },
];

const REGIONS = [
  { value: '', label: 'All Regions' },
  { value: 'India', label: 'India' },
  { value: 'China', label: 'China' },
  { value: 'UAE', label: 'UAE' },
  { value: 'USA', label: 'USA' },
  { value: 'Vietnam', label: 'Vietnam' },
  { value: 'Turkey', label: 'Turkey' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Japan', label: 'Japan' },
  { value: 'South Korea', label: 'South Korea' },
];

const POPULAR_SEARCHES = [
  'Textile Manufacturers',
  'Electronics',
  'Auto Parts',
  'Packaging',
  'Food & Beverage',
];

export default function SellersPage() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [sort, setSort] = useState('verified');
  const [showFilters, setShowFilters] = useState(false);

  const loader = useCallback(
    () => fetchSellers({
      limit: 40,
      search,
      sort,
      ...(typeFilter && { companyType: typeFilter }),
      ...(regionFilter && { region: regionFilter }),
    }),
    [search, sort, typeFilter, regionFilter]
  );

  const query = useAsyncData(loader);
  const sellers = useMemo(() => query.data || [], [query.data]);
  const hasFilters = typeFilter || regionFilter || sort !== 'verified' || search;

  function handleSubmit(e) {
    e.preventDefault();
    setSearch(input.trim());
  }

  function clearFilters() {
    setInput('');
    setSearch('');
    setTypeFilter('');
    setRegionFilter('');
    setSort('verified');
  }

  return (
    <AppShell>
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        {/* ─── Top Bar ─── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 0' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af' }}>
              <Link to="/" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 500 }}>Home</Link>
              <span>/</span>
              <span>Suppliers</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
                <CheckCircle2 size={14} color="#059669" /> 15,000+ Verified Suppliers
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
                <Globe size={14} color="#059669" /> 50+ Countries
              </span>
            </div>
          </div>
        </div>

        {/* ─── Hero Search ─── */}
        <div style={{ background: 'linear-gradient(135deg, #fff 0%, #fef2f2 50%, #fff 100%)', borderBottom: '1px solid #fee2e2', padding: '40px 0 44px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px', textAlign: 'center' }}>
            <h1 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: '#111827', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
              Find Verified Global Suppliers
            </h1>
            <p style={{ fontSize: 15, color: '#4b5563', margin: '0 0 24px', lineHeight: 1.5 }}>
              Connect with trusted manufacturers, wholesalers, and exporters worldwide
            </p>

            {/* Search Form */}
            <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '2px solid #e5e7eb', borderRadius: 50, padding: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', transition: 'all 0.2s ease' }}>
                <Search size={20} color="#9ca3af" style={{ marginLeft: 16, flexShrink: 0 }} />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Search suppliers by product, company name, or country..."
                  style={{ flex: 1, border: 'none', outline: 'none', padding: '14px 12px', fontSize: 15, color: '#111827', background: 'transparent', minWidth: 0 }}
                />
                {input && (
                  <button type="button" onClick={() => setInput('')} style={{ padding: 4, marginRight: 4, background: '#f3f4f6', border: 'none', borderRadius: '50%', color: '#6b7280', cursor: 'pointer', display: 'flex' }}>
                    <X size={16} />
                  </button>
                )}
                <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 50, fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <Search size={18} />
                  <span>Search</span>
                </button>
              </div>
            </form>

            {/* Popular Searches */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>Popular:</span>
              {POPULAR_SEARCHES.map((term) => (
                <button
                  key={term}
                  onClick={() => { setInput(term); setSearch(term); }}
                  style={{ padding: '4px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 50, fontSize: 11, color: '#6b7280', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px 60px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'start' }}>
          
          {/* Sidebar - Desktop */}
          <aside style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20, position: 'sticky', top: 80 }}>
            {/* Type Filter */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Supplier Type</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {COMPANY_TYPES.map((t) => (
                  <label
                    key={t.value}
                    onClick={() => setTypeFilter(t.value)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: typeFilter === t.value ? '#dc2626' : '#4b5563', fontWeight: typeFilter === t.value ? 600 : 400, background: typeFilter === t.value ? '#fff5f5' : 'transparent', transition: 'all 0.15s' }}
                  >
                    <input type="radio" name="type" checked={typeFilter === t.value} readOnly style={{ accentColor: '#dc2626', width: 14, height: 14 }} />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Region Filter */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Region</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {REGIONS.filter(r => r.value).map((r) => (
                  <label
                    key={r.value}
                    onClick={() => setRegionFilter(r.value)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: regionFilter === r.value ? '#dc2626' : '#4b5563', fontWeight: regionFilter === r.value ? 600 : 400, background: regionFilter === r.value ? '#fff5f5' : 'transparent', transition: 'all 0.15s' }}
                  >
                    <input type="radio" name="region" checked={regionFilter === r.value} readOnly style={{ accentColor: '#dc2626', width: 14, height: 14 }} />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', padding: '8px 12px', background: 'none', border: '1px solid #fecaca', borderRadius: 6, color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <X size={14} /> Clear All Filters
              </button>
            )}
          </aside>

          {/* Content */}
          <div style={{ minWidth: 0 }}>
            {/* Toolbar */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Mobile Filter Button */}
                <button
                  onClick={() => setShowFilters(true)}
                  style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', position: 'relative' }}
                  className="mobile-filter-btn"
                >
                  <SlidersHorizontal size={18} />
                  <span>Filters</span>
                  {hasFilters && <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#dc2626', borderRadius: '50%', border: '2px solid #fff' }} />}
                </button>
                <div>
                  {!query.loading && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#4b5563' }}>
                      {sellers.length} Supplier{sellers.length !== 1 ? 's' : ''} found
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* Active Filters */}
                {hasFilters && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {search && <FilterChip label={search} onRemove={() => { setInput(''); setSearch(''); }} />}
                    {typeFilter && <FilterChip label={COMPANY_TYPES.find(t => t.value === typeFilter)?.label} onRemove={() => setTypeFilter('')} />}
                    {regionFilter && <FilterChip label={regionFilter} onRemove={() => setRegionFilter('')} />}
                  </div>
                )}
                {/* Sort */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>Sort by:</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#374151', background: '#f9fafb', cursor: 'pointer', outline: 'none' }}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Results */}
            {query.loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <SkeletonCards count={6} variant="manufacturer" />
              </div>
            ) : sellers.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {sellers.map((item) => (
                  <SellerCard key={item._id || item.id} seller={item} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, background: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: '#9ca3af' }}>
                  <Package size={48} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#4b5563', margin: '0 0 8px' }}>No Suppliers Found</h3>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>
                  {hasFilters ? 'Try adjusting your filters or search criteria' : 'No suppliers are currently available'}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ padding: '10px 24px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    Clear All Filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filters Modal */}
      {showFilters && (
        <MobileFiltersSheet
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          regionFilter={regionFilter}
          setRegionFilter={setRegionFilter}
          hasFilters={hasFilters}
          clearFilters={() => { clearFilters(); setShowFilters(false); }}
          onClose={() => setShowFilters(false)}
          COMPANY_TYPES={COMPANY_TYPES}
          REGIONS={REGIONS}
        />
      )}

      {/* Responsive Styles */}
      <style>{`
        @media(max-width: 768px) {
          .mobile-filter-btn { display: flex !important; }
        }
        @media(max-width: 1024px) {
          .sellers-grid-new { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media(max-width: 640px) {
          .sellers-grid-new { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}

// ─── Seller Card ──────────────────────────────────────────────────
function SellerCard({ seller }) {
  const id = seller._id || seller.id;
  const name = seller.companyName || seller.businessName || seller.name || 'Supplier';
  const verified = seller.isVerified || seller.verificationStatus === 'verified' || seller.verificationStatus === 'approved';
  const trusted = seller.isTrustedSeller;
  const logo = seller.companyLogo || seller.logo || seller.logoUrl;
  const coverImage = seller.coverImage;
  const location = [seller.address?.city, seller.address?.country || seller.country].filter(Boolean).join(', ');
  const rating = seller.rating ? Number(seller.rating).toFixed(1) : null;
  const reviewCount = seller.reviewCount || 0;
  const productCount = seller.totalProducts || seller.productCount || 0;
  const type = seller.companyType || seller.businessType || 'Supplier';
  const yearsInBusiness = seller.yearsInBusiness || (seller.yearEstablished ? new Date().getFullYear() - Number(seller.yearEstablished) : null);
  const responseRate = seller.responseRate;
  const categories = (seller.productCategories || seller.mainCategories || []).slice(0, 3);
  const topProducts = (seller.topProducts || seller.featuredProducts || []).slice(0, 4);
  const [saved, setSaved] = useState(false);

  return (
    <article style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', transition: 'all 0.3s ease', cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Cover Image */}
      <Link to={`/sellers/${id}`} style={{ display: 'block', height: 130, background: '#f9fafb', position: 'relative', overflow: 'hidden' }}>
        {coverImage ? (
          <SafeImage src={coverImage} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f9ff, #fef2f2)', color: '#d1d5db' }}>
            <Factory size={40} />
          </div>
        )}

        {/* Badges */}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 2 }}>
          {verified && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#059669', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', width: 'fit-content' }}>
              <Shield size={10} /> Verified
            </span>
          )}
          {trusted && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#d97706', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', width: 'fit-content' }}>
              <Award size={10} /> Trusted
            </span>
          )}
        </div>

        {/* Wishlist */}
        <button
          onClick={(e) => { e.preventDefault(); setSaved(!saved); }}
          style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2, color: saved ? '#ef4444' : '#9ca3af', transition: 'all 0.2s' }}
        >
          <Heart size={15} fill={saved ? '#ef4444' : 'none'} />
        </button>
      </Link>

      {/* Card Body */}
      <div style={{ padding: '0 14px 14px' }}>
        {/* Header with Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -28, position: 'relative', zIndex: 2, marginBottom: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {logo ? (
              <SafeImage src={logo} alt={name} style={{ width: 56, height: 56, borderRadius: 10, border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', objectFit: 'contain', background: '#fff' }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: 10, border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', background: 'linear-gradient(135deg, #e0e7ff, #fce7f3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: '#6366f1' }}>
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            {verified && (
              <span style={{ position: 'absolute', bottom: -2, right: -2, background: '#fff', borderRadius: '50%', display: 'flex', color: '#059669' }}>
                <BadgeCheck size={18} />
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 24 }}>
            <Link to={`/sellers/${id}`} style={{ fontSize: 14, fontWeight: 700, color: '#111827', textDecoration: 'none', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6b7280' }}>
                <MapPin size={11} /> {location || 'Global'}
              </span>
              <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>
                {type}
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', marginBottom: 8 }}>
          {rating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Star size={12} fill="#f59e0b" color="#f59e0b" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{rating}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>({reviewCount})</span>
            </div>
          )}
          {productCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Package size={12} color="#6b7280" />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{productCount}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>Products</span>
            </div>
          )}
          {yearsInBusiness && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={12} color="#6b7280" />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{yearsInBusiness}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>Yrs</span>
            </div>
          )}
          {responseRate !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <MessageCircle size={12} color="#6b7280" />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{responseRate}%</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>Response</span>
            </div>
          )}
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {categories.map((cat, idx) => (
              <span key={idx} style={{ padding: '2px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, fontSize: 10, fontWeight: 500, color: '#1e40af' }}>
                {typeof cat === 'string' ? cat : cat.name || cat}
              </span>
            ))}
          </div>
        )}

        {/* Top Products Preview */}
        {topProducts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>Top:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {topProducts.map((product, idx) => (
                <div key={idx} style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', background: '#f3f4f6', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                  {product.image || product.images?.[0] ? (
                    <SafeImage src={product.image || product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={14} color="#d1d5db" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Link
            to={`/sellers/${id}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <MessageCircle size={14} /> Contact
          </Link>
          <Link
            to={`/sellers/${id}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 12px', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            View Profile <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Mobile Filters Sheet ─────────────────────────────────────────
function MobileFiltersSheet({ typeFilter, setTypeFilter, regionFilter, setRegionFilter, hasFilters, clearFilters, onClose, COMPANY_TYPES, REGIONS }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85vh', background: '#fff', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Filters</h3>
          <button onClick={onClose} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Supplier Type</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COMPANY_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTypeFilter(t.value)}
                  style={{ padding: '10px 16px', background: typeFilter === t.value ? '#111827' : '#f9fafb', color: typeFilter === t.value ? '#fff' : '#4b5563', border: `1px solid ${typeFilter === t.value ? '#111827' : '#e5e7eb'}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Region</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {REGIONS.filter(r => r.value).map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRegionFilter(r.value)}
                  style={{ padding: '10px 16px', background: regionFilter === r.value ? '#111827' : '#f9fafb', color: regionFilter === r.value ? '#fff' : '#4b5563', border: `1px solid ${regionFilter === r.value ? '#111827' : '#e5e7eb'}`, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={onClose} style={{ width: '100%', padding: 14, background: '#111827', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Show Results
          </button>
          {hasFilters && (
            <button onClick={clearFilters} style={{ width: '100%', padding: 12, background: 'none', border: 'none', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Clear All Filters
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────
function FilterChip({ label, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 50, fontSize: 11, fontWeight: 600, color: '#dc2626' }}>
      {label}
      <button onClick={onRemove} style={{ display: 'flex', alignItems: 'center', padding: 1, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', borderRadius: '50%' }}>
        <X size={12} />
      </button>
    </span>
  );
}