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
  Search,
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
import useAsyncData from '../hooks/useAsyncData'

const COMPANY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'exporter', label: 'Exporter' },
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
  const [typeFilter, setTypeFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [sort, setSort] = useState('verified')
  const [showFilters, setShowFilters] = useState(false)

  const loader = useCallback(
    () => fetchSellers({ limit: 20, search, sort, ...(typeFilter && { companyType: typeFilter }), ...(regionFilter && { region: regionFilter }) }),
    [search, sort, typeFilter, regionFilter],
  )
  const query = useAsyncData(loader)
  const sellers = useMemo(() => query.data || [], [query.data])
  const hasActiveFilters = Boolean(typeFilter || regionFilter || sort !== 'verified' || search)

  function handleSubmit(event) {
    event.preventDefault()
    setSearch(input.trim())
  }

  function clearAll() {
    setInput('')
    setSearch('')
    setTypeFilter('')
    setRegionFilter('')
    setSort('verified')
  }

  return <AppShell>
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-3">
            <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 transition-all focus-within:border-blue-500">
              <Search size={16} className="flex-shrink-0 text-gray-400" />
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search suppliers..." aria-label="Search suppliers" className="flex-1 border-none bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400" />
              {input && <button type="button" onClick={() => setInput('')} aria-label="Clear search" className="rounded-full p-0.5 hover:bg-gray-100"><X size={14} className="text-gray-400" /></button>}
            </form>
            <button onClick={() => setShowFilters(true)} className="relative flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50">
              <SlidersHorizontal size={16} /><span className="hidden sm:inline">Filter</span>
              {hasActiveFilters && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />}
            </button>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort suppliers" className="hidden cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none sm:block">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {hasActiveFilters && <div className="mt-2 flex flex-wrap items-center gap-2">
            {search && <Chip label={`"${search}"`} onRemove={() => { setInput(''); setSearch('') }} />}
            {typeFilter && <Chip label={COMPANY_TYPES.find((item) => item.value === typeFilter)?.label} onRemove={() => setTypeFilter('')} />}
            {regionFilter && <Chip label={regionFilter} onRemove={() => setRegionFilter('')} />}
            <button onClick={clearAll} className="ml-1 text-xs font-medium text-gray-500 hover:text-red-500">Clear all</button>
          </div>}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex gap-6">
          <aside className="hidden w-48 flex-shrink-0 lg:block">
            <div className="sticky top-20 space-y-4">
              <FilterGroup title="Company Type" items={COMPANY_TYPES} selected={typeFilter} onSelect={setTypeFilter} tone="blue" />
              <FilterGroup title="Region" items={REGIONS.filter((item) => item.value)} selected={regionFilter} onSelect={setRegionFilter} tone="amber" />
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

    {showFilters && <MobileFilters sort={sort} setSort={setSort} typeFilter={typeFilter} setTypeFilter={setTypeFilter} regionFilter={regionFilter} setRegionFilter={setRegionFilter} hasActiveFilters={hasActiveFilters} clearAll={clearAll} onClose={() => setShowFilters(false)} />}
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

function MobileFilters({ sort, setSort, typeFilter, setTypeFilter, regionFilter, setRegionFilter, hasActiveFilters, clearAll, onClose }) {
  return <div className="fixed inset-0 z-50 lg:hidden">
    <button className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close filters" />
    <div className="seller-filter-sheet absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white">
      <div className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-3"><h3 className="text-sm font-bold text-gray-800">Filters & Sorting</h3><button onClick={onClose} aria-label="Close filters" className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"><X size={16} /></button></div>
      <div className="space-y-5 p-4 pb-24">
        <MobileChoices title="Sort by" items={SORT_OPTIONS} selected={sort} onSelect={setSort} />
        <MobileChoices title="Company type" items={COMPANY_TYPES} selected={typeFilter} onSelect={setTypeFilter} />
        <MobileChoices title="Region" items={REGIONS.filter((item) => item.value)} selected={regionFilter} onSelect={setRegionFilter} tone="amber" />
      </div>
      <div className="sticky bottom-0 space-y-2 border-t bg-white px-4 py-3 [padding-bottom:calc(.75rem+env(safe-area-inset-bottom,0px))]">
        <button onClick={onClose} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-all active:scale-[.98]">Show results</button>
        {hasActiveFilters && <button onClick={() => { clearAll(); onClose() }} className="w-full py-2 text-sm font-semibold text-red-500">Clear all filters</button>}
      </div>
    </div>
  </div>
}

function MobileChoices({ title, items, selected, onSelect, tone = 'blue' }) {
  return <div><h4 className="mb-2 text-[10px] font-bold uppercase text-gray-400">{title}</h4><div className="flex flex-wrap gap-1.5">{items.map((item) => <button key={item.value} onClick={() => onSelect(item.value)} className={`rounded-full px-3 py-2 text-xs font-semibold ${selected === item.value ? tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{item.label}</button>)}</div></div>
}

function Chip({ label, onRemove }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">{label}<button onClick={onRemove} aria-label={`Remove ${label} filter`} className="rounded-full p-0.5 hover:bg-blue-100"><X size={9} /></button></span>
}
