import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Clock3,
  Factory,
  Heart,
  MapPin,
  MessageCircle,
  PackageCheck,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react'
import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SafeImage } from './MarketplaceCards'
import { normalizeSellerCategories } from './sellerPresentation'

const SellerMetric = memo(function SellerMetric({ icon, label, value, tone }) {
  return <div className={`seller-metric seller-metric--${tone}`}><i>{icon}</i><span><small>{label}</small><b>{value}</b></span></div>
})

const SellerListingCard = memo(function SellerListingCard({ seller }) {
  const [saved, setSaved] = useState(false)
  const id = seller._id || seller.id
  const name = seller.companyName || seller.businessName || seller.name || 'Marketplace supplier'
  const verified = Boolean(seller.isVerified || ['verified', 'approved'].includes(seller.verificationStatus))
  const factoryVerified = Boolean(seller.factoryVerified || seller.isFactoryVerified || seller.factoryAudit?.verified)
  const premium = Boolean(seller.isPremium || seller.premiumSeller || seller.membershipTier === 'premium' || seller.subscriptionTier === 'premium')
  const logo = seller.companyLogo || seller.logo || seller.logoUrl
  const facilityImage = seller.facilityImage || seller.factoryImage || seller.coverImage || seller.bannerImage || seller.videoThumbnail
  const location = [seller.address?.city, seller.address?.state, seller.address?.country || seller.country].filter(Boolean).join(', ') || 'Global supplier'
  const type = seller.companyType || seller.businessType || 'Manufacturer'
  const years = seller.yearsInBusiness || (seller.yearEstablished ? Math.max(0, new Date().getFullYear() - Number(seller.yearEstablished)) : null)
  const rating = Number(seller.rating || seller.averageRating || 0)
  const reviews = Number(seller.reviewCount || seller.totalReviews || seller.reviewsCount || 0)
  const responseRate = Number(seller.responseRate || seller.inquiryResponseRate || 0)
  const responseTime = seller.responseTime || seller.averageResponseTime || seller.avgResponseTime || 'Within 24h'
  const productCount = Number(seller.totalProducts || seller.productCount || seller.products?.length || 0)
  const orders = Number(seller.ordersCompleted || seller.completedOrders || seller.totalOrders || 0)
  const moq = seller.minimumOrderQuantity || seller.moq || seller.products?.find((product) => product.minimumOrderQuantity || product.moq)?.minimumOrderQuantity || seller.products?.find((product) => product.moq)?.moq
  const description = seller.companyDescription || seller.description || seller.about || `Explore sourcing and manufacturing capabilities from ${name}.`
  const categories = normalizeSellerCategories(seller.businessCategories || seller.productCategories || seller.categories || seller.industries, seller.products)
  const productPreviews = Array.isArray(seller.products) ? seller.products.filter((product) => product.images?.[0] || product.image).slice(0, 4) : []
  const hasMedia = productPreviews.length > 0 || Boolean(facilityImage)

  return <article className="seller-list-card">
    <header className="seller-list-card__header">
      <div className="seller-list-card__identity">
        <div className="seller-list-card__logo">
          {logo ? <SafeImage src={logo} alt={`${name} logo`} className="h-full w-full object-contain" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div>
          <div className="seller-list-card__title">
            <Link to={`/sellers/${id}`}>{name}</Link>
            {verified && <span className="seller-trust-badge verified"><BadgeCheck /> Verified</span>}
            {factoryVerified && <span className="seller-trust-badge factory"><ShieldCheck /> Factory verified</span>}
            {premium && <span className="seller-trust-badge premium"><Sparkles /> Premium</span>}
          </div>
          <div className="seller-list-card__subline"><span><Building2 /> {type}</span><span><MapPin /> {location}</span>{years !== null && <span>{years}+ years</span>}</div>
        </div>
      </div>
      <button className={`seller-save-button ${saved ? 'saved' : ''}`} onClick={() => setSaved((value) => !value)} aria-label={saved ? 'Remove supplier from saved' : 'Save supplier'} aria-pressed={saved}><Heart /></button>
    </header>

    <div className={`seller-list-card__content ${hasMedia ? '' : 'no-media'}`}>
      <div className="seller-list-card__details">
        <p className="seller-list-card__description">{description}</p>
        <div className="seller-category-chips" aria-label="Product categories">
          {categories.slice(0, 5).map((category) => <span key={category}>{category}</span>)}
          {categories.length > 5 && <span>+{categories.length - 5}</span>}
        </div>
        <div className="seller-metric-grid">
          <SellerMetric icon={<Star />} label="Rating" value={rating ? `${rating.toFixed(1)} (${reviews})` : 'New supplier'} tone="amber" />
          <SellerMetric icon={<Clock3 />} label="Response" value={responseRate ? `${responseRate}% · ${responseTime}` : responseTime} tone="emerald" />
          <SellerMetric icon={<PackageCheck />} label="Products" value={productCount ? productCount.toLocaleString() : 'Catalog ready'} tone="blue" />
          <SellerMetric icon={<BadgeCheck />} label="Orders" value={orders ? orders.toLocaleString() : '—'} tone="violet" />
          {moq && <SellerMetric icon={<Factory />} label="MOQ from" value={`${moq} units`} tone="slate" />}
        </div>
      </div>

      {hasMedia && <div className="seller-card-visuals">
        {facilityImage && <Link className="seller-list-card__media" to={`/sellers/${id}`} aria-label={`View ${name} manufacturing profile`}>
          <SafeImage src={facilityImage} alt={`${name} facility`} className="h-full w-full object-cover" />
          <span><Factory /> Factory profile</span>
        </Link>}
        {productPreviews.length > 0 && <div className="seller-product-previews" aria-label={`Products from ${name}`}>
          {productPreviews.map((product) => <Link key={product._id || product.slug} to={`/products/${product._id || product.slug}`} title={product.name}>
            <SafeImage src={product.images?.[0] || product.image} alt={product.name} className="h-full w-full object-cover" />
            <span>{product.name}</span>
          </Link>)}
        </div>}
      </div>}
    </div>

    <footer className="seller-list-card__footer">
      <div className="seller-card-proof">{verified ? <><ShieldCheck /> Identity and business details verified</> : <><Building2 /> Marketplace business profile</>}</div>
      <div className="seller-card-actions">
        <Link className="seller-card-action secondary" to={`/messages?participant=${id}`}><MessageCircle /> Chat now</Link>
        <Link className="seller-card-action secondary" to={`/rfqs/new?sellerId=${id}`}><Send /> Send enquiry</Link>
        <Link className="seller-card-action primary" to={`/sellers/${id}`}>View profile <ArrowUpRight /></Link>
      </div>
    </footer>
  </article>
})

export default SellerListingCard
