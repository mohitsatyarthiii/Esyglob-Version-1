import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Clock3,
  Factory,
  Heart,
  MapPin,
  MessageCircle,
  PackageCheck,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSellers } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { SafeImage, SkeletonCards } from '../components/MarketplaceCards'
import UnifiedSearchInput from '../components/UnifiedSearchInput'
import useAsyncData from '../hooks/useAsyncData'

const SUPPLIER_FILTERS = [
  { value: '', label: 'All suppliers' },
  { value: 'verified', label: 'Verified supplier' },
  { value: 'factory', label: 'Factory verified' },
  { value: 'premium', label: 'Premium supplier' },
  { value: 'export', label: 'Export ready' },
]

const EXPERIENCE_FILTERS = [
  { value: '', label: 'Any experience' },
  { value: '5', label: '5+ years' },
  { value: '10', label: '10+ years' },
  { value: '15', label: '15+ years' },
]

const SORT_OPTIONS = [
  { value: 'verified', label: 'Verified First' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'products', label: 'Most Products' },
  { value: 'newest', label: 'Newest' },
]

const REGIONS = [
  { value: '', label: 'All Regions' },
  { value: 'India', label: 'India' },
  { value: 'China', label: 'China' },
  { value: 'UAE', label: 'UAE' },
  { value: 'USA', label: 'USA' },
  { value: 'Vietnam', label: 'Vietnam' },
  { value: 'Turkey', label: 'Turkey' },
]

export default function SellersPage() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [experienceFilter, setExperienceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [sort, setSort] = useState('verified')
  const [showFilters, setShowFilters] = useState(false)

  const loader = useCallback(
    () => fetchSellers({ limit: 20, search, sort, ...(regionFilter && { region: regionFilter }) }),
    [search, sort, regionFilter],
  )
  const query = useAsyncData(loader)
  const allSellers = useMemo(() => query.data || [], [query.data])
  const categoryOptions = useMemo(() => {
    const counts = new Map()
    allSellers.forEach((seller) => normalizeCategories(seller.businessCategories || seller.productCategories || seller.categories || seller.industries, seller.products)
      .forEach((category) => counts.set(category, (counts.get(category) || 0) + 1)))
    return [{ value: '', label: 'All categories' }, ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([category]) => ({ value: category, label: category }))]
  }, [allSellers])
  const sellers = useMemo(() => allSellers.filter((seller) => {
    if (supplierFilter === 'verified' && !(seller.isVerified || ['verified', 'approved'].includes(seller.verificationStatus))) return false
    if (supplierFilter === 'factory' && !(seller.factoryVerified || seller.isFactoryVerified || seller.factoryAudit?.verified)) return false
    if (supplierFilter === 'premium' && !(seller.isPremium || seller.premiumSeller || seller.membershipTier === 'premium' || seller.subscriptionTier === 'premium')) return false
    if (supplierFilter === 'export' && !(seller.isExporter || seller.exportCapability || seller.exportMarkets?.length || seller.tradeInformation?.exportMarkets?.length)) return false
    const years = Number(seller.yearsInBusiness || (seller.yearEstablished ? new Date().getFullYear() - Number(seller.yearEstablished) : 0))
    if (experienceFilter && (!years || years < Number(experienceFilter))) return false
    if (categoryFilter) {
      const categories = normalizeCategories(seller.businessCategories || seller.productCategories || seller.categories || seller.industries, seller.products)
      if (!categories.some((category) => category.toLowerCase() === categoryFilter.toLowerCase())) return false
    }
    return true
  }), [allSellers, categoryFilter, experienceFilter, supplierFilter])
  const hasActiveFilters = Boolean(supplierFilter || experienceFilter || categoryFilter || regionFilter || sort !== 'verified' || search)

  function handleSubmit(value) {
    setSearch(value)
  }

  function clearAll() {
    setInput('')
    setSearch('')
    setSupplierFilter('')
    setExperienceFilter('')
    setCategoryFilter('')
    setRegionFilter('')
    setSort('verified')
  }

  return <AppShell>
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="seller-search-toolbar">
            <UnifiedSearchInput className="sellers-unified-search" value={input} onChange={setInput} onSubmit={handleSubmit} placeholder="Search manufacturers by product, industry or location" showSubmit />
            <div className="seller-search-toolbar__actions">
              <button onClick={() => setShowFilters(true)} className="seller-filter-trigger">
                <SlidersHorizontal size={16} /><span>Filters</span>
                {hasActiveFilters && <i />}
              </button>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort suppliers" className="seller-sort-select">
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          {hasActiveFilters && <div className="seller-active-filter-chips">
            {search && <Chip label={`"${search}"`} onRemove={() => { setInput(''); setSearch('') }} />}
            {supplierFilter && <Chip label={SUPPLIER_FILTERS.find((item) => item.value === supplierFilter)?.label} onRemove={() => setSupplierFilter('')} />}
            {experienceFilter && <Chip label={`${experienceFilter}+ years`} onRemove={() => setExperienceFilter('')} />}
            {categoryFilter && <Chip label={categoryFilter} onRemove={() => setCategoryFilter('')} />}
            {regionFilter && <Chip label={regionFilter} onRemove={() => setRegionFilter('')} />}
            <button onClick={clearAll} className="seller-clear-filters">Clear all</button>
          </div>}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex gap-6">
          <aside className="hidden w-48 flex-shrink-0 lg:block">
            <div className="sticky top-20 space-y-4">
              <FilterGroup title="Supplier credentials" items={SUPPLIER_FILTERS} selected={supplierFilter} onSelect={setSupplierFilter} tone="blue" />
              {categoryOptions.length > 1 && <FilterGroup title="Product category" items={categoryOptions} selected={categoryFilter} onSelect={setCategoryFilter} tone="blue" />}
              <FilterGroup title="Years in business" items={EXPERIENCE_FILTERS} selected={experienceFilter} onSelect={setExperienceFilter} tone="blue" />
              <FilterGroup title="Country / region" items={REGIONS} selected={regionFilter} onSelect={setRegionFilter} tone="amber" />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {!query.loading && <p className="mb-3 text-sm text-gray-500"><span className="font-bold text-gray-800">{sellers.length}</span> suppliers found</p>}
            {query.loading
              ? <div className="space-y-3"><SkeletonCards count={3} variant="manufacturer" /></div>
              : sellers.length
                ? <div className="flex flex-col gap-3">{sellers.map((seller) => <SellerListingCard key={seller._id || seller.id} seller={seller} />)}</div>
                : <div className="rounded-lg border border-gray-200 bg-white py-16 text-center shadow-sm"><Factory size={48} className="mx-auto mb-3 text-gray-300" /><p className="text-base font-semibold text-gray-600">No suppliers found</p><p className="mt-1 text-sm text-gray-400">Try adjusting your search or filters</p></div>}
            <div className="h-8" />
          </div>
        </div>
      </div>
    </div>

    {showFilters && <MobileFilters sort={sort} setSort={setSort} supplierFilter={supplierFilter} setSupplierFilter={setSupplierFilter} experienceFilter={experienceFilter} setExperienceFilter={setExperienceFilter} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} categoryOptions={categoryOptions} regionFilter={regionFilter} setRegionFilter={setRegionFilter} hasActiveFilters={hasActiveFilters} clearAll={clearAll} onClose={() => setShowFilters(false)} />}
  </AppShell>
}

function SellerListingCard({ seller }) {
  const [saved, setSaved] = useState(false)
  const id = seller._id || seller.id
  const name = seller.companyName || seller.businessName || seller.name || 'Marketplace supplier'
  const verified = Boolean(seller.isVerified || ['verified', 'approved'].includes(seller.verificationStatus))
  const factoryVerified = Boolean(seller.factoryVerified || seller.isFactoryVerified || seller.factoryAudit?.verified)
  const premium = Boolean(seller.isPremium || seller.premiumSeller || seller.membershipTier === 'premium' || seller.subscriptionTier === 'premium')
  const logo = seller.companyLogo || seller.logo || seller.logoUrl
  const facilityImage = seller.facilityImage || seller.factoryImage || seller.coverImage || seller.bannerImage || seller.videoThumbnail
  const location = [seller.address?.city, seller.address?.state, seller.address?.country || seller.country].filter(Boolean).join(', ') || 'Global supplier'
  const type = seller.companyType || seller.businessType || 'Manufacturer'
  const years = seller.yearsInBusiness || (seller.yearEstablished ? Math.max(0, new Date().getFullYear() - Number(seller.yearEstablished)) : null)
  const rating = Number(seller.rating || seller.averageRating || 0)
  const reviews = Number(seller.reviewCount || seller.totalReviews || seller.reviewsCount || 0)
  const responseRate = Number(seller.responseRate || seller.inquiryResponseRate || 0)
  const responseTime = seller.responseTime || seller.averageResponseTime || seller.avgResponseTime || 'Within 24h'
  const productCount = Number(seller.totalProducts || seller.productCount || seller.products?.length || 0)
  const orders = Number(seller.ordersCompleted || seller.completedOrders || seller.totalOrders || 0)
  const moq = seller.minimumOrderQuantity || seller.moq || seller.products?.find((product) => product.minimumOrderQuantity || product.moq)?.minimumOrderQuantity || seller.products?.find((product) => product.moq)?.moq
  const description = seller.companyDescription || seller.description || seller.about || `Explore sourcing and manufacturing capabilities from ${name}.`
  const categories = normalizeCategories(seller.businessCategories || seller.productCategories || seller.categories || seller.industries, seller.products)

  return <article className="seller-list-card">
    <header className="seller-list-card__header">
      <div className="seller-list-card__identity">
        <div className="seller-list-card__logo">
          {logo ? <SafeImage src={logo} alt={`${name} logo`} className="h-full w-full object-contain" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div>
          <div className="seller-list-card__title">
            <Link to={`/sellers/${id}`}>{name}</Link>
            {verified && <span className="seller-trust-badge verified"><BadgeCheck /> Verified</span>}
            {factoryVerified && <span className="seller-trust-badge factory"><ShieldCheck /> Factory verified</span>}
            {premium && <span className="seller-trust-badge premium"><Sparkles /> Premium</span>}
          </div>
          <div className="seller-list-card__subline"><span><Building2 /> {type}</span><span><MapPin /> {location}</span>{years !== null && <span>{years}+ years</span>}</div>
        </div>
      </div>
      <button className={`seller-save-button ${saved ? 'saved' : ''}`} onClick={() => setSaved((value) => !value)} aria-label={saved ? 'Remove supplier from saved' : 'Save supplier'} aria-pressed={saved}><Heart /></button>
    </header>

    <div className="seller-list-card__content">
      <div className="seller-list-card__details">
        <p className="seller-list-card__description">{description}</p>
        <div className="seller-category-chips" aria-label="Product categories">
          {categories.slice(0, 5).map((category) => <span key={category}>{category}</span>)}
          {categories.length > 5 && <span>+{categories.length - 5}</span>}
        </div>
        <div className="seller-metric-grid">
          <Metric icon={<Star />} label="Rating" value={rating ? `${rating.toFixed(1)} (${reviews})` : 'New supplier'} tone="amber" />
          <Metric icon={<Clock3 />} label="Response" value={responseRate ? `${responseRate}% · ${responseTime}` : responseTime} tone="emerald" />
          <Metric icon={<PackageCheck />} label="Products" value={productCount ? productCount.toLocaleString() : 'Catalog ready'} tone="blue" />
          <Metric icon={<BadgeCheck />} label="Orders" value={orders ? orders.toLocaleString() : '—'} tone="violet" />
          {moq && <Metric icon={<Factory />} label="MOQ from" value={`${moq} units`} tone="slate" />}
        </div>
      </div>

      <div className="seller-list-card__media">
        {facilityImage
          ? <SafeImage src={facilityImage} alt={`${name} facility`} className="h-full w-full object-cover" />
          : <div className="seller-list-card__placeholder"><Factory /><span>Company facility</span></div>}
        <span><Factory /> Manufacturing profile</span>
      </div>
    </div>

    <footer className="seller-list-card__footer">
      <div className="seller-card-proof">{verified ? <><ShieldCheck /> Identity and business details verified</> : <><Building2 /> Marketplace business profile</>}</div>
      <div className="seller-card-actions">
        <Link className="seller-card-action secondary" to={`/messages?participant=${id}`}><MessageCircle /> Chat now</Link>
        <Link className="seller-card-action secondary" to={`/rfqs/new?sellerId=${id}`}><Send /> Send enquiry</Link>
        <Link className="seller-card-action primary" to={`/sellers/${id}`}>View profile <ArrowUpRight /></Link>
      </div>
    </footer>
  </article>
}

function Metric({ icon, label, value, tone }) {
  return <div className={`seller-metric seller-metric--${tone}`}><i>{icon}</i><span><small>{label}</small><b>{value}</b></span></div>
}

function normalizeCategories(value, products = []) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const productCategories = Array.isArray(products) ? products.map((product) => product.category?.name || product.categoryName || product.category).filter(Boolean) : []
  return [...new Set([...source, ...productCategories].map((item) => typeof item === 'string' ? item.trim() : item?.name || item?.title).filter(Boolean))]
}

function FilterGroup({ title, items, selected, onSelect, tone }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</h3>
    <div className="space-y-1">{items.map((item) => <button key={item.value} onClick={() => onSelect(item.value)} className={`w-full rounded px-2 py-1.5 text-left text-xs font-medium transition-all ${selected === item.value ? tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>{item.label}</button>)}</div>
  </div>
}

function MobileFilters({ sort, setSort, supplierFilter, setSupplierFilter, experienceFilter, setExperienceFilter, categoryFilter, setCategoryFilter, categoryOptions, regionFilter, setRegionFilter, hasActiveFilters, clearAll, onClose }) {
  return <div className="fixed inset-0 z-50 lg:hidden">
    <button className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close filters" />
    <div className="seller-filter-sheet absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white">
      <div className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-3"><h3 className="text-sm font-bold text-gray-800">Filters & Sorting</h3><button onClick={onClose} aria-label="Close filters" className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"><X size={16} /></button></div>
      <div className="space-y-5 p-4 pb-24">
        <MobileChoices title="Sort by" items={SORT_OPTIONS} selected={sort} onSelect={setSort} />
        <MobileChoices title="Supplier credentials" items={SUPPLIER_FILTERS} selected={supplierFilter} onSelect={setSupplierFilter} />
        {categoryOptions.length > 1 && <MobileChoices title="Product category" items={categoryOptions} selected={categoryFilter} onSelect={setCategoryFilter} />}
        <MobileChoices title="Years in business" items={EXPERIENCE_FILTERS} selected={experienceFilter} onSelect={setExperienceFilter} />
        <MobileChoices title="Country / region" items={REGIONS} selected={regionFilter} onSelect={setRegionFilter} tone="amber" />
      </div>
      <div className="sticky bottom-0 space-y-2 border-t bg-white px-4 py-3 [padding-bottom:calc(.75rem+env(safe-area-inset-bottom,0px))]">
        <button onClick={onClose} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-all active:scale-[.98]">Show results</button>
        {hasActiveFilters && <button onClick={() => { clearAll(); onClose() }} className="w-full py-2 text-sm font-semibold text-red-500">Clear all filters</button>}
      </div>
    </div>
  </div>
}

function MobileChoices({ title, items, selected, onSelect, tone = 'blue' }) {
  return <div><h4 className="mb-2 text-[10px] font-bold uppercase text-gray-400">{title}</h4><div className="seller-mobile-choices">{items.map((item) => <button key={item.value} onClick={() => onSelect(item.value)} className={selected === item.value ? tone === 'amber' ? 'active amber' : 'active' : ''}>{item.label}</button>)}</div></div>
}

function Chip({ label, onRemove }) {
  return <span className="seller-active-chip">{label}<button onClick={onRemove} aria-label={`Remove ${label} filter`}><X /></button></span>
}
