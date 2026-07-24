import { ArrowLeft, BadgeCheck, Layers3, SearchX, Sparkles } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchProductDetails, fetchRelatedProducts } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { ProductCard, SafeImage, SkeletonCards } from '../components/MarketplaceCards'
import useAsyncData from '../hooks/useAsyncData'

export default function SimilarSearchPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const query = useAsyncData(useCallback(async () => {
    const [details, products] = await Promise.all([
      fetchProductDetails(productId),
      fetchRelatedProducts(productId),
    ])
    return { source: details.product, products }
  }, [productId]))

  const source = query.data?.source || {}
  const products = query.data?.products || []
  return <AppShell><main className="listing-page container related-search-page">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Product details</button>
    <header className="related-search-hero">
      <div className="related-search-source"><SafeImage src={source.image || source.images?.[0]} alt={source.name || ''} /></div>
      <div><span className="eyebrow"><Sparkles /> Ranked marketplace matches</span><h1>Products related to {source.name || 'your selection'}</h1><p>Results are ranked by category, subcategory, product name, keywords, tags, industry, manufacturer type and specifications.</p><div className="related-signal-list">{[source.category, source.subcategory, source.brand, source.productType].filter(Boolean).map((value) => <span key={String(value)}><BadgeCheck /> {typeof value === 'object' ? value.name : value}</span>)}</div></div>
    </header>
    {query.loading ? <div className="product-grid"><SkeletonCards count={8} /></div> : query.error ? <div className="inline-error">{query.error.message}</div> : products.length ? <>
      <div className="compact-heading"><h2><Layers3 /> Best related products</h2><span>{products.length} relevant matches</span></div>
      <div className="product-grid">{products.map((item) => <article className="related-product-result" key={item._id || item.id}><ProductCard product={item} />{item.relevanceReasons?.length > 0 && <div>{item.relevanceReasons.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}</div>}</article>)}</div>
    </> : <div className="empty-results"><SearchX /><h2>No strong related products found</h2><p>We excluded weak and unrelated matches. Browse the source category to discover more products.</p>{source.category && <Link className="button button--primary" to={`/products?category=${encodeURIComponent(typeof source.category === 'object' ? source.category.name : source.category)}`}>Browse {typeof source.category === 'object' ? source.category.name : source.category}</Link>}</div>}
  </main></AppShell>
}
