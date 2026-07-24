import { ArrowLeft, Search, SlidersHorizontal, Target, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { searchMarketplace } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { CategoryCard, ManufacturerCard, ProductCard, SkeletonCards } from '../components/MarketplaceCards'
import UnifiedSearchInput from '../components/UnifiedSearchInput'

export default function SearchPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const [state, setState] = useState({ loading: false, data: null, error: '' })
  const activeQuery = params.get('q') || ''
  useEffect(() => {
    const next = query.trim()
    if (next === activeQuery) return undefined
    const timer = window.setTimeout(() => setParams(next ? { q: next } : {}, { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [activeQuery, query, setParams])
  useEffect(() => {
    let active = true
    if (!activeQuery) { Promise.resolve().then(() => active && setState({ loading: false, data: { products: [], sellers: [], categories: [] }, error: '' })); return () => { active = false } }
    Promise.resolve()
      .then(() => active && setState((current) => ({ ...current, loading: true, error: '' })))
      .then(() => searchMarketplace(activeQuery))
      .then((data) => active && setState({ loading: false, data, error: '' }))
      .catch((error) => active && setState({ loading: false, data: null, error: error.message }))
    return () => { active = false }
  }, [activeQuery])
  function submit(value) { setParams(value ? { q: value } : {}) }
  const total = ['products', 'sellers', 'categories', 'subcategories', 'services', 'rfqs'].reduce((sum, key) => sum + (state.data?.[key]?.length || 0), 0)
  const categoryResults = [...(state.data?.categories || []), ...(state.data?.subcategories || [])]
  return <AppShell><div className="search-page container"><button className="back-link" onClick={() => navigate('/home')}><ArrowLeft /> Marketplace home</button><div className="search-page__head"><div><span className="eyebrow">Intelligent marketplace search</span><h1>{activeQuery ? `Results for “${activeQuery}”` : 'What are you sourcing?'}</h1><p>{activeQuery && !state.loading ? `${total} relevant marketplace matches across products, businesses and services` : 'Search products, manufacturers, services, categories, industries, brands and locations.'}</p></div><button className="filter-button" onClick={() => navigate(`/products?q=${encodeURIComponent(activeQuery)}`)}><SlidersHorizontal /> Product filters</button></div><UnifiedSearchInput className="search-page__unified" autoFocus value={query} onChange={setQuery} onSubmit={submit} placeholder="Try “steel pipe”, a company, service, brand or location" showSubmit />{state.error && <div className="inline-error"><span>{state.error}</span></div>}{state.loading ? <div className="product-grid"><SkeletonCards count={8} /></div> : activeQuery && total === 0 ? <div className="empty-results"><Search /><h2>No strong matches yet</h2><p>Try a broader product name, industry, brand or supplier location.</p></div> : <>{!!categoryResults.length && <Result title="Categories and subcategories"><div className="category-grid">{categoryResults.map((item) => <CategoryCard key={`${item.type || 'category'}-${item._id || item.id}`} category={item.raw || item} onClick={() => item.href ? navigate(item.href) : setParams({ q: item.name || item.label })} />)}</div></Result>}{!!state.data?.products?.length && <Result title="Products"><div className="product-grid">{state.data.products.map((item) => <ProductCard key={item._id || item.id} product={item.raw || item} />)}</div></Result>}{!!state.data?.sellers?.length && <Result title="Manufacturers and suppliers"><div className="manufacturer-grid">{state.data.sellers.map((item) => <ManufacturerCard key={item._id || item.id} seller={item.raw || item} />)}</div></Result>}{!!state.data?.services?.length && <Result title="Related trade services"><div className="search-entity-grid">{state.data.services.map((item) => <button onClick={() => navigate(item.href)} key={item.id}><i><Wrench /></i><span><b>{item.label}</b><small>{item.meta}</small></span></button>)}</div></Result>}{!!state.data?.rfqs?.length && <Result title="Related buyer requirements"><div className="search-entity-grid">{state.data.rfqs.map((item) => <button onClick={() => navigate(item.href)} key={item.id}><i><Target /></i><span><b>{item.label}</b><small>{item.meta}</small></span></button>)}</div></Result>}</>}</div></AppShell>
}
function Result({ title, children }) { return <section className="result-section"><h2>{title}</h2>{children}</section> }
