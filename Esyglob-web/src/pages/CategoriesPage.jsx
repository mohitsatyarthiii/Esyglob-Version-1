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

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (sidebarRef.current && selectedId) {
      const activeEl = sidebarRef.current.querySelector('[data-active="true"]');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      {/* ─── Mobile Layout ──────────────────────────────────────── */}
      <div className="flex h-[calc(100vh-56px)] bg-gray-50 sm:hidden">
        <aside className="h-full w-[88px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white scrollbar-hide">
          <div className="py-1">
            <button
              onClick={() => setSelectedId(null)}
              className={`relative flex w-full flex-col items-center gap-0.5 py-3 ${
                !selectedId ? 'bg-blue-50 text-blue-600' : 'text-gray-500'
              }`}
            >
              {!selectedId && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-600" />}
              <Grid3X3 size={16} />
              <span className="text-[10px] font-semibold">All</span>
            </button>
            <div className="mx-2 my-1 border-t border-gray-100" />
            {filteredCategories.map((cat) => {
              const id = cat._id || cat.slug;
              const isActive = id === selectedId;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedId(id)}
                  data-active={isActive}
                  className={`relative flex w-full flex-col items-center gap-0.5 py-3 ${
                    isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-500'
                  }`}
                >
                  {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-blue-600" />}
                  <span className={`text-[10px] leading-tight text-center line-clamp-2 ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {cat.name}
                  </span>
                </button>
              );
            })}
            <div className="h-16" />
          </div>
        </aside>

        <main ref={mainRef} className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="p-3">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
              <Search size={15} className="text-gray-400 flex-shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories..." className="flex-1 border-0 bg-transparent text-[12px] focus:outline-none" />
              {search && <button onClick={() => setSearch('')} className="text-[10px] font-semibold text-blue-600">Clear</button>}
            </div>

            <div className="mb-3 flex items-center justify-between rounded-xl bg-gradient-to-br from-indigo-950 to-blue-950 p-3 text-white">
              <div className="flex-1">
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[9px] font-bold"><Zap size={9} /> EXPRESS</span>
                <h3 className="mt-1 text-sm font-extrabold">Fastest Delivery</h3>
                <p className="mt-0.5 text-[9px] text-indigo-200/80">in just 5 days</p>
              </div>
              <Truck size={18} className="text-white/80" />
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-gray-900">{selectedCategory?.name || 'All Categories'}</h2>
              {selectedCategory && (
                <button onClick={() => handleCategoryPress(selectedCategory)} className="flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-[10px] font-bold text-blue-600">
                  View All <ChevronRight size={12} />
                </button>
              )}
            </div>

            {query.loading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="flex flex-col items-center animate-pulse">
                    <div className="h-[64px] w-[64px] rounded-full bg-gray-100" />
                    <div className="mt-2 h-2.5 w-14 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : displayItems.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {displayItems.map((item) => {
                  const img = item.image || item.icon;
                  return (
                    <button key={item._id || item.slug} onClick={() => selectedCategory ? handleSubcategoryPress(item) : handleCategoryPress(item)} className="group flex flex-col items-center active:scale-95 transition-transform">
                      <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-gray-100 group-hover:shadow-md group-hover:ring-blue-200 transition-all">
                        {img ? <SafeImage src={img} alt="" className="h-full w-full rounded-full object-cover" /> : <Package size={22} className="text-blue-500" />}
                      </div>
                      <span className="mt-1.5 text-[9px] font-semibold text-gray-800 text-center leading-snug line-clamp-2 max-w-[65px] group-hover:text-blue-600">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center">
                <Package size={32} className="mx-auto text-gray-300" />
                <h3 className="mt-3 text-sm font-bold text-gray-400">{search ? 'No matching categories' : 'No subcategories yet'}</h3>
              </div>
            )}
            <div className="h-20" />
          </div>
        </main>
      </div>

      {/* ─── Desktop Layout ──────────────────────────────────────── */}
      <div className="hidden sm:block bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          
          {/* Search Bar */}
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm max-w-xl">
            <Search size={18} className="text-gray-400 flex-shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories..." className="flex-1 border-0 bg-transparent text-sm focus:outline-none" />
            {search && <button onClick={() => setSearch('')} className="text-xs font-semibold text-blue-600">Clear</button>}
          </div>

          {/* Content Row */}
          <div className="flex gap-5 lg:gap-6">
            
            {/* Sidebar */}
            <aside ref={sidebarRef} className="w-[220px] lg:w-[250px] flex-shrink-0 rounded-2xl border border-gray-200 bg-white overflow-hidden" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
              <div className="p-3 lg:p-4">
                <button
                  onClick={() => setSelectedId(null)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                    !selectedId ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${!selectedId ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Grid3X3 size={16} />
                  </div>
                  All Categories
                </button>
                <div className="my-2 border-t border-gray-100" />
                {filteredCategories.map((cat) => {
                  const id = cat._id || cat.slug;
                  const isActive = id === selectedId;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedId(id)}
                      data-active={isActive}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all ${
                        isActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <SafeImage
                        src={cat.image || cat.icon}
                        alt=""
                        className="h-8 w-8 flex-shrink-0 rounded-full border-2 border-gray-100 object-cover"
                      />
                      <span className="flex-1 text-left line-clamp-2 leading-snug">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main Content */}
            <main ref={mainRef} className="flex-1 min-w-0">
              {/* Banner */}
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-blue-950 p-5 text-white lg:p-6">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1 text-[10px] font-bold tracking-wide">
                    <Zap size={12} className="fill-amber-400 text-amber-400" /> EXPRESS
                  </span>
                  <h3 className="mt-2 text-lg font-extrabold lg:text-xl">Fastest Delivery</h3>
                  <p className="mt-1 text-sm text-indigo-200/80">in just 5 days · No import charges</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 lg:h-14 lg:w-14">
                  <Truck size={24} className="text-white lg:size-7" />
                </div>
              </div>

              {/* Section Header */}
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-gray-900 lg:text-xl">{selectedCategory?.name || 'All Categories'}</h2>
                  {selectedCategory?.description && <p className="mt-1 text-xs text-gray-500">{selectedCategory.description}</p>}
                </div>
                {selectedCategory && (
                  <button onClick={() => handleCategoryPress(selectedCategory)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-all">
                    View All <ChevronRight size={14} />
                  </button>
                )}
              </div>

              {/* Grid */}
              {query.loading ? (
                <div className="grid grid-cols-4 gap-4 lg:grid-cols-5 lg:gap-5">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="flex flex-col items-center animate-pulse">
                      <div className="h-[100px] w-[100px] rounded-full bg-gray-100 lg:h-[110px] lg:w-[110px]" />
                      <div className="mt-3 h-3 w-20 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : displayItems.length > 0 ? (
                <div className="grid grid-cols-4 gap-4 lg:grid-cols-5 lg:gap-5">
                  {displayItems.map((item) => {
                    const img = item.image || item.icon;
                    return (
                      <button key={item._id || item.slug} onClick={() => selectedCategory ? handleSubcategoryPress(item) : handleCategoryPress(item)} className="group flex flex-col items-center">
                        <div className="flex h-[100px] w-[100px] items-center justify-center rounded-full bg-white shadow-md ring-1 ring-gray-100 group-hover:shadow-lg group-hover:ring-2 group-hover:ring-blue-200 transition-all lg:h-[110px] lg:w-[110px]">
                          {img ? <SafeImage src={img} alt="" className="h-full w-full rounded-full object-cover" /> : <Package size={36} className="text-blue-500 lg:size-10" />}
                        </div>
                        <span className="mt-3 text-xs font-semibold text-gray-800 text-center leading-snug line-clamp-2 max-w-[110px] group-hover:text-blue-600 transition-colors lg:text-sm lg:max-w-[120px]">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-24 text-center">
                  <Package size={40} className="mx-auto text-gray-300" />
                  <h3 className="mt-4 text-base font-bold text-gray-400">{search ? 'No matching categories' : 'No subcategories yet'}</h3>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>

      <style>{`.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}.scrollbar-hide::-webkit-scrollbar{display:none}`}</style>
    </AppShell>
  );
}