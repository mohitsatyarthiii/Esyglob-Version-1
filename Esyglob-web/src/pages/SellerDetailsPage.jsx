import { BadgeCheck, Building2, Factory, MapPin, MessageSquare, PackageCheck, ShieldCheck } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchSellerDetails } from '../api/marketplace'
import { createChat } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { ProductCard, SafeImage, SkeletonCards } from '../components/MarketplaceCards'
import WishlistButton from '../components/WishlistButton'
import useAsyncData from '../hooks/useAsyncData'

export default function SellerDetailsPage() {
  const { sellerId } = useParams()
  const query = useAsyncData(useCallback(() => fetchSellerDetails(sellerId), [sellerId]))
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (query.loading) return <AppShell><div className="listing-page container"><SkeletonCards count={3} variant="manufacturer" /></div></AppShell>
  const data = query.data || {}
  const seller = data.seller || data
  const products = data.products || []
  const name = seller.companyName || seller.businessName || seller.name || 'Supplier'
  const locationText = [seller.address?.city, seller.address?.state, seller.address?.country || seller.country].filter(Boolean).join(', ')
  async function contactSupplier() {
    if (status !== 'authenticated') return navigate('/login', { state: { from: location.pathname } })
    try { const result = await createChat({ otherUserId: seller.userId?._id || seller.userId, role: 'buyer', chatType: 'general' }); navigate(`/messages/${result.chat?._id || result.chat?.id}`) }
    catch { navigate('/messages') }
  }
  return <AppShell><div className="detail-page container"><section className="seller-profile-head"><SafeImage src={seller.companyLogo || seller.logo || seller.factoryImages?.[0]} alt="" className="seller-profile-logo" /><div><span className="eyebrow">{seller.companyType || 'Manufacturer / supplier'}</span><h1>{name} {(seller.isVerified || seller.verificationStatus === 'verified') && <BadgeCheck />}</h1><p><MapPin /> {locationText || 'Global supplier'}</p><div className="seller-badges"><span><ShieldCheck /> Trust {seller.trustScore || 0}</span><span><PackageCheck /> {seller.totalProducts || seller.productCount || products.length} products</span><span><Factory /> {seller.yearsInBusiness || '—'} years</span></div></div><div className="seller-profile-actions"><WishlistButton type="supplier" itemId={sellerId} className="outline-icon" /><button onClick={contactSupplier}><MessageSquare /> Contact supplier</button><button onClick={() => status === 'authenticated' ? navigate('/rfqs/new', { state: { sellerUserId: seller.userId?._id || seller.userId } }) : navigate('/login', { state: { from: location.pathname } })}>Request quote</button></div></section><div className="detail-columns"><section className="detail-card"><h2>Company overview</h2><p>{seller.companyDescription || seller.companyIntroduction || 'Supplier profile information is available from the EsyGlob marketplace.'}</p><dl className="spec-grid"><div><dt>Business type</dt><dd>{seller.companyType || 'Supplier'}</dd></div><div><dt>Established</dt><dd>{seller.yearEstablished || 'Not provided'}</dd></div><div><dt>Employees</dt><dd>{seller.employeeCount || 'Not provided'}</dd></div><div><dt>Response rate</dt><dd>{seller.responseRate ? `${seller.responseRate}%` : 'Not provided'}</dd></div></dl></section><aside className="detail-card"><h2><Building2 /> Trade capabilities</h2><TagList values={seller.mainCategories || seller.productCategories} empty="Product categories are listed with the supplier's live products." /><h3>Export markets</h3><TagList values={seller.exportMarkets} empty="Contact the supplier for supported markets." /></aside></div><div className="compact-heading"><h2>Products from this supplier</h2><Link to={`/products?seller=${sellerId}`}>View all</Link></div><div className="product-grid">{products.length ? products.map((item) => <ProductCard key={item._id || item.id} product={item} />) : <p className="empty-copy">No public products are currently listed.</p>}</div></div></AppShell>
}

function TagList({ values = [], empty }) { return values?.length ? <div className="tag-list">{values.map((value) => <span key={typeof value === 'object' ? value.name : value}>{typeof value === 'object' ? value.name : value}</span>)}</div> : <p>{empty}</p> }
