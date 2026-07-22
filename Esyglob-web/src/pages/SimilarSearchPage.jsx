import { Camera, Sparkles } from 'lucide-react'
import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { fetchProductDetails, searchByImage } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { CategoryBubble, ManufacturerCard, ProductCard, SkeletonCards } from '../components/MarketplaceCards'
import useAsyncData from '../hooks/useAsyncData'
import { PageHead } from '../components/PageHead'

export default function SimilarSearchPage() {
  const { productId } = useParams()
  const query = useAsyncData(useCallback(async () => {
    const details = await fetchProductDetails(productId)
    const image = details.product?.image || details.product?.images?.[0]
    if (!image) throw new Error('This product does not have an image for visual search.')
    return searchByImage(image)
  }, [productId]))
  return <AppShell><div className="listing-page container"><PageHead eyebrow="QR / image search" title="Visually similar marketplace matches" description="EsyGlob AI is using the selected product image with the existing marketplace search service." />{query.loading ? <div className="product-grid"><SkeletonCards count={8} /></div> : query.error ? <div className="inline-error">{query.error.message}</div> : <><div className="ai-answer"><Sparkles /><p>{query.data?.answer || 'Marketplace matches based on the product image.'}</p></div>{query.data?.products?.length > 0 && <Result title="Similar products"><div className="product-grid">{query.data.products.map((item) => <ProductCard key={item._id || item.id} product={item} />)}</div></Result>}{query.data?.sellers?.length > 0 && <Result title="Matching suppliers"><div className="manufacturer-grid">{query.data.sellers.map((item) => <ManufacturerCard key={item._id || item.id} seller={item} />)}</div></Result>}{query.data?.categories?.length > 0 && <Result title="Related categories"><div className="category-bubbles">{query.data.categories.map((item) => <CategoryBubble key={item._id || item.slug} category={item} />)}</div></Result>}{!query.data?.products?.length && !query.data?.sellers?.length && <div className="empty-results"><Camera /><h2>No visual matches returned</h2><p>Try the marketplace search with the product name or category.</p></div>}</>}</div></AppShell>
}
function Result({ title, children }) { return <section className="result-section"><h2>{title}</h2>{children}</section> }
