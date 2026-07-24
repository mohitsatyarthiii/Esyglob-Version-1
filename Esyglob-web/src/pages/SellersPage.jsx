// pages/SellersPage.jsx
import { Search, X, SlidersHorizontal, MapPin, BadgeCheck, Heart, Factory, ChevronRight, Star, Shield, Award, Crown } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { fetchSellers } from '../api/marketplace';
import AppShell from '../components/AppShell';
import { SkeletonCards, SafeImage } from '../components/MarketplaceCards';
import useAsyncData from '../hooks/useAsyncData';
import { Link } from 'react-router-dom';

const COMPANY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'exporter', label: 'Exporter' },
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
];

export default function SellersPage() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [sort, setSort] = useState('verified');
  const [showFilters, setShowFilters] = useState(false);

  const loader = useCallback(
    () => fetchSellers({ limit: 20, search, sort, ...(typeFilter && { companyType: typeFilter }), ...(regionFilter && { region: regionFilter }) }),
    [search, sort, typeFilter, regionFilter]
  );

  const query = useAsyncData(loader);
  const sellers = useMemo(() => query.data || [], [query.data]);
  const hasActiveFilters = typeFilter || regionFilter || sort !== 'verified' || search;

  function handleSubmit(e) { e.preventDefault(); setSearch(input.trim()); }
  function clearAll() { setInput(''); setSearch(''); setTypeFilter(''); setRegionFilter(''); setSort('verified'); }

  return (
    <AppShell>
      {/* Warm orange-tinted background */}
      <div className="min-h-screen" style={{ background: '#fef9f4' }}>
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-orange-100 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-2.5">
            <div className="flex items-center gap-2">
              <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 bg-orange-50/50 rounded-lg px-3 py-2 border border-orange-100 focus-within:bg-white focus-within:border-orange-300 transition-all">
                <Search size={15} className="text-orange-400 flex-shrink-0" />
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search suppliers..." className="flex-1 bg-transparent border-none outline-none text-xs text-slate-700 placeholder:text-slate-400" />
                {input && <button type="button" onClick={() => setInput('')} className="p-0.5 hover:bg-orange-100 rounded-full"><X size={12} className="text-slate-400" /></button>}
              </form>
              <button onClick={() => setShowFilters(true)} className="relative flex items-center gap-1.5 px-3 py-2 bg-white border border-orange-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-orange-50 active:scale-95 transition-all">
                <SlidersHorizontal size={14} />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full border-2 border-white" />}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="hidden sm:block px-3 py-2 bg-white border border-orange-200 rounded-lg text-xs font-semibold text-slate-600 cursor-pointer outline-none">
                {SORT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            {hasActiveFilters && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {search && <Chip label={`"${search}"`} onRemove={() => { setInput(''); setSearch(''); }} />}
                {typeFilter && <Chip label={COMPANY_TYPES.find(t => t.value === typeFilter)?.label} onRemove={() => setTypeFilter('')} />}
                {regionFilter && <Chip label={regionFilter} onRemove={() => setRegionFilter('')} />}
                <button onClick={clearAll} className="text-[10px] font-semibold text-red-500 hover:text-red-600 ml-1">Clear</button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex gap-5">
            <aside className="hidden lg:block w-44 flex-shrink-0">
              <div className="sticky top-20 space-y-4">
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Type</h3>
                  <div className="space-y-0.5">
                    {COMPANY_TYPES.map((t) => (
                      <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${typeFilter === t.value ? 'bg-orange-50 text-orange-600' : 'text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Region</h3>
                  <div className="space-y-0.5">
                    {REGIONS.filter(r => r.value).map((r) => (
                      <button key={r.value} onClick={() => setRegionFilter(r.value)} className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${regionFilter === r.value ? 'bg-orange-50 text-orange-600' : 'text-slate-600 hover:bg-slate-50'}`}>{r.label}</button>
                    ))}
                  </div>
                </div>
                {hasActiveFilters && <button onClick={clearAll} className="w-full py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-md">Clear Filters</button>}
              </div>
            </aside>

            <div className="flex-1 min-w-0">
              {!query.loading && <p className="text-[11px] text-slate-500 mb-3"><span className="font-semibold text-slate-700">{sellers.length}</span> suppliers</p>}
              {query.loading ? (
                <div className="space-y-3"><SkeletonCards count={4} variant="manufacturer" /></div>
              ) : sellers.length > 0 ? (
                <div className="space-y-3">
                  {sellers.map((item) => <LinkedInStyleCard key={item._id || item.id} seller={item} />)}
                </div>
              ) : (
                <div className="text-center py-16">
                  <Factory size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">No suppliers found</p>
                </div>
              )}
              <div className="h-16 sm:h-4" />
            </div>
          </div>
        </div>
      </div>

      {showFilters && <MobileFilters sort={sort} setSort={setSort} typeFilter={typeFilter} setTypeFilter={setTypeFilter} regionFilter={regionFilter} setRegionFilter={setRegionFilter} hasActiveFilters={hasActiveFilters} clearAll={clearAll} onClose={() => setShowFilters(false)} SORT_OPTIONS={SORT_OPTIONS} COMPANY_TYPES={COMPANY_TYPES} REGIONS={REGIONS} />}
      <style>{`@keyframes slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}.animate-slide-up{animation:slide-up .3s ease}`}</style>
    </AppShell>
  );
}

// ─── Premium LinkedIn-Style Seller Card ───────────────────────────
function LinkedInStyleCard({ seller }) {
  const id = seller._id || seller.id;
  const name = seller.companyName || seller.businessName || seller.name || 'Supplier';
  const verified = seller.isVerified || seller.verificationStatus === 'verified' || seller.verificationStatus === 'approved';
  const trusted = seller.isTrustedSeller;
  const logo = seller.companyLogo || seller.logo || seller.logoUrl;
  const bannerImage = seller.factoryImages?.[0] || seller.coverImage || seller.companyPhotos?.[0];
  const location = [seller.address?.city, seller.address?.state, seller.address?.country || seller.country].filter(Boolean).join(', ') || 'Global';
  const type = seller.companyType || seller.businessType || 'Supplier';
  const establishedYear = seller.yearEstablished;
  const yearsInBusiness = seller.yearsInBusiness || (establishedYear ? new Date().getFullYear() - Number(establishedYear) : null);
  const employeeCount = seller.employeeCount;
  const annualRevenue = seller.annualRevenueRange || seller.annualRevenue;
  const rating = seller.rating ? Number(seller.rating).toFixed(1) : null;
  const reviewCount = seller.reviewCount || 0;
  const productCount = seller.totalProducts || seller.productCount || 0;
  const responseRate = seller.responseRate;
  const description = seller.companyDescription || seller.description || seller.companyIntroduction;
  const categories = (seller.productCategories || seller.mainCategories || []);
  const exportMarkets = (seller.exportMarkets || []);
  const certifications = (seller.certifications || []);
  const paymentMethods = (seller.paymentMethods || seller.acceptedPaymentMethods || []);
  const factoryProfile = seller.factoryProfile || {};
  const [saved, setSaved] = useState(false);

  return (
    <div className={`group bg-white rounded-lg border overflow-hidden transition-all duration-300 hover:shadow-lg ${
      verified 
        ? 'border-emerald-200 hover:border-emerald-300 shadow-sm shadow-emerald-100/50 bg-gradient-to-br from-white via-white to-emerald-50/30' 
        : 'border-slate-200 hover:border-orange-200'
    }`}>
      {/* Banner */}
      <div className="relative h-24 sm:h-28 bg-gradient-to-r from-slate-200 to-slate-300 overflow-hidden">
        {bannerImage ? (
          <SafeImage src={bannerImage} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-orange-100 via-amber-50 to-yellow-100" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
        
        {/* VERIFIED - Top Badge (Only verified shows here) */}
        {verified && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-emerald-500 text-white rounded text-[9px] font-bold uppercase shadow-lg shadow-emerald-200/50">
            <BadgeCheck size={10} /> Verified Supplier
          </div>
        )}
        {trusted && !verified && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-white rounded text-[9px] font-bold uppercase shadow-lg">
            <Award size={10} /> Trusted
          </div>
        )}

        <button onClick={(e) => { e.preventDefault(); setSaved(!saved); }} className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full backdrop-blur-md transition-all ${saved ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-white/90 text-slate-500 hover:bg-white'}`}>
          <Heart size={12} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Card Body */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4">
        {/* Logo + Name - Clear & Visible */}
        <div className="flex items-end gap-3 -mt-8 sm:-mt-10 relative z-10 mb-3">
          <div className="relative flex-shrink-0">
            {logo ? (
              <SafeImage src={logo} alt={name} className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-3 object-contain bg-white ${verified ? 'border-emerald-400 shadow-lg shadow-emerald-200/50' : 'border-white shadow-md'}`} />
            ) : (
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-3 flex items-center justify-center text-white font-extrabold text-lg shadow-lg ${verified ? 'border-emerald-400 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/50' : 'border-white bg-gradient-to-br from-orange-500 to-amber-600'}`}>
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            {verified && <BadgeCheck size={16} className="absolute -bottom-0.5 -right-0.5 text-emerald-500 bg-white rounded-full drop-shadow-sm" />}
          </div>
          
          <div className="flex-1 min-w-0 pb-1">
            <Link to={`/sellers/${id}`} className="text-sm sm:text-base font-bold text-slate-800 group-hover:text-orange-600 transition-colors block leading-tight truncate">
              {name}
              {verified && <Crown size={13} className="inline ml-1 text-amber-400 fill-amber-400" />}
            </Link>
            <p className="text-[10px] sm:text-[11px] text-slate-500 truncate mt-0.5">{type}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate flex items-center gap-0.5"><MapPin size={9} /> {location}</p>
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="text-[10px] sm:text-[11px] text-slate-600 leading-relaxed mb-2.5 line-clamp-2 italic border-l-2 border-orange-200 pl-2">
            {description}
          </p>
        )}

        {/* Stats Grid - Colorful Numbers */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2.5">
          {productCount > 0 && (
            <div className="bg-orange-50 rounded-md p-1.5 text-center">
              <p className="text-sm sm:text-base font-bold text-orange-600 leading-tight">{productCount}</p>
              <p className="text-[8px] sm:text-[9px] text-slate-500 leading-tight">Products</p>
            </div>
          )}
          {rating && (
            <div className="bg-amber-50 rounded-md p-1.5 text-center">
              <p className="text-sm sm:text-base font-bold text-amber-600 leading-tight flex items-center justify-center gap-0.5">{rating}<Star size={10} className="fill-amber-400 text-amber-400" /></p>
              <p className="text-[8px] sm:text-[9px] text-slate-500 leading-tight">{reviewCount} reviews</p>
            </div>
          )}
          {yearsInBusiness && (
            <div className="bg-blue-50 rounded-md p-1.5 text-center">
              <p className="text-sm sm:text-base font-bold text-blue-600 leading-tight">{yearsInBusiness}</p>
              <p className="text-[8px] sm:text-[9px] text-slate-500 leading-tight">Years</p>
            </div>
          )}
          {responseRate !== undefined && (
            <div className="bg-green-50 rounded-md p-1.5 text-center">
              <p className="text-sm sm:text-base font-bold text-green-600 leading-tight">{responseRate}%</p>
              <p className="text-[8px] sm:text-[9px] text-slate-500 leading-tight">Response</p>
            </div>
          )}
          {employeeCount && (
            <div className="bg-purple-50 rounded-md p-1.5 text-center">
              <p className="text-sm sm:text-base font-bold text-purple-600 leading-tight">{employeeCount}</p>
              <p className="text-[8px] sm:text-[9px] text-slate-500 leading-tight">Staff</p>
            </div>
          )}
          {annualRevenue && (
            <div className="bg-teal-50 rounded-md p-1.5 text-center">
              <p className="text-[10px] sm:text-xs font-bold text-teal-600 leading-tight truncate">{annualRevenue}</p>
              <p className="text-[8px] sm:text-[9px] text-slate-500 leading-tight">Revenue</p>
            </div>
          )}
        </div>

        {/* Info Lines - Premium formatted */}
        <div className="space-y-1 text-[9px] sm:text-[10px] text-slate-600">
          {categories.length > 0 && (
            <p className="leading-relaxed">
              <span className="font-semibold text-slate-700">Products:</span>{' '}
              {categories.slice(0, 6).map(c => typeof c === 'string' ? c : c.name || c).join(' · ')}
              {categories.length > 6 && <span className="text-slate-400"> +{categories.length - 6} more</span>}
            </p>
          )}
          {exportMarkets.length > 0 && (
            <p className="leading-relaxed">
              <span className="font-semibold text-slate-700">Exports:</span>{' '}
              {exportMarkets.slice(0, 6).map(m => typeof m === 'string' ? m : m.name || m).join(' · ')}
              {exportMarkets.length > 6 && <span className="text-slate-400"> +{exportMarkets.length - 6} more</span>}
            </p>
          )}
          {certifications.length > 0 && (
            <p className="leading-relaxed">
              <span className="font-semibold text-slate-700">Certified:</span>{' '}
              {certifications.slice(0, 4).map(c => (
                <span key={typeof c === 'string' ? c : c.name} className="inline-flex items-center gap-0.5 mr-1.5 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[8px] sm:text-[9px] font-medium">
                  {typeof c === 'string' ? c : (c.name || c.certificateNumber)}
                </span>
              ))}
            </p>
          )}
          {factoryProfile.name && (
            <p className="leading-relaxed">
              <span className="font-semibold text-slate-700">Factory:</span>{' '}
              {[factoryProfile.name, factoryProfile.floorArea, factoryProfile.monthlyCapacity && `${factoryProfile.monthlyCapacity}/mo`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Bottom Bar */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {verified && (
              <span className="text-[8px] sm:text-[9px] font-semibold text-emerald-600 flex items-center gap-1">
                <Shield size={10} /> Verified
              </span>
            )}
            {paymentMethods.length > 0 && (
              <span className="text-[8px] sm:text-[9px] text-slate-400 hidden sm:inline">
                {paymentMethods.slice(0, 2).map(p => typeof p === 'string' ? p : p.name).join(', ')}
              </span>
            )}
          </div>
          <Link to={`/sellers/${id}`} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
            verified 
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200' 
              : 'bg-orange-600 text-white hover:bg-orange-700'
          }`}>
            View Profile <ChevronRight size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Filters ────────────────────────────────────────────────
function MobileFilters({ sort, setSort, typeFilter, setTypeFilter, regionFilter, setRegionFilter, hasActiveFilters, clearAll, onClose, SORT_OPTIONS, COMPANY_TYPES, REGIONS }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[75vh] bg-white rounded-t-2xl overflow-y-auto animate-slide-up">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">Filters</h3>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-5 pb-24">
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Sort</h4>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map((o) => <button key={o.value} onClick={() => setSort(o.value)} className={`px-3 py-2 rounded-full text-xs font-semibold ${sort === o.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{o.label}</button>)}
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Type</h4>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_TYPES.map((t) => <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`px-3 py-2 rounded-full text-xs font-semibold ${typeFilter === t.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.label}</button>)}
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Region</h4>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.filter(r => r.value).map((r) => <button key={r.value} onClick={() => setRegionFilter(r.value)} className={`px-3 py-2 rounded-full text-xs font-semibold ${regionFilter === r.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{r.label}</button>)}
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t px-4 py-3 space-y-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={onClose} className="w-full py-3 bg-slate-800 text-white rounded-xl text-sm font-bold active:scale-[0.98] transition-all">Show Results</button>
          {hasActiveFilters && <button onClick={() => { clearAll(); onClose(); }} className="w-full py-2 text-sm font-semibold text-red-500">Clear All</button>}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onRemove }) {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-200 rounded-full text-[10px] font-semibold text-orange-600">{label}<button onClick={onRemove} className="hover:bg-orange-100 rounded-full p-0.5"><X size={9} /></button></span>;
}