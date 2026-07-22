// pages/SellersPage.jsx
import { Search, Package, Filter, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { fetchSellers } from '../api/marketplace';
import AppShell from '../components/AppShell';
import { ManufacturerCard, SkeletonCards } from '../components/MarketplaceCards';
import useAsyncData from '../hooks/useAsyncData';
import { PageHead } from '../components/PageHead';

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
  { value: 'India', label: '🇮🇳 India' },
  { value: 'China', label: '🇨🇳 China' },
  { value: 'UAE', label: '🇦🇪 UAE' },
  { value: 'USA', label: '🇺🇸 USA' },
  { value: 'Vietnam', label: '🇻🇳 Vietnam' },
  { value: 'Turkey', label: '🇹🇷 Turkey' },
];

export default function SellersPage() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [sort, setSort] = useState('verified');
  const [showFilters, setShowFilters] = useState(false);

  const loader = useCallback(
    () =>
      fetchSellers({
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
  const hasFilters = typeFilter || regionFilter || sort !== 'verified';

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
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          
          {/* Page Header */}
          <PageHead
            eyebrow="EsyGlob Suppliers"
            title="Verified Manufacturers"
            description="Compare verification, trust, product depth and supplier capabilities."
          />

          {/* ─── Toolbar ────────────────────────────────────────── */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            {/* Search */}
            <form
              onSubmit={handleSubmit}
              className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all focus-within:border-blue-300 focus-within:shadow-md sm:px-4 sm:py-3"
            >
              <Search size={16} className="text-gray-400 flex-shrink-0 sm:size-[17px]" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search suppliers, products or countries..."
                className="flex-1 border-0 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-sm"
              />
              <button
                type="submit"
                className="hidden rounded-lg bg-blue-600 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 transition-colors sm:block"
              >
                Search
              </button>
            </form>

            {/* Filter + Sort Buttons */}
            <div className="flex items-center gap-2">
              {/* Mobile Filter Button */}
              <button
                onClick={() => setShowFilters(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 sm:hidden"
              >
                <Filter size={14} />
                Filters
                {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </button>

              {/* Type Filter (Desktop) */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="hidden rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer focus:outline-none focus:border-blue-300 sm:block"
              >
                {COMPANY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {/* Region Filter (Desktop) */}
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="hidden rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer focus:outline-none focus:border-blue-300 sm:block"
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              {/* Sort (Desktop) */}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="hidden rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer focus:outline-none focus:border-blue-300 sm:block"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filters */}
          {hasFilters && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {search && (
                <FilterChip label={`"${search}"`} onRemove={() => { setInput(''); setSearch(''); }} />
              )}
              {typeFilter && (
                <FilterChip label={COMPANY_TYPES.find(t => t.value === typeFilter)?.label} onRemove={() => setTypeFilter('')} />
              )}
              {regionFilter && (
                <FilterChip label={regionFilter} onRemove={() => setRegionFilter('')} />
              )}
              {sort !== 'verified' && (
                <FilterChip label={SORT_OPTIONS.find(o => o.value === sort)?.label} onRemove={() => setSort('verified')} />
              )}
              <button onClick={clearFilters} className="ml-1 text-[10px] font-bold text-red-500 hover:text-red-600">
                Clear all
              </button>
            </div>
          )}

          {/* Results Count */}
          {!query.loading && sellers.length > 0 && (
            <p className="mb-4 text-[10px] font-medium text-gray-400">
              {sellers.length} suppliers found
            </p>
          )}

          {/* ─── Sellers Grid ───────────────────────────────────── */}
          {query.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 lg:gap-5">
              <SkeletonCards count={6} variant="manufacturer" />
            </div>
          ) : sellers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4 lg:gap-5">
              {sellers.map((item) => (
                <ManufacturerCard key={item._id || item.id} seller={item} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Package size={32} className="text-gray-300" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-gray-400">No suppliers found</h3>
              <p className="mt-1 text-[11px] text-gray-400">
                {hasFilters ? 'Try adjusting your filters or search' : 'No verified suppliers available yet'}
              </p>
              {hasFilters && (
                <button onClick={clearFilters} className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700">
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Bottom spacing for mobile nav */}
          <div className="h-20 sm:h-8" />
        </div>
      </div>

      {/* ─── Mobile Filters Drawer ──────────────────────────────── */}
      {showFilters && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white animate-slideUp">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-5 py-4 rounded-t-2xl">
              <h3 className="text-base font-bold text-gray-900">Filters</h3>
              <button onClick={() => setShowFilters(false)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5 pb-28">
              {/* Sort */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sort By</h4>
                <div className="flex flex-wrap gap-1.5">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setSort(o.value)}
                      className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                        sort === o.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Company Type</h4>
                <div className="flex flex-wrap gap-1.5">
                  {COMPANY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTypeFilter(t.value)}
                      className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                        typeFilter === t.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Region */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Region</h4>
                <div className="flex flex-wrap gap-1.5">
                  {REGIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRegionFilter(r.value)}
                      className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                        regionFilter === r.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sticky Bottom */}
            <div className="sticky bottom-0 border-t border-gray-100 bg-white px-5 py-4 space-y-2" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              <button
                onClick={() => setShowFilters(false)}
                className="w-full rounded-xl bg-gray-900 py-3.5 text-sm font-bold text-white hover:bg-gray-800 active:scale-[0.98] transition-all"
              >
                Apply Filters
              </button>
              {hasFilters && (
                <button
                  onClick={() => { clearFilters(); setShowFilters(false); }}
                  className="w-full rounded-xl py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slideUp {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </AppShell>
  );
}

// ─── Filter Chip ─────────────────────────────────────────────────
function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700">
      {label}
      <button onClick={onRemove} className="hover:text-blue-900">
        <X size={12} />
      </button>
    </span>
  );
}
