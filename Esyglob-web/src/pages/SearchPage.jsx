import { ArrowLeft, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { searchMarketplace } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { CategoryCard, ManufacturerCard, ProductCard, SkeletonCards } from '../components/MarketplaceCards'

export default function SearchPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const [state, setState] = useState({ loading: false, data: null, error: '' })
  const activeQuery = params.get('q') || ''
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
  function submit(event) { event.preventDefault(); setParams(query.trim() ? { q: query.trim() } : {}) }
  const total = (state.data?.products?.length || 0) + (state.data?.sellers?.length || 0) + (state.data?.categories?.length || 0)
  return <AppShell><div className="search-page container"><button className="back-link" onClick={() => navigate('/home')}><ArrowLeft /> Marketplace home</button><div className="search-page__head"><div><span className="eyebrow">Marketplace search</span><h1>{activeQuery ? `Results for “${activeQuery}”` : 'What are you sourcing?'}</h1><p>{activeQuery && !state.loading ? `${total} matching marketplace records` : 'Search live products, suppliers and categories.'}</p></div><button className="filter-button" onClick={() => navigate(`/products?q=${encodeURIComponent(activeQuery)}`)}><SlidersHorizontal /> Product filters</button></div><form className="search-page__form" onSubmit={submit}><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by product, category or supplier" /><button>Search</button></form>{state.error && <div className="inline-error"><span>{state.error}</span></div>}{state.loading ? <div className="product-grid"><SkeletonCards count={8} /></div> : activeQuery && total === 0 ? <div className="empty-results"><Search /><h2>No strong matches yet</h2><p>Try a broader product name, industry or supplier location.</p></div> : <>{!!state.data?.categories?.length && <Result title="Categories"><div className="category-grid">{state.data.categories.map((item) => <CategoryCard key={item._id || item.id} category={item.raw || item} onOpen={() => setParams({ q: item.name || item.label })} />)}</div></Result>}{!!state.data?.products?.length && <Result title="Products"><div className="product-grid">{state.data.products.map((item) => <ProductCard key={item._id || item.id} product={item.raw || item} />)}</div></Result>}{!!state.data?.sellers?.length && <Result title="Suppliers"><div className="manufacturer-grid">{state.data.sellers.map((item) => <ManufacturerCard key={item._id || item.id} seller={item.raw || item} />)}</div></Result>}</>}</div></AppShell>
}
function Result({ title, children }) { return <section className="result-section"><h2>{title}</h2>{children}</section> }
