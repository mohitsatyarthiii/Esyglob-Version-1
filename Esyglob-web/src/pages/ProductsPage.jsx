// pages/ProductsPage.jsx
import { Search, ChevronDown, X, Package, Grid3X3, Filter, ArrowUpDown, Check, Star } from 'lucide-react';
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchProducts, fetchCategories } from '../api/marketplace';
import AppShell from '../components/AppShell';
import { ProductCard, SkeletonCards, SafeImage } from '../components/MarketplaceCards';
import { PageHead } from '../components/PageHead';
import useAsyncData from '../hooks/useAsyncData';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

const PRICE_RANGES = [
  { label: 'Under ₹1,000', min: 0, max: 1000 },
  { label: '₹1,000 - ₹5,000', min: 1000, max: 5000 },
  { label: '₹5,000 - ₹20,000', min: 5000, max: 20000 },
  { label: '₹20,000 - ₹50,000', min: 20000, max: 50000 },
  { label: 'Above ₹50,000', min: 50000, max: null },
];

export default function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const mainRef = useRef(null);

  const category = params.get('category') || '';
  const subcategory = params.get('subcategory') || '';
  const sort = params.get('sort') || 'latest';
  const q = params.get('q') || '';
  const priceRange = params.get('priceRange') || '';
  const verifiedOnly = params.get('verified') === 'true';
  const minRating = params.get('minRating') || '';

  const categoriesQuery = useAsyncData(fetchCategories);

  const loader = useCallback(
    () =>
      fetchProducts({
        q,
        category,
        subcategory,
        sort,
        limit: 40,
        ...(priceRange && { priceRange }),
        ...(verifiedOnly && { verifiedOnly: true }),
        ...(minRating && { minRating: Number(minRating) }),
      }),
    [q, category, subcategory, sort, priceRange, verifiedOnly, minRating]
  );
  const productsQuery = useAsyncData(loader);

  const categories = useMemo(() => categoriesQuery.data || [], [categoriesQuery.data]);
  const selectedCategory = useMemo(
    () => categories.find((cat) => (cat.slug || cat.name) === category) || null,
    [categories, category]
  );
  const subcategories = useMemo(() => selectedCategory?.subcategories || [], [selectedCategory]);
  const products = useMemo(() => productsQuery.data?.products || [], [productsQuery.data]);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [params]);

  function updateParams(updates) {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === false) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    if (!updates.page) next.delete('page');
    setParams(next);
  }

  function submit(e) {
    e.preventDefault();
    updateParams({ q: search.trim() || '' });
  }

  function clearAllFilters() {
    setSearch('');
    setParams({});
  }

  const hasActiveFilters = category || subcategory || q || sort !== 'latest' || priceRange || verifiedOnly || minRating;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1400px] bg-gray-50">
        {/* ─── Desktop Sidebar Filters ──────────────────────────── */}
        <aside className="sticky top-0 hidden h-[calc(100vh-64px)] w-[240px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white scrollbar-hide lg:block xl:w-[260px]">
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Filters</h3>
              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="text-[10px] font-bold text-red-500 hover:text-red-600">
                  Reset all
                </button>
              )}
            </div>

            {/* Categories */}
            <div className="mb-5">
              <h4 className="mb-2 text-[11px] font-bold text-gray-700 uppercase tracking-wider">Categories</h4>
              <div className="space-y-0.5">
                <button
                  onClick={() => updateParams({ category: '' })}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold transition-all ${
                    !category ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Grid3X3 size={15} />
                  All Products
                </button>
                {categoriesQuery.loading
                  ? Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-100" />
                    ))
                  : categories.map((cat) => {
                      const isActive = category === (cat.slug || cat.name);
                      return (
                        <button
                          key={cat._id || cat.slug}
                          onClick={() => updateParams({ category: cat.slug || cat.name, subcategory: '' })}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all ${
                            isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <SafeImage src={cat.image || cat.icon} alt="" className="h-6 w-6 flex-shrink-0 rounded-full bg-gray-100 object-cover" />
                          <span className="flex-1 truncate text-left">{cat.name}</span>
                          {cat.productCount > 0 && <span className="text-[10px] text-gray-400">{cat.productCount}</span>}
                        </button>
                      );
                    })}
              </div>
            </div>

            {/* Price Range */}
            <div className="mb-5">
              <h4 className="mb-2 text-[11px] font-bold text-gray-700 uppercase tracking-wider">Price Range</h4>
              <div className="space-y-0.5">
                {PRICE_RANGES.map((range) => (
                  <button
                    key={range.label}
                    onClick={() => updateParams({ priceRange: priceRange === range.label ? '' : range.label })}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all ${
                      priceRange === range.label ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {range.label}
                    {priceRange === range.label && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Verified */}
            <div className="mb-5">
              <button
                onClick={() => updateParams({ verified: verifiedOnly ? '' : 'true' })}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold transition-all ${
                  verifiedOnly ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-all ${
                    verifiedOnly ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                  }`}
                >
                  {verifiedOnly && <Check size={10} className="text-white" />}
                </div>
                Verified Sellers Only
              </button>
            </div>

            {/* Min Rating */}
            <div>
              <h4 className="mb-2 text-[11px] font-bold text-gray-700 uppercase tracking-wider">Min Rating</h4>
              <div className="flex gap-1.5">
                {[4, 3, 2].map((r) => (
                  <button
                    key={r}
                    onClick={() => updateParams({ minRating: minRating === String(r) ? '' : String(r) })}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-all ${
                      minRating === String(r) ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Star size={12} className="fill-amber-400 text-amber-400" /> {r}+
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── Main Content ─────────────────────────────────────── */}
        <main ref={mainRef} className="h-[calc(100vh-64px)] flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto w-full max-w-5xl px-3 py-4 pb-24 md:px-6 md:py-6 md:pb-8 lg:px-6 lg:py-6">
            {/* Page Header */}
            <PageHead
              eyebrow="Marketplace Catalog"
              title={selectedCategory?.name || 'All Products'}
              description="Compare live products, pricing, MOQ and verified suppliers."
            />

            {/* ─── Toolbar ──────────────────────────────────────── */}
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <form onSubmit={submit} className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all focus-within:border-blue-300 focus-within:shadow-md">
                <Search size={16} className="text-gray-400 flex-shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="flex-1 border-0 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
                />
                <button type="submit" className="hidden rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 sm:block">
                  Search
                </button>
              </form>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 lg:hidden"
                >
                  <Filter size={14} />
                  Filters
                  {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowSort(!showSort)}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    <ArrowUpDown size={14} />
                    {SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Sort'}
                    <ChevronDown size={13} />
                  </button>
                  {showSort && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                        {SORT_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              updateParams({ sort: opt.value === 'latest' ? '' : opt.value });
                              setShowSort(false);
                            }}
                            className={`flex w-full items-center justify-between px-3 py-2.5 text-[12px] font-medium transition-colors hover:bg-gray-50 ${
                              sort === opt.value ? 'text-blue-600 font-semibold' : 'text-gray-600'
                            }`}
                          >
                            {opt.label}
                            {sort === opt.value && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Active Filters */}
            {hasActiveFilters && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {category && <FilterChip label={category} onRemove={() => updateParams({ category: '', subcategory: '' })} />}
                {subcategory && <FilterChip label={subcategory} onRemove={() => updateParams({ subcategory: '' })} />}
                {sort !== 'latest' && <FilterChip label={SORT_OPTIONS.find((o) => o.value === sort)?.label} onRemove={() => updateParams({ sort: '' })} />}
                {priceRange && <FilterChip label={priceRange} onRemove={() => updateParams({ priceRange: '' })} />}
                {verifiedOnly && <FilterChip label="Verified" onRemove={() => updateParams({ verified: '' })} />}
                {minRating && <FilterChip label={`${minRating}+ Stars`} onRemove={() => updateParams({ minRating: '' })} />}
                <button onClick={clearAllFilters} className="ml-1 text-[10px] font-bold text-red-500 hover:text-red-600">
                  Clear all
                </button>
              </div>
            )}

            {/* Subcategory Pills */}
            {subcategories.length > 0 && (
              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => updateParams({ subcategory: '' })}
                  className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold transition-all ${
                    !subcategory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All {selectedCategory?.name}
                </button>
                {subcategories.map((sub) => (
                  <button
                    key={sub._id || sub.slug}
                    onClick={() => updateParams({ subcategory: sub.slug || sub.name })}
                    className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold transition-all ${
                      subcategory === (sub.slug || sub.name) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            )}

            {/* ─── Products Grid ────────────────────────────────── */}
            {productsQuery.loading ? (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                <SkeletonCards count={12} variant="product" />
              </div>
            ) : products.length > 0 ? (
              <>
                <p className="mb-3 text-[10px] font-medium text-gray-400">
                  {productsQuery.data?.pagination?.total || products.length} products found
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                  {products.map((item) => (
                    <ProductCard key={item._id || item.id} product={item} />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <Package size={32} className="text-gray-300" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-gray-400">No products found</h3>
                <p className="mt-1 text-[11px] text-gray-400">
                  {hasActiveFilters ? 'Try adjusting your filters' : 'No products available yet'}
                </p>
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700">
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ─── Mobile Filters Drawer ──────────────────────────────── */}
      {showFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl bg-white animate-slideUp">
            {/* Header */}
            <div className="sticky top-0 z-10 pb-20 flex items-center justify-between border-b border-gray-100 bg-white/80 px-5 py-4 backdrop-blur-md rounded-t-2xl">
              <h3 className="text-base font-bold text-gray-900">Filters</h3>
              <button onClick={() => setShowFilters(false)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Filter Content */}
            <div className="space-y-5 p-5 pb-28">
              {/* Sort */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sort By</h4>
                <div className="flex flex-wrap gap-1.5">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateParams({ sort: opt.value === 'latest' ? '' : opt.value })}
                      className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                        sort === opt.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Categories</h4>
                <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto scrollbar-hide">
                  <button
                    onClick={() => updateParams({ category: '' })}
                    className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                      !category ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All Products
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat._id || cat.slug}
                      onClick={() => updateParams({ category: cat.slug || cat.name, subcategory: '' })}
                      className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                        category === (cat.slug || cat.name) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Price Range</h4>
                <div className="flex flex-wrap gap-1.5">
                  {PRICE_RANGES.map((range) => (
                    <button
                      key={range.label}
                      onClick={() => updateParams({ priceRange: priceRange === range.label ? '' : range.label })}
                      className={`rounded-full px-3 py-2 text-[11px] font-semibold transition-all ${
                        priceRange === range.label ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Rating */}
              <div>
                <h4 className="mb-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Min Rating</h4>
                <div className="flex gap-2">
                  {[4, 3, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => updateParams({ minRating: minRating === String(r) ? '' : String(r) })}
                      className={`flex items-center gap-1 rounded-full px-4 py-2 text-[11px] font-semibold transition-all ${
                        minRating === String(r) ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Star size={12} className="fill-amber-400 text-amber-400" /> {r}+
                    </button>
                  ))}
                </div>
              </div>

              {/* Verified */}
              <button
                onClick={() => updateParams({ verified: verifiedOnly ? '' : 'true' })}
                className={`flex w-full items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  verifiedOnly ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'
                }`}
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                  verifiedOnly ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                }`}>
                  {verifiedOnly && <Check size={12} className="text-white" />}
                </div>
                Verified Sellers Only
              </button>
            </div>

            {/* Sticky Bottom Buttons */}
            <div className="sticky bottom-0 z-10 border-t border-gray-100 bg-white px-5 py-4 space-y-2 rounded-b-2xl" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              <button
                onClick={() => setShowFilters(false)}
                className="w-full rounded-xl bg-gray-900 py-3.5 text-sm font-bold text-white hover:bg-gray-800 transition-colors active:scale-[0.98]"
              >
                Apply Filters
              </button>
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    clearAllFilters();
                    setShowFilters(false);
                  }}
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
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
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

// ─── Filter Chip Component ──────────────────────────────────────
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
