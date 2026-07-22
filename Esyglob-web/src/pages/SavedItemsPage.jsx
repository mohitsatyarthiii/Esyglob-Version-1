import { Heart, Search, Store } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSavedItems, toggleSavedItem } from '../api/marketplace'
import AppShell from '../components/AppShell'
import { ProductCard, SafeImage } from '../components/MarketplaceCards'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { displayName, resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

export default function SavedItemsPage() {
  const query = useAsyncData(useCallback(() => fetchSavedItems(), [])); const [tab, setTab] = useState('product'); const [search, setSearch] = useState('')
  const rows = useMemo(() => (query.data || []).filter((item) => item.itemType === tab).filter((item) => { const entity = item.productId || item.sellerId || {}; return !search || String(entity.name || entity.companyName || entity.title || '').toLowerCase().includes(search.toLowerCase()) }), [query.data, search, tab])
  async function remove(item) { await toggleSavedItem(item.itemType, resolveId(item.productId || item.sellerId)); query.reload() }
  return <AppShell><div className="container module-page"><PageHead eyebrow="Sourcing shortlist" title="Saved items" description="Your synchronized product and supplier shortlist." /><div className="module-toolbar"><div className="role-switch"><button className={tab === 'product' ? 'active' : ''} onClick={() => setTab('product')}>Products</button><button className={tab === 'supplier' ? 'active' : ''} onClick={() => setTab('supplier')}>Suppliers</button></div><label><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search saved items" /></label></div>{query.loading ? <TradeSkeleton /> : query.error ? <p className="inline-error">{query.error.message}</p> : rows.length ? tab === 'product' ? <div className="product-grid">{rows.map((item) => <ProductCard key={resolveId(item)} product={item.productId || {}} />)}</div> : <div className="saved-supplier-grid">{rows.map((item) => { const seller = item.sellerId || {}; return <article key={resolveId(item)}><SafeImage src={seller.companyLogo || seller.logoUrl} alt="" /><div><span>Saved supplier</span><h2>{displayName(seller, 'Supplier')}</h2><p>{seller.address?.country || seller.country || 'Global supplier'}</p><Link to={`/sellers/${resolveId(seller)}`}>View supplier</Link></div><button onClick={() => remove(item)} title="Remove"><Heart fill="currentColor" /></button></article> })}</div> : <div className="empty-results"><Store /><h2>No saved {tab === 'product' ? 'products' : 'suppliers'}</h2><p>Use the heart icon across marketplace listings to build your shortlist.</p></div>}</div></AppShell>
}
