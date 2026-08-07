import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchCategoryDetails, fetchProducts } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { ProductCard, SkeletonCards } from '../components/MarketplaceCards'
import useAsyncData from '../hooks/useAsyncData'

export default function CategoryDetailsPage() {
  const { categoryId } = useParams()
  const details = useAsyncData(useCallback(() => fetchCategoryDetails(categoryId), [categoryId]))
  const category = details.data?.category
  const products = useAsyncData(useCallback(async () => {
    const initial = await fetchCategoryDetails(categoryId)
    if (initial.products?.length) return initial.products
    const result = await fetchProducts({ category: initial.category?.name || categoryId, limit: 30 })
    return result.products
  }, [categoryId]))
  return <AppShell><div className="listing-page container"><header className="category-detail-head">{category?.image && <img src={category.image} alt="" />}<div><span className="eyebrow">Product category</span><h1>{category?.name || 'Category'}</h1><p>{category?.description || 'Browse live products and suppliers in this category.'}</p></div></header>{category?.subcategories?.length > 0 && <div className="subcategory-row">{category.subcategories.map((item) => <Link key={item._id || item.slug || item.name} to={`/products?category=${encodeURIComponent(item.name)}`}>{item.name}</Link>)}</div>}<div className="compact-heading"><h2>Products in {category?.name || 'this category'}</h2><Link to={`/products?category=${encodeURIComponent(category?.name || categoryId)}`}>View all</Link></div><div className="product-grid">{products.loading ? <SkeletonCards count={8} /> : products.data?.map((item) => <ProductCard key={item._id || item.id} product={item} />)}</div></div></AppShell>
}
