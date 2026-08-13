import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Clock3,
  ChevronLeft,
  ChevronRight,
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
import { memo, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createChat } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import { resolveId } from '../utils/trade'
import { SafeImage } from './MarketplaceCards'
import { normalizeSellerCategories } from './sellerPresentation'

const SellerMetric = memo(function SellerMetric({ icon, label, value, tone }) {
  return <div className={`seller-metric seller-metric--${tone}`}><i>{icon}</i><span><small>{label}</small><b>{value}</b></span></div>
})

const SellerListingCard = memo(function SellerListingCard({ seller }) {
  const [saved, setSaved] = useState(false)
  const [openingChat, setOpeningChat] = useState(false)
  const [chatError, setChatError] = useState('')
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const { status } = useAuth()
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
  const slides = [facilityImage && { src: facilityImage, label: 'Factory profile', href: `/sellers/${id}` }, ...productPreviews.map(product => ({ src: product.images?.[0] || product.image, label: product.name, href: `/products/${product._id || product.slug}` }))].filter(item => item?.src)
  const [slide, setSlide] = useState(0)
  const swipeStart = useRef(null)
  const hasMedia = slides.length > 0
  useEffect(() => {
    if (slides.length < 2) return undefined
    const timer = window.setInterval(() => setSlide(current => (current + 1) % slides.length), 5200)
    return () => window.clearInterval(timer)
  }, [slides.length])
  const moveSlide = direction => setSlide(current => (current + direction + slides.length) % slides.length)
  async function openManufacturerChat() {
    if (status !== 'authenticated') return navigate('/login', { state: { from: routeLocation.pathname } })
    const otherUserId = resolveId(seller.userId)
    if (!otherUserId || openingChat) return
    setOpeningChat(true); setChatError('')
    try {
      const result = await createChat({ otherUserId, role: 'buyer', chatType: 'general' })
      const chatId = resolveId(result.chat || result)
      if (!chatId) throw new Error('The manufacturer conversation could not be opened.')
      navigate(`/messages/${chatId}`)
    } catch (error) {
      setChatError(error.message || 'Unable to open this manufacturer conversation.')
      setOpeningChat(false)
    }
  }

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

      {hasMedia && <div className="seller-card-carousel" onPointerDown={event => { swipeStart.current = event.clientX }} onPointerUp={event => { if (swipeStart.current != null && Math.abs(event.clientX - swipeStart.current) > 38) moveSlide(event.clientX < swipeStart.current ? 1 : -1); swipeStart.current = null }} onPointerCancel={() => { swipeStart.current = null }}>
        <Link to={slides[slide].href} aria-label={slides[slide].label}><SafeImage src={slides[slide].src} alt={slides[slide].label} className="h-full w-full object-contain" /><span>{slides[slide].label}</span></Link>
        {slides.length > 1 && <><button type="button" className="seller-carousel-prev" onClick={() => moveSlide(-1)} aria-label="Previous image"><ChevronLeft /></button><button type="button" className="seller-carousel-next" onClick={() => moveSlide(1)} aria-label="Next image"><ChevronRight /></button><div className="seller-carousel-dots">{slides.map((item, index) => <button type="button" key={`${item.src}-${index}`} className={slide === index ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Show image ${index + 1}`} />)}</div></>}
      </div>}
    </div>

    <footer className="seller-list-card__footer">
      {chatError && <p className="action-error">{chatError}</p>}
      <div className="seller-card-proof">{verified ? <><ShieldCheck /> Identity and business details verified</> : <><Building2 /> Marketplace business profile</>}</div>
      <div className="seller-card-actions">
        <button type="button" className="seller-card-action secondary" disabled={openingChat || !resolveId(seller.userId)} onClick={openManufacturerChat}><MessageCircle /> {openingChat ? 'Opening chat…' : 'Chat now'}</button>
        <Link className="seller-card-action secondary" to={`/rfqs/new?sellerId=${id}`}><Send /> Send enquiry</Link>
        <Link className="seller-card-action primary" to={`/sellers/${id}`}>View profile <ArrowUpRight /></Link>
      </div>
    </footer>
  </article>
})

export default SellerListingCard
