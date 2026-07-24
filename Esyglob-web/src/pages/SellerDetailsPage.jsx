import { Award as Certificate, BadgeCheck, BarChart3, Building2, CalendarDays, CheckCircle2, Clock3, CreditCard, Factory, Globe2, Images, Mail, MapPin, MessageSquare, PackageCheck, Phone, Send, ShieldCheck, ShoppingBag, Star, Truck, Video } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchSellerDetails } from '../api/marketplace'
import { resolveApiResourceUrl } from '../api/client'
import { createChat } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { ProductCard, SafeImage, SkeletonCards } from '../components/MarketplaceCards'
import WishlistButton from '../components/WishlistButton'
import useAsyncData from '../hooks/useAsyncData'

const tabs = [
  ['company', 'Company', Building2],
  ['products', 'Products', PackageCheck],
  ['factory', 'Factory', Factory],
  ['trade', 'Trade', Globe2],
  ['media', 'Media', Images],
  ['certifications', 'Certs', Certificate],
  ['reviews', 'Reviews', Star],
]

export default function SellerDetailsPage() {
  const { sellerId } = useParams()
  const query = useAsyncData(useCallback(() => fetchSellerDetails(sellerId), [sellerId]))
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState('company')
  const [busy, setBusy] = useState(false)

  if (query.loading) return <AppShell><div className="listing-page container"><SkeletonCards count={3} variant="manufacturer" /></div></AppShell>
  if (query.error) return <AppShell><div className="listing-page container"><p className="inline-error">{query.error.message}</p></div></AppShell>

  const data = query.data || {}
  const seller = data.seller || data
  const factory = data.factoryProfile || {}
  const products = data.products || []
  const reviews = data.reviews || []
  const name = seller.companyName || seller.businessName || seller.name || 'Supplier'
  const verified = seller.isVerified || seller.verificationStatus === 'verified' || seller.verificationStatus === 'approved'
  const address = seller.address || {}
  const locationText = [address.city, address.state, address.country || seller.country].filter(Boolean).join(', ')
  const fullAddress = [address.street, address.city, address.state, address.country || seller.country, address.pincode || address.zipCode].filter(Boolean).join(', ')
  const logo = seller.companyLogo || seller.logo || seller.logoUrl
  const gallery = uniqueMedia([seller.coverImage, ...(seller.companyPhotos || []), ...(seller.factoryImages || []), ...(factory.images || [])])
  const cover = seller.coverImage || gallery[0] || logo
  const certifications = normalizeList(seller.certifications?.length ? seller.certifications : factory.certifications)
  const categories = normalizeList(seller.productCategories || seller.mainCategories)
  const exportMarkets = normalizeList(seller.exportMarkets?.length ? seller.exportMarkets : factory.exportMarkets)
  const capabilities = normalizeList(seller.businessCapabilities?.length ? seller.businessCapabilities : factory.capabilities)
  const mainProducts = normalizeList(seller.mainProducts)
  const industries = normalizeList(seller.industries)
  const companyVideos = uniqueMedia([...(seller.companyVideos || []), ...(factory.videos || [])])
  const paymentMethods = normalizeList(seller.paymentMethods || seller.acceptedPaymentMethods)
  const response = seller.responseRate !== undefined ? `${seller.responseRate}%` : '—'
  const responseTime = seller.responseTime || (seller.averageResponseTimeHours ? `${seller.averageResponseTimeHours} hours` : '')
  const establishedYear = seller.yearEstablished
  const years = seller.yearsInBusiness || (establishedYear ? Math.max(0, new Date().getFullYear() - Number(establishedYear)) : '—')
  const productCount = seller.totalProducts || seller.productCount || products.length
  const reviewCount = seller.reviewCount || reviews.length
  const rating = Number(seller.rating || averageReviewRating(reviews) || 0)
  const subscription = seller.subscriptionPlan && seller.subscriptionPlan !== 'free' ? String(seller.subscriptionPlan).replaceAll('_', ' ') : ''

  async function contactSupplier() {
    if (status !== 'authenticated') return navigate('/login', { state: { from: location.pathname } })
    if (busy) return
    setBusy(true)
    try {
      const result = await createChat({ otherUserId: seller.userId?._id || seller.userId, role: 'buyer', chatType: 'general' })
      navigate(`/messages/${result.chat?._id || result.chat?.id}`)
    } catch {
      navigate('/messages')
    } finally {
      setBusy(false)
    }
  }

  function requestQuote() {
    const path = '/rfqs/new'
    status === 'authenticated'
      ? navigate(path, { state: { sellerUserId: seller.userId?._id || seller.userId, sellerId, supplierName: name } })
      : navigate('/login', { state: { from: location.pathname } })
  }

  const visibleTabs = tabs

  return <AppShell><main className="manufacturer-page">
    <div className="container manufacturer-shell">
      <section className="manufacturer-hero">
        <div className="manufacturer-cover">{cover ? <SafeImage src={cover} alt="" /> : <Factory />}</div>
        <div className="manufacturer-identity">
          <div className="manufacturer-logo-wrap">
            {logo ? <SafeImage src={logo} alt={`${name} logo`} className="manufacturer-logo" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
            {verified && <i><BadgeCheck /></i>}
          </div>
          <div className="manufacturer-title">
            <div className="manufacturer-title-line"><h1>{name}</h1><WishlistButton type="supplier" itemId={sellerId} className="outline-icon" /></div>
            <p><MapPin /> {locationText || 'Global supplier'}</p>
            <div className="manufacturer-pills">
              {verified && <span className="is-verified"><ShieldCheck /> Verified</span>}
              <span>{formatLabel(seller.companyType || seller.businessType || 'Manufacturer / supplier')}</span>
              {subscription && <span className="is-subscription"><Star /> {formatLabel(subscription)}</span>}
              {seller.isTrustedSeller && <span className="is-trusted"><BadgeCheck /> Trusted Seller</span>}
            </div>
          </div>
        </div>
        <div className="manufacturer-stats">
          <Stat icon={PackageCheck} value={productCount} label="Products" />
          <Stat icon={Star} value={rating ? rating.toFixed(1) : '—'} label={`${reviewCount} reviews`} />
          <Stat icon={Clock3} value={response} label={responseTime || 'Response rate'} />
          <Stat icon={CalendarDays} value={years} label="Years" />
          <Stat icon={BadgeCheck} value={seller.totalOrders || seller.tradeHistorySummary?.completedOrders || 0} label="Orders" />
          <Stat icon={BarChart3} value={`${seller.trustScore || 0}/100`} label="Trust score" />
        </div>
        <div className="manufacturer-actions">
          <button className="manufacturer-chat" disabled={busy || !seller.userId} onClick={contactSupplier}><MessageSquare /> {busy ? 'Opening…' : 'Chat Now'}</button>
          <button className="manufacturer-rfq" onClick={requestQuote}><Send /> Send Enquiry</button>
          
        </div>
      </section>

      <nav className="manufacturer-tabs" aria-label="Manufacturer information">
        {visibleTabs.map(([key, label, Icon]) => <button className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}><Icon /> {label}</button>)}
      </nav>

      <div className="manufacturer-content">
        {tab === 'company' && <CompanyTab seller={seller} factory={factory} name={name} fullAddress={fullAddress} locationText={locationText} categories={categories} markets={exportMarkets} capabilities={capabilities} paymentMethods={paymentMethods} responseTime={responseTime} contactSupplier={contactSupplier} busy={busy} />}
        {tab === 'products' && <ProductsTab products={products} sellerId={sellerId} />}
        {tab === 'factory' && <FactoryTab factory={factory} gallery={gallery} />}
        {tab === 'trade' && <TradeTab seller={seller} markets={exportMarkets} industries={industries} capabilities={capabilities} mainProducts={mainProducts} />}
        {tab === 'media' && <MediaTab gallery={gallery} videos={companyVideos} brochures={seller.brochures || []} />}
        {tab === 'certifications' && <CertificationsTab certifications={certifications} />}
        {tab === 'reviews' && <ReviewsTab reviews={reviews} rating={rating} reviewCount={reviewCount} />}
      </div>
    </div>
  </main></AppShell>
}

function CompanyTab({ seller, factory, name, fullAddress, locationText, categories, markets, capabilities, paymentMethods, responseTime, contactSupplier, busy }) {
  return <div className="manufacturer-company-grid">
    <section className="manufacturer-card manufacturer-about">
      <h2>About {name}</h2>
      <p>{seller.companyDescription || seller.companyIntroduction || seller.description || 'This supplier has not published a company introduction yet.'}</p>
      <InfoRows rows={[
        ['Company name', seller.companyName],
        ['Business type', seller.companyType || seller.businessType],
        ['Established', seller.yearEstablished],
        ['Employees', seller.employeeCount],
        ['Location', locationText],
        ['Response rate', seller.responseRate !== undefined ? `${seller.responseRate}%` : ''],
        ['Response time', responseTime],
        ['Total products', seller.totalProducts],
        ['Total orders', seller.totalOrders],
        ['Annual revenue', seller.annualRevenueRange || seller.annualRevenue],
      ]} />
    </section>

    <section className="manufacturer-card manufacturer-contact">
      <h2>Contact Information</h2>
      <ContactRow icon={Mail} label="Business email" value={seller.businessEmail || seller.email} href={seller.businessEmail ? `mailto:${seller.businessEmail}` : ''} />
      <ContactRow icon={Phone} label="Phone number" value={seller.businessPhone || seller.phone} href={seller.businessPhone ? `tel:${seller.businessPhone}` : ''} />
      <ContactRow icon={Globe2} label="Website" value={seller.companyWebsite || seller.website} href={safeWebsite(seller.companyWebsite || seller.website)} />
      <ContactRow icon={MapPin} label="Complete address" value={fullAddress} />
      <button onClick={contactSupplier} disabled={busy || !seller.userId}><MessageSquare /> Contact Supplier</button>
    </section>

    <section className="manufacturer-card">
      <h2><ShoppingBag /> Product Categories</h2>
      <TagList values={categories} empty="Categories are represented by the supplier's live products." />
      <h3><Globe2 /> Export Markets</h3>
      <TagList values={markets} empty="Export markets have not been published." />
    </section>

    <section className="manufacturer-card">
      <h2><Building2 /> Business Capabilities</h2>
      <TagList values={capabilities} empty={factory.description || 'Contact the supplier for detailed production capabilities.'} />
      <h3><Truck /> Shipping Information</h3>
      <InfoRows rows={[
        ['Origin port', seller.shippingInfo?.originPort],
        ['Preferred carriers', seller.shippingInfo?.preferredCarriers],
        ['Export countries', seller.shippingInfo?.exportCountries],
        ['Handling time', seller.shippingInfo?.handlingTime],
      ]} compact />
      <h3><CreditCard /> Payment Methods</h3>
      <TagList values={paymentMethods} empty="Confirm supported payment methods during quotation." />
    </section>
  </div>
}

function ProductsTab({ products, sellerId }) {
  return <section className="manufacturer-tab-section">
    <header><div><span className="eyebrow">Supplier catalogue</span><h2>Products from this supplier</h2></div><Link to={`/products?seller=${sellerId}`}>View all products</Link></header>
    <div className="product-grid">{products.length ? products.map(item => <ProductCard key={item._id || item.id} product={item} />) : <div className="manufacturer-empty"><PackageCheck /><p>No public products are currently listed.</p></div>}</div>
  </section>
}

function FactoryTab({ factory, gallery }) {
  return <div className="manufacturer-company-grid">
    <section className="manufacturer-card">
      <h2><Factory /> Factory Information</h2>
      {factory.description && <p>{factory.description}</p>}
      <InfoRows rows={[
        ['Factory name', factory.name || factory.factoryName],
        ['Address', formatAddress(factory.address)],
        ['Floor area', factory.floorArea || factory.factorySize],
        ['Employees', factory.employeeCount],
        ['Production lines', factory.productionLines],
        ['Monthly capacity', factory.monthlyCapacity],
        ['Annual capacity', factory.annualCapacity],
        ['Quality control', factory.qualityControl],
        ['Verification', factory.verificationStatus],
        ['Last inspected', factory.inspectedAt ? new Date(factory.inspectedAt).toLocaleDateString() : ''],
      ]} />
    </section>
    <section className="manufacturer-card">
      <h2><Building2 /> Machinery & Capabilities</h2>
      <TagList values={factory.capabilities} empty="Factory capabilities have not been published." />
      <div className="manufacturer-machinery">{normalizeList(factory.machinery).map((item, index) => <article key={`${item.name || item}-${index}`}><Factory /><span><b>{item.name || String(item)}</b>{typeof item === 'object' && <small>{[item.model, item.quantity ? `Qty ${item.quantity}` : '', item.year].filter(Boolean).join(' · ')}</small>}</span></article>)}</div>
    </section>
    <GalleryCard gallery={gallery} />
  </div>
}

function TradeTab({ seller, markets, industries, capabilities, mainProducts }) {
  const trade = seller.tradeCapabilities || {}
  const shipping = seller.shippingInfo || {}
  return <div className="manufacturer-company-grid">
    <section className="manufacturer-card">
      <h2><Globe2 /> Export & Trade Background</h2>
      <InfoRows rows={[
        ['Minimum order quantity', trade.minimumOrderQuantity],
        ['Production lead time', trade.productionLeadTime],
        ['Origin port', shipping.originPort],
        ['Handling time', shipping.handlingTime],
        ['Completed orders', seller.totalOrders || seller.tradeHistorySummary?.completedOrders],
        ['Repeat buyers', seller.tradeHistorySummary?.repeatBuyerRate ? `${seller.tradeHistorySummary.repeatBuyerRate}%` : ''],
        ['Countries served', seller.tradeHistorySummary?.countriesServed],
        ['Years on EsyGlob', seller.createdAt ? Math.max(1, new Date().getFullYear() - new Date(seller.createdAt).getFullYear() + 1) : ''],
      ]} />
      <h3><Globe2 /> Main Markets</h3><TagList values={markets} empty="Export markets have not been published." />
    </section>
    <section className="manufacturer-card">
      <h2><Factory /> Manufacturing Services</h2>
      <div className="manufacturer-service-flags">
        {[['OEM', trade.oem], ['ODM', trade.odm], ['Private label', trade.privateLabel]].map(([label, enabled]) => <span className={enabled ? 'active' : ''} key={label}>{enabled ? <CheckCircle2 /> : <Clock3 />}{label}</span>)}
      </div>
      <h3>Production capabilities</h3><TagList values={capabilities} empty="Contact the supplier for production capability details." />
      <h3>Main products</h3><TagList values={mainProducts} empty="View the supplier catalogue for active products." />
    </section>
    <section className="manufacturer-card">
      <h2><BarChart3 /> Quality & R&D Capabilities</h2>
      <h3>Quality assurance</h3><p>{trade.qualityAssurance || 'Quality assurance details have not been published.'}</p>
      <h3>Research and development</h3><p>{trade.rdCapability || 'R&D capabilities have not been published.'}</p>
      <h3>Industries served</h3><TagList values={industries} empty="Industry coverage follows the active product catalogue." />
    </section>
    <section className="manufacturer-card">
      <h2><Truck /> Shipping Support</h2>
      <TagList values={shipping.shippingSupport} empty="Confirm logistics support during quotation." />
      <h3>Preferred carriers</h3><TagList values={shipping.preferredCarriers} empty="Carrier details are available during negotiation." />
      <h3>Export countries</h3><TagList values={shipping.exportCountries} empty="Contact the supplier for supported destinations." />
    </section>
  </div>
}

function MediaTab({ gallery, videos, brochures }) {
  return <div className="manufacturer-media-tab">
    <GalleryCard gallery={gallery} />
    <section className="manufacturer-card manufacturer-videos"><h2><Video /> Factory & Company Videos</h2>{videos.length ? <div>{videos.map((url, index) => <video controls preload="metadata" key={`${url}-${index}`}><source src={resolveApiResourceUrl(url)} /></video>)}</div> : <div className="manufacturer-empty"><Video /><p>No public videos are available.</p></div>}</section>
    <section className="manufacturer-card manufacturer-brochures"><h2><Certificate /> Company Brochures</h2>{brochures.length ? brochures.map((url, index) => <a href={resolveApiResourceUrl(url)} target="_blank" rel="noreferrer" key={`${url}-${index}`}><Certificate /><span><b>Company brochure {index + 1}</b><small>Open document</small></span></a>) : <div className="manufacturer-empty"><Certificate /><p>No company brochures are available.</p></div>}</section>
  </div>
}

function CertificationsTab({ certifications }) {
  return <section className="manufacturer-card manufacturer-certifications"><h2><Certificate /> Certifications</h2>{certifications.length ? certifications.map((cert, index) => {
    const name = typeof cert === 'string' ? cert : cert.name || cert.certificateNumber || `Certificate ${index + 1}`
    const url = typeof cert === 'object' ? cert.documentUrl || cert.url : ''
    return <article key={`${name}-${index}`}><Certificate /><span><b>{name}</b><small>{typeof cert === 'object' ? [cert.issuer, cert.status, cert.expiryDate ? `Expires ${new Date(cert.expiryDate).toLocaleDateString()}` : ''].filter(Boolean).join(' · ') : 'Company certification'}</small></span>{url && <a href={url} target="_blank" rel="noreferrer">View</a>}</article>
  }) : <div className="manufacturer-empty"><Certificate /><p>No public certifications are available.</p></div>}</section>
}

function ReviewsTab({ reviews, rating, reviewCount }) {
  return <section className="manufacturer-card manufacturer-reviews">
    <header><div><b>{rating ? rating.toFixed(1) : '—'}</b><Stars value={rating} /><small>{reviewCount} reviews</small></div><span><ShieldCheck /> Marketplace buyer feedback</span></header>
    {reviews.length ? <div>{reviews.map((review, index) => <article key={review._id || index}><i>{reviewerName(review).slice(0, 1).toUpperCase()}</i><div><header><b>{reviewerName(review)}</b><Stars value={reviewRating(review)} /><time>{review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ''}</time></header>{review.title && <h3>{review.title}</h3>}<p>{review.comment || review.review || review.content}</p>{review.verifiedPurchase && <small><CheckCircle2 /> Verified purchase</small>}</div></article>)}</div> : <div className="manufacturer-empty"><Star /><p>No published reviews yet.</p></div>}
  </section>
}

function GalleryCard({ gallery }) {
  if (!gallery.length) return <section className="manufacturer-card"><h2><Images /> Company Gallery</h2><div className="manufacturer-empty"><Images /><p>No company photos have been published.</p></div></section>
  return <section className="manufacturer-card manufacturer-gallery"><h2><Images /> Company Gallery</h2><div>{gallery.map((image, index) => <a href={image} target="_blank" rel="noreferrer" key={`${image}-${index}`}><SafeImage src={image} alt={`Company view ${index + 1}`} /></a>)}</div></section>
}

function Stat({ icon: Icon, value, label }) { return <span><Icon /><b>{value ?? '—'}</b><small>{label}</small></span> }
function ContactRow({ icon: Icon, label, value, href }) { if (!value) return null; const content = <><Icon /><span><small>{label}</small><b>{value}</b></span></>; return href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{content}</a> : <div>{content}</div> }
function InfoRows({ rows, compact = false }) { return <dl className={`manufacturer-info ${compact ? 'compact' : ''}`}>{rows.filter(([, value]) => hasValue(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl> }
function TagList({ values = [], empty }) { const list = normalizeList(values); return list.length ? <div className="manufacturer-tags">{list.map((value, index) => <span key={`${displayValue(value)}-${index}`}>{displayValue(value)}</span>)}</div> : <p className="manufacturer-muted">{empty}</p> }
function Stars({ value = 0 }) { return <span className="manufacturer-stars">{[1,2,3,4,5].map(star => <Star className={star <= Math.round(Number(value || 0)) ? 'filled' : ''} key={star} />)}</span> }
function normalizeList(value) { if (!value) return []; if (Array.isArray(value)) return value.filter(hasValue); return String(value).split(',').map(item => item.trim()).filter(Boolean) }
function uniqueMedia(values) { return [...new Set(values.flatMap(value => typeof value === 'string' ? [value] : value?.url ? [value.url] : []).filter(Boolean))] }
function hasValue(value) { return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0) }
function displayValue(value) { if (Array.isArray(value)) return value.map(displayValue).join(', '); if (typeof value === 'object') return value.name || Object.values(value).filter(item => typeof item !== 'object' && hasValue(item)).join(', '); return formatLabel(String(value)) }
function formatLabel(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
function formatAddress(value = {}) { return [value.street, value.city, value.state, value.country, value.pincode || value.zipCode].filter(Boolean).join(', ') }
function safeWebsite(value) { if (!value) return ''; return /^https?:\/\//i.test(value) ? value : `https://${value}` }
function reviewerName(review) { return review.userId?.fullName || review.userName || review.reviewerName || 'Marketplace buyer' }
function reviewRating(review) { return Number(review.rating?.overall || review.overallRating || (typeof review.rating === 'number' ? review.rating : 0)) }
function averageReviewRating(reviews) { if (!reviews.length) return 0; return reviews.reduce((sum, review) => sum + reviewRating(review), 0) / reviews.length }
