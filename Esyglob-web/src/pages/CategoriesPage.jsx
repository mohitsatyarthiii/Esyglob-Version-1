// pages/CategoriesPage.jsx
import { Search, Package, Truck, Zap, Grid3X3, ChevronRight } from 'lucide-react';
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { SafeImage } from '../components/MarketplaceCards';
import { fetchCategories } from '../api/marketplace';
import useAsyncData from '../hooks/useAsyncData';

export default function CategoriesPage() {
  const query = useAsyncData(fetchCategories);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);

  const categories = useMemo(() => query.data || [], [query.data]);

  const filteredCategories = useMemo(
    () => search
      ? categories.filter((cat) => cat.name?.toLowerCase().includes(search.toLowerCase()))
      : categories,
    [categories, search]
  );

  const selectedCategory = useMemo(
    () => categories.find((cat) => (cat._id || cat.slug) === selectedId) || null,
    [categories, selectedId]
  );

  const displayItems = useMemo(() => {
    if (!selectedCategory) return filteredCategories;
    return selectedCategory.subcategories || [];
  }, [selectedCategory, filteredCategories]);

  // Scroll to top & sidebar active item when category changes
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    // Scroll sidebar to active item
    if (sidebarRef.current && selectedId) {
      const activeEl = sidebarRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedId]);

  const handleCategoryPress = useCallback((category) => {
    navigate(`/products?category=${encodeURIComponent(category.slug || category.name)}`);
  }, [navigate]);

  const handleSubcategoryPress = useCallback((subcategory) => {
    if (!selectedCategory) return;
    navigate(`/products?category=${encodeURIComponent(selectedCategory.slug || selectedCategory.name)}&subcategory=${encodeURIComponent(subcategory.slug || subcategory.name)}`);
  }, [navigate, selectedCategory]);

  return (
    <AppShell>
      {/* Fixed height container - accounts for header + bottom nav */}
      <div className="flex h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)] bg-gray-50">
        
        {/* ─── Sidebar ──────────────────────────────────────────── */}
        <aside 
          ref={sidebarRef}
          className="h-full w-[88px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white scrollbar-hide sm:w-[100px] md:w-[200px] lg:w-[220px]"
        >
          <div className="py-1">
            {/* All Categories */}
            <button
              onClick={() => setSelectedId(null)}
              data-active={!selectedId}
              className={`relative flex w-full items-center gap-2 px-2 py-2.5 transition-all sm:px-2.5 sm:py-3 md:gap-3 md:px-4 md:py-3 ${
                !selectedId ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {!selectedId && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-600" />}
              <div className={`hidden md:flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${!selectedId ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <Grid3X3 size={16} />
              </div>
              <span className="text-[10px] font-semibold leading-tight sm:text-[11px] md:text-sm">
                All Categories
              </span>
            </button>

            <div className="mx-2 my-1 border-t border-gray-100 md:mx-3" />

            {/* Category List */}
            {filteredCategories.map((cat) => {
              const id = cat._id || cat.slug;
              const isActive = id === selectedId;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedId(id)}
                  data-active={isActive}
                  className={`relative flex w-full items-center gap-2 px-2 py-2.5 transition-all sm:px-2.5 sm:py-3 md:gap-3 md:px-4 md:py-3 ${
                    isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-600" />}
                  
                  {/* Image - desktop only */}
                  <div className="hidden md:block flex-shrink-0">
                    <SafeImage
                      src={cat.image || cat.icon}
                      alt=""
                      className={`h-8 w-8 rounded-full border-2 object-cover ${isActive ? 'border-blue-200' : 'border-transparent'}`}
                      fallback={
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                          <Package size={14} className={isActive ? 'text-blue-500' : 'text-gray-400'} />
                        </div>
                      }
                    />
                  </div>

                  <span className={`flex-1 text-left line-clamp-2 leading-snug text-[10px] sm:text-[11px] md:text-[13px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {cat.name}
                  </span>

                  {isActive && <ChevronRight size={12} className="flex-shrink-0 md:hidden" />}
                </button>
              );
            })}

            {/* Bottom spacer for sidebar */}
            <div className="h-16 md:h-8" />
          </div>
        </aside>

        {/* ─── Main Content ─────────────────────────────────────── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="mx-auto w-full max-w-4xl px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5">
            
            {/* Search Bar */}
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-all focus-within:border-blue-300 focus-within:shadow-md sm:px-4 sm:py-2.5">
              <Search size={15} className="text-gray-400 flex-shrink-0 sm:size-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories..."
                className="flex-1 border-0 bg-transparent text-[12px] text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-[13px]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-[10px] font-semibold text-blue-600 sm:text-[11px]">
                  Clear
                </button>
              )}
            </div>

            {/* Express Banner */}
            <div className="mb-3 flex items-center justify-between rounded-xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-blue-950 p-3 text-white sm:rounded-2xl sm:p-4">
              <div className="flex-1">
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[8px] font-bold tracking-wide sm:text-[10px]">
                  <Zap size={10} className="fill-amber-400 text-amber-400" /> EXPRESS
                </span>
                <h3 className="mt-1 text-sm font-extrabold sm:text-base">Fastest Delivery</h3>
                <p className="mt-0.5 text-[9px] text-indigo-200/80 sm:text-[11px]">in just 5 days · No import charges</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 sm:h-10 sm:w-10">
                <Truck size={16} className="text-white sm:size-5" />
              </div>
            </div>

            {/* Section Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-gray-900 sm:text-base">
                {selectedCategory?.name || 'All Categories'}
              </h2>
              {selectedCategory && (
                <button
                  onClick={() => handleCategoryPress(selectedCategory)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-all sm:px-3 sm:text-[11px]"
                >
                  View All <ChevronRight size={12} />
                </button>
              )}
            </div>

            {/* ─── Category Grid ─────────────────────────────────── */}
            {query.loading ? (
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="flex flex-col items-center animate-pulse">
                    <div className="h-[60px] w-[60px] rounded-full bg-gray-100 sm:h-[72px] sm:w-[72px] md:h-[88px] md:w-[88px]" />
                    <div className="mt-2 h-2.5 w-14 rounded bg-gray-100 sm:h-3 sm:w-16" />
                  </div>
                ))}
              </div>
            ) : displayItems.length > 0 ? (
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
                {displayItems.map((item) => {
                  const img = item.image || item.icon;
                  return (
                    <button
                      key={item._id || item.slug}
                      onClick={() => selectedCategory ? handleSubcategoryPress(item) : handleCategoryPress(item)}
                      className="group flex flex-col items-center active:scale-95 transition-transform"
                    >
                      <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100 transition-all group-hover:shadow-md group-hover:ring-2 group-hover:ring-blue-200 sm:h-[72px] sm:w-[72px] md:h-[88px] md:w-[88px]">
                        {img ? (
                          <SafeImage src={img} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                          <Package size={22} className="text-blue-500 sm:size-[26px] md:size-8" />
                        )}
                      </div>
                      <span className="mt-1.5 text-[9px] font-semibold text-gray-800 text-center leading-snug line-clamp-2 max-w-[65px] group-hover:text-blue-600 transition-colors sm:text-[10px] sm:max-w-[75px] sm:mt-2 md:text-xs md:max-w-[100px]">
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Package size={32} className="text-gray-300" />
                <h3 className="mt-3 text-sm font-bold text-gray-400">
                  {search ? 'No matching categories' : 'No subcategories yet'}
                </h3>
                {search && (
                  <button onClick={() => setSearch('')} className="mt-2 text-xs font-semibold text-blue-600">
                    Clear search
                  </button>
                )}
              </div>
            )}

            {/* Bottom spacer for mobile navigation */}
            <div className="h-20 sm:h-6" />
          </div>
        </main>
      </div>

      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </AppShell>
  );
}