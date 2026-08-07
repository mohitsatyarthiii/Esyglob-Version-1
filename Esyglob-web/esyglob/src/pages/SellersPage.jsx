import { Factory, PackageCheck, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { fetchSellers } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { SkeletonCards } from '../components/MarketplaceCards'
import { MarketplaceError } from '../components/MarketplaceFeedback'
import SellerListingCard from '../components/SellerListingCard'
import { normalizeSellerCategories } from '../components/sellerPresentation'
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
  const query = useAsyncData(loader, { refreshOnAddressChange: true })
  const allSellers = useMemo(() => query.data || [], [query.data])
  const categoryOptions = useMemo(() => {
    const counts = new Map()
    allSellers.forEach((seller) => normalizeSellerCategories(seller.businessCategories || seller.productCategories || seller.categories || seller.industries, seller.products)
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
      const categories = normalizeSellerCategories(seller.businessCategories || seller.productCategories || seller.categories || seller.industries, seller.products)
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
      <section className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-[#10294b] to-blue-900 text-white">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-6 md:py-9">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-blue-300">Verified global supply network</span>
            <h1 className="mt-2 max-w-3xl text-2xl font-extrabold tracking-tight text-white md:text-4xl">Find manufacturers built for serious B2B trade</h1>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300 md:text-sm">Compare business credentials, export capability, response performance and real product catalogs in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-200">
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3"><ShieldCheck size={14} className="text-emerald-300" /> Verified profiles</span>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3"><PackageCheck size={14} className="text-blue-300" /> Live catalogs</span>
          </div>
        </div>
      </section>
      <div className="relative z-20 border-b border-gray-200 bg-white shadow-sm">
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
            {query.error
              ? <MarketplaceError error={query.error} onRetry={query.reload} title="Supplier profiles are temporarily unavailable." />
              : query.loading
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
