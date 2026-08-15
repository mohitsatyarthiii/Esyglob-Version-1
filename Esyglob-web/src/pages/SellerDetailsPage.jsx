import {
  Award,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Factory,
  FileCheck2,
  Globe2,
  Heart,
  Images,
  MapPin,
  MessageSquare,
  PackageCheck,
  Play,
  Send,
  ShieldCheck,
  ShoppingBag,
  Star,
  Users,
  Video,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { resolveApiResourceUrl } from '../api/client'
import { fetchSellerDetails, submitSellerEnquiry } from '../api/marketplace'
import { createChat } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { SafeImage, SkeletonCards } from '../components/MarketplaceCards'
import { Money } from '../components/TradeUI'
import WishlistButton from '../components/WishlistButton'
import useAsyncData from '../hooks/useAsyncData'

const sectionLinks = [
  ['overview', 'Overview'],
  ['factory', 'Factory'],
  ['capabilities', 'Capabilities'],
  ['certifications', 'Certifications'],
  ['products', 'Products'],
  ['reviews', 'Reviews'],
  ['media', 'Media'],
]

export default function SellerDetailsPage() {
  const { sellerId } = useParams()
  const query = useAsyncData(useCallback(() => fetchSellerDetails(sellerId), [sellerId]))
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [activeMedia, setActiveMedia] = useState(0)
  const [enquiryProduct, setEnquiryProduct] = useState(() => new URLSearchParams(location.search).get('enquiry') ? {} : null)
  const [enquiry, setEnquiry] = useState({ message: '', quantity: '', unit: 'pcs' })
  const [enquiryBusy, setEnquiryBusy] = useState(false)
  const [enquirySuccess, setEnquirySuccess] = useState('')
  const enquiryDeliveryKey = useRef('')

  if (query.loading) return <AppShell><div className="listing-page container"><SkeletonCards count={3} variant="manufacturer" /></div></AppShell>
  if (query.error) return <AppShell><div className="listing-page container"><p className="inline-error">{query.error.message}</p></div></AppShell>

  const data = query.data || {}
  const seller = data.seller || data
  const factory = data.factoryProfile || {}
  const products = data.products || []
  const reviews = data.reviews || []
  const name = seller.companyName || seller.businessName || seller.name || 'EsyGlob Supplier'
  const verified = seller.isVerified || ['verified', 'approved'].includes(seller.verificationStatus)
  const factoryVerified = ['verified', 'approved'].includes(factory.verificationStatus)
  const address = seller.address || {}
  const locationText = [address.city, address.state, address.country || seller.country].filter(Boolean).join(', ')
  const logo = seller.companyLogo || seller.logo || seller.logoUrl
  const media = uniqueMedia([
    seller.coverImage,
    ...(seller.companyPhotos || []),
    ...(factory.images || []),
  ])
  const cover = media[activeMedia] || logo
  const certifications = normalizeList(seller.certifications?.length ? seller.certifications : factory.certifications)
  const categories = normalizeList(seller.productCategories || seller.mainCategories)
  const subcategories = normalizeList(seller.productSubcategories)
  const exportMarkets = normalizeList(seller.exportMarkets?.length ? seller.exportMarkets : factory.exportMarkets)
  const capabilities = normalizeList(factory.capabilities || seller.businessCapabilities)
  const industries = normalizeList(seller.industries)
  const mainProducts = normalizeList(seller.mainProducts)
  const videos = uniqueMedia([...(seller.companyVideos || []), ...(factory.videos || [])])
  const trade = seller.tradeCapabilities || {}
  const shipping = seller.shippingInfo || {}
  const establishedYear = Number(seller.yearEstablished || 0)
  const years = seller.yearsInBusiness || (establishedYear ? Math.max(1, new Date().getFullYear() - establishedYear) : null)
  const responseRate = seller.responseRate !== undefined ? `${seller.responseRate}%` : 'Not published'
  const responseTime = seller.responseTime || (seller.averageResponseTimeHours ? `Within ${seller.averageResponseTimeHours}h` : 'Ask supplier')
  const completedOrders = seller.totalOrders || seller.tradeHistorySummary?.completedOrders || 0
  const repeatBuyerRate = seller.tradeHistorySummary?.repeatBuyerRate
  const productCount = seller.totalProducts || products.length
  const reviewCount = seller.reviewCount || reviews.length
  const rating = Number(seller.rating || averageReviewRating(reviews) || 0)
  const sampleProduct = products.find(product => product.sampleAvailable && /\d/.test(String(product.packaging?.weight || '')) && (String(product.packaging?.dimensions || '').match(/\d+(?:\.\d+)?/g) || []).length >= 3)
    || products.find(product => product.sampleAvailable)
  const trustItems = [
    verified && 'Business identity verified',
    factoryVerified && 'Factory profile verified',
    certifications.some(cert => typeof cert === 'object' && cert.status === 'verified') && 'Documents verified',
    trade.qualityAssurance && 'Quality process published',
    seller.onTimeDeliveryRate && `${seller.onTimeDeliveryRate}% on-time delivery`,
  ].filter(Boolean)

  async function contactSupplier() {
    if (status !== 'authenticated') return navigate('/login', { state: { from: location.pathname } })
    if (busy) return
    setActionError('')
    setBusy(true)
    try {
      const result = await createChat({ otherUserId: seller.userId?._id || seller.userId, role: 'buyer', chatType: 'general' })
      const chatId = result.chat?._id || result.chat?.id
      if (!chatId) throw new Error('The manufacturer conversation could not be created.')
      navigate(`/messages/${chatId}`)
    } catch (error) {
      setActionError(error.message || 'Unable to open this manufacturer conversation.')
    } finally {
      setBusy(false)
    }
  }

  function requestQuote(productContext = null) {
    if (status !== 'authenticated') return navigate('/login', { state: { from: `${location.pathname}${location.search}` } })
    setEnquiryProduct(productContext || {})
    setEnquiry((current) => ({ ...current, quantity: productContext?.minimumOrderQuantity || productContext?.moq || current.quantity, unit: productContext?.unit || current.unit }))
    setEnquirySuccess('')
    setActionError('')
  }

  async function sendEnquiry(event) {
    event.preventDefault()
    enquiryDeliveryKey.current ||= globalThis.crypto?.randomUUID?.() || `enquiry-${Date.now()}-${Math.random()}`
    if (!enquiry.message.trim() || enquiryBusy) return
    setEnquiryBusy(true); setActionError('')
    try {
      const productLine = enquiryProduct?._id ? `Product: ${enquiryProduct.name}\nProduct ID: ${enquiryProduct._id || enquiryProduct.id}\n\n` : ''
      const result = await submitSellerEnquiry({
        otherUserId: seller.userId?._id || seller.userId,
        content: `${productLine}${enquiry.message.trim()}`,
        quantity: enquiry.quantity,
        unit: enquiry.unit,
        deliveryKey: enquiryDeliveryKey.current,
      })
      setEnquirySuccess('Enquiry sent successfully.')
      setEnquiry((current) => ({ ...current, message: '' }))
      setEnquiryProduct((current) => ({ ...current, chatId: result.chatId }))
    } catch {
      setActionError('Unable to send enquiry. Please try again.')
    } finally {
      setEnquiryBusy(false)
    }
  }

  function orderSample() {
    if (!sampleProduct) return scrollToSection('products')
    const target = `/checkout?mode=sample&productId=${encodeURIComponent(sampleProduct._id || sampleProduct.id)}&quantity=1`
    status === 'authenticated' ? navigate(target) : navigate('/login', { state: { from: location.pathname } })
  }

  const actions = { contactSupplier, requestQuote, orderSample }

  return <AppShell>
    <main className="manufacturer-page manufacturer-page--premium">
      <div className="container manufacturer-shell manufacturer-shell--premium">
        {actionError && <p className="inline-error" role="alert">{actionError}</p>}
        <section className="manufacturer-hero-v2">
          <div className="manufacturer-hero-v2__identity">
            <div className="manufacturer-hero-v2__brand">
              <div className="manufacturer-logo-v2">
                {logo ? <SafeImage src={logo} alt={`${name} logo`} /> : <span>{initials(name)}</span>}
                {verified && <i title="Verified supplier"><BadgeCheck /></i>}
              </div>
              <div>
                <div className="manufacturer-kicker"><ShieldCheck /> EsyGlob supplier profile</div>
                <h1>{name}</h1>
                <p className="manufacturer-meta-line">
                  <span><MapPin /> {locationText || 'Global supplier'}</span>
                  {years && <span><CalendarDays /> {years} years in business</span>}
                  {seller.employeeCount && <span><Users /> {displayValue(seller.employeeCount)} employees</span>}
                </p>
                <div className="manufacturer-trust-badges">
                  {verified && <span className="verified"><BadgeCheck /> Verified business</span>}
                  {factoryVerified && <span className="factory"><Factory /> Factory verified</span>}
                  {seller.isTrustedSeller && <span className="trusted"><ShieldCheck /> Trusted seller</span>}
                  <span><Building2 /> {formatLabel(seller.companyType || seller.businessType || 'Manufacturer / supplier')}</span>
                </div>
              </div>
            </div>

            <p className="manufacturer-hero-v2__summary">
              {seller.companyDescription || seller.companyIntroduction || seller.description || `${name} supplies business buyers through EsyGlob. Review the company's products, production capabilities and trade background below.`}
            </p>

            <div className="manufacturer-proof-row">
              <div className="manufacturer-rating-proof">
                <strong>{rating ? rating.toFixed(1) : 'New'}</strong>
                <span><Stars value={rating} /><small>{reviewCount ? `${reviewCount} buyer reviews` : 'Supplier profile'}</small></span>
              </div>
              <Proof value={responseRate} label="Response rate" />
              <Proof value={responseTime} label="Response time" />
              <Proof value={numberLabel(completedOrders)} label="Completed orders" />
              <Proof value={repeatBuyerRate ? `${repeatBuyerRate}%` : numberLabel(seller.tradeHistorySummary?.successfulTransactions || completedOrders)} label={repeatBuyerRate ? 'Repeat buyers' : 'Successful transactions'} />
            </div>

            {!!trustItems.length && <div className="manufacturer-verified-strip">
              {trustItems.slice(0, 4).map(item => <span key={item}><CheckCircle2 /> {item}</span>)}
            </div>}
          </div>

          <MediaShowcase media={media} cover={cover} activeMedia={activeMedia} setActiveMedia={setActiveMedia} videos={videos} />
        </section>

        <nav className="manufacturer-section-nav" aria-label="Manufacturer page sections">
          {sectionLinks.map(([id, label]) => <button type="button" onClick={() => scrollToSection(id)} key={id}>{label}</button>)}
          <Link to={`/products?seller=${sellerId}`}>Full catalogue <ChevronRight /></Link>
        </nav>

        <div className="manufacturer-layout-v2">
          <div className="manufacturer-main-v2">
            <section className="manufacturer-section-card manufacturer-snapshot" id="overview">
              <SectionHeading eyebrow="At a glance" title="Business snapshot" icon={BarChart3} description="Commercial and operational indicators supplied through the EsyGlob business profile." />
              <div className="manufacturer-snapshot-grid">
                <Snapshot icon={CalendarDays} value={years ? `${years} yrs` : '—'} label="In business" />
                <Snapshot icon={Users} value={seller.employeeCount || factory.employeeCount || '—'} label="Employees" />
                <Snapshot icon={Factory} value={factory.floorArea || factory.factorySize || '—'} label="Factory area" />
                <Snapshot icon={BarChart3} value={factory.productionLines || '—'} label="Production lines" />
                <Snapshot icon={PackageCheck} value={factory.monthlyCapacity || '—'} label="Monthly capacity" />
                <Snapshot icon={Globe2} value={exportMarkets.length || '—'} label="Export markets" />
                <Snapshot icon={Building2} value={[trade.oem && 'OEM', trade.odm && 'ODM'].filter(Boolean).join(' / ') || 'On request'} label="Custom service" />
                <Snapshot icon={ShoppingBag} value={productCount || '—'} label="Active products" />
              </div>
              <div className="manufacturer-overview-grid">
                <div>
                  <h3>Company overview</h3>
                  <InfoRows rows={[
                    ['Legal company name', seller.companyName],
                    ['Business type', seller.companyType || seller.businessType],
                    ['Established', seller.yearEstablished],
                    ['Registration number', seller.businessRegistrationNumber],
                    ['Import / export code', seller.importExportCode],
                    ['Accepted languages', seller.languages],
                  ]} />
                </div>
                <div>
                  <h3>Markets and categories</h3>
                  <LabelledTags label="Main products" values={mainProducts} empty="Browse the live catalogue below." />
                  <LabelledTags label="Categories" values={[...categories, ...subcategories]} empty="Categories follow active listings." />
                  <LabelledTags label="Industries served" values={industries} empty="Ask the supplier about your industry." />
                </div>
              </div>
            </section>

            <section className="manufacturer-section-card" id="factory">
              <SectionHeading eyebrow={factoryVerified ? 'Verified facility' : 'Production profile'} title="Factory showcase" icon={Factory} description="Facility, machinery and quality information from the manufacturer profile." badge={factoryVerified ? 'Factory verified' : ''} />
              <div className="manufacturer-factory-grid">
                <div>
                  <InfoRows rows={[
                    ['Factory name', factory.name || factory.factoryName],
                    ['Factory location', formatAddress(factory.address)],
                    ['Floor area', factory.floorArea || factory.factorySize],
                    ['Factory employees', factory.employeeCount],
                    ['Production lines', factory.productionLines],
                    ['Monthly capacity', factory.monthlyCapacity],
                    ['Annual capacity', factory.annualCapacity],
                    ['Last inspection', factory.inspectedAt ? new Date(factory.inspectedAt).toLocaleDateString() : ''],
                  ]} />
                  {factory.description && <p className="manufacturer-section-note">{factory.description}</p>}
                </div>
                <div className="manufacturer-factory-media">
                  {media.slice(0, 4).map((image, index) => <button type="button" onClick={() => { setActiveMedia(index); window.scrollTo({ top: 0, behavior: 'smooth' }) }} key={`${image}-${index}`}><SafeImage src={image} alt={`Factory and company view ${index + 1}`} />{index === 3 && media.length > 4 && <span>+{media.length - 4} more</span>}</button>)}
                  {!media.length && <Empty icon={Images} text="Factory media has not been published." />}
                </div>
              </div>
              {!!normalizeList(factory.machinery).length && <div className="manufacturer-machinery-v2">
                {normalizeList(factory.machinery).slice(0, 6).map((machine, index) => <article key={`${displayValue(machine)}-${index}`}><Factory /><span><b>{typeof machine === 'object' ? machine.name : machine}</b><small>{typeof machine === 'object' ? [machine.model, machine.quantity ? `Quantity ${machine.quantity}` : '', machine.year].filter(Boolean).join(' · ') : 'Production equipment'}</small></span></article>)}
              </div>}
            </section>

            <section className="manufacturer-section-card" id="capabilities">
              <SectionHeading eyebrow="Buyer assurance" title="Production and trade capabilities" icon={ShieldCheck} description="A consolidated view of customization, quality, logistics and export readiness." />
              <div className="manufacturer-capability-columns">
                <Capability title="Manufacturing services" icon={Factory}>
                  <div className="manufacturer-service-flags">
                    {[['OEM service', trade.oem], ['ODM service', trade.odm], ['Private label', trade.privateLabel]].map(([label, enabled]) => <span className={enabled ? 'active' : ''} key={label}>{enabled ? <Check /> : <Clock3 />}{label}</span>)}
                  </div>
                  <LabelledTags label="Production capabilities" values={capabilities} empty="Available on enquiry." />
                </Capability>
                <Capability title="Quality control" icon={FileCheck2}>
                  <p>{trade.qualityAssurance || factory.qualityControl || 'Quality requirements can be confirmed during quotation.'}</p>
                  <LabelledTags label="Published processes" values={factory.qualityProcesses} empty="No public process list." />
                </Capability>
                <Capability title="Commercial terms" icon={ShoppingBag}>
                  <InfoRows rows={[
                    ['Minimum order quantity', trade.minimumOrderQuantity],
                    ['Production lead time', trade.productionLeadTime],
                    ['Origin port', shipping.originPort],
                    ['Handling time', shipping.handlingTime],
                  ]} compact />
                </Capability>
                <Capability title="Trade background" icon={Globe2}>
                  <LabelledTags label="Main export markets" values={exportMarkets} empty="Markets available on request." />
                  <LabelledTags label="Shipping support" values={shipping.shippingSupport} empty="Confirm during negotiation." />
                </Capability>
              </div>
              {trade.rdCapability && <div className="manufacturer-rd-note"><BarChart3 /><span><b>R&amp;D capability</b><p>{trade.rdCapability}</p></span></div>}
            </section>

            <section className="manufacturer-section-card" id="certifications">
              <SectionHeading eyebrow="Document centre" title="Certifications" icon={Award} description="Review available business and production certificates before starting a transaction." />
              {certifications.length ? <div className="manufacturer-certificate-grid">
                {certifications.map((cert, index) => <CertificateCard cert={cert} index={index} key={`${certificateName(cert, index)}-${index}`} />)}
              </div> : <Empty icon={Award} text="No public certifications are currently available." />}
            </section>

            <section className="manufacturer-section-card" id="products">
              <SectionHeading eyebrow="Supplier catalogue" title="Main products" icon={PackageCheck} description={`${productCount || products.length} active products associated with this manufacturer.`} action={<Link to={`/products?seller=${sellerId}`}>View full catalogue <ChevronRight /></Link>} />
              {products.length ? <div className="manufacturer-product-grid-v2">
                {products.slice(0, 12).map(product => <ManufacturerProduct product={product} verified={verified} requestQuote={requestQuote} key={product._id || product.id} />)}
              </div> : <Empty icon={PackageCheck} text="No public products are currently listed." />}
            </section>

            <section className="manufacturer-section-card" id="reviews">
              <SectionHeading eyebrow="Buyer feedback" title={`Reviews${reviewCount ? ` (${reviewCount})` : ''}`} icon={Star} description="Ratings and purchase feedback from EsyGlob marketplace buyers." />
              <ReviewExperience reviews={reviews} rating={rating} reviewCount={reviewCount} />
            </section>

            <section className="manufacturer-section-card" id="media">
              <SectionHeading eyebrow="Inside the business" title="Company gallery and videos" icon={Video} description="Office, factory, warehouse and production media published by the supplier." />
              {!!media.length && <div className="manufacturer-gallery-v2">{media.map((image, index) => <a href={resolveApiResourceUrl(image)} target="_blank" rel="noreferrer" key={`${image}-${index}`}><SafeImage src={image} alt={`Company media ${index + 1}`} /><span><Images /> View image</span></a>)}</div>}
              {!!videos.length && <div className="manufacturer-video-grid-v2">{videos.map((url, index) => <article key={`${url}-${index}`}><video controls preload="metadata"><source src={resolveApiResourceUrl(url)} /></video><p><Play /> Company video {index + 1}</p></article>)}</div>}
              {!media.length && !videos.length && <Empty icon={Images} text="No company media is currently available." />}
              {!!seller.brochures?.length && <div className="manufacturer-brochure-row">{seller.brochures.map((url, index) => <a href={resolveApiResourceUrl(url)} target="_blank" rel="noreferrer" key={`${url}-${index}`}><Download /><span><b>Company brochure {index + 1}</b><small>Open or download document</small></span><ExternalLink /></a>)}</div>}
            </section>
          </div>

          <ContactRail seller={seller} sellerId={sellerId} name={name} logo={logo} verified={verified} sampleAvailable={Boolean(sampleProduct)} busy={busy} actions={actions} />
        </div>
      </div>

      <MobileActionBar busy={busy} seller={seller} actions={actions} />
      {enquiryProduct && <div className="seller-enquiry-backdrop" role="presentation" onMouseDown={() => !enquiryBusy && setEnquiryProduct(null)}>
        <form className="seller-enquiry-composer" role="dialog" aria-modal="true" aria-labelledby="seller-enquiry-title" onSubmit={sendEnquiry} onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span>Direct supplier message</span><h2 id="seller-enquiry-title">Send enquiry to {name}</h2></div><button type="button" onClick={() => setEnquiryProduct(null)} aria-label="Close"><span aria-hidden="true">×</span></button></header>
          {enquiryProduct.name && <p className="seller-enquiry-product"><b>Product</b><span>{enquiryProduct.name}</span><small>ID: {enquiryProduct._id || enquiryProduct.id}</small></p>}
          <label><span>Message *</span><textarea rows="6" required maxLength="5000" value={enquiry.message} onChange={(event) => setEnquiry({ ...enquiry, message: event.target.value })} placeholder="Describe the product, specifications, timeline, or questions for this manufacturer." /></label>
          <div className="seller-enquiry-fields"><label><span>Quantity (optional)</span><input type="number" min="1" value={enquiry.quantity} onChange={(event) => setEnquiry({ ...enquiry, quantity: event.target.value })} /></label><label><span>Unit</span><select value={enquiry.unit} onChange={(event) => setEnquiry({ ...enquiry, unit: event.target.value })}><option value="pcs">Pieces</option><option value="kg">Kilograms</option><option value="boxes">Boxes</option><option value="tons">Tons</option><option value="meters">Meters</option><option value="other">Other</option></select></label></div>
          {actionError && <p className="inline-error" role="alert">{actionError}</p>}
          {enquirySuccess && <p className="seller-enquiry-success">{enquirySuccess}</p>}
          <footer><button type="button" className="button button--secondary" onClick={() => setEnquiryProduct(null)}>Close</button>{enquiryProduct.chatId && <button type="button" className="button button--secondary" onClick={() => navigate(`/messages/${enquiryProduct.chatId}`)}>Open chat</button>}<button type="submit" className="button button--primary" disabled={enquiryBusy || !enquiry.message.trim()}><Send /> {enquiryBusy ? 'Sending…' : 'Send enquiry'}</button></footer>
        </form>
      </div>}
    </main>
  </AppShell>
}

function MediaShowcase({ media, cover, activeMedia, setActiveMedia, videos }) {
  return <div className="manufacturer-showcase">
    <div className="manufacturer-showcase__main">
      {cover ? <SafeImage src={cover} alt="Company and factory showcase" /> : <div className="manufacturer-showcase__placeholder"><Factory /><span>Manufacturer showcase</span></div>}
      {!!videos.length && <button type="button" onClick={() => scrollToSection('media')} className="manufacturer-video-pill"><Play /> Watch company video</button>}
      <span className="manufacturer-showcase__label"><ShieldCheck /> Supplier-published media</span>
    </div>
    {!!media.length && <div className="manufacturer-showcase__thumbs">
      {media.slice(0, 5).map((image, index) => <button type="button" className={activeMedia === index ? 'active' : ''} onClick={() => setActiveMedia(index)} key={`${image}-${index}`}><SafeImage src={image} alt={`Showcase thumbnail ${index + 1}`} />{index === 4 && media.length > 5 && <span>+{media.length - 5}</span>}</button>)}
    </div>}
  </div>
}

function ContactRail({ seller, sellerId, name, logo, verified, sampleAvailable, busy, actions }) {
  return <aside className="manufacturer-contact-rail">
    <div className="manufacturer-contact-rail__trust"><ShieldCheck /><span><b>Contact with confidence</b><small>Trade through EsyGlob’s verified workflow</small></span></div>
    <div className="manufacturer-contact-rail__company">
      <div>{logo ? <SafeImage src={logo} alt="" /> : initials(name)}</div>
      <span><b>{name}</b><small>{verified ? <><BadgeCheck /> Verified supplier</> : 'Marketplace supplier'}</small></span>
    </div>
    <button type="button" className="primary" disabled={busy || !seller.userId} onClick={actions.contactSupplier}><MessageSquare /> {busy ? 'Opening chat…' : 'Chat now'}</button>
    <button type="button" onClick={actions.requestQuote}><Send /> Send enquiry</button>
    <button type="button" disabled={!sampleAvailable} onClick={actions.orderSample}><PackageCheck /> {sampleAvailable ? 'Order a sample' : 'Samples on request'}</button>
    <Link to={`/products?seller=${sellerId}`}><ShoppingBag /> View catalogue</Link>
    <div className="manufacturer-contact-rail__save"><WishlistButton type="supplier" itemId={sellerId} className="manufacturer-save-button" /><span><Heart /> Save manufacturer</span></div>
    <div className="manufacturer-contact-rail__assurance">
      <span><CheckCircle2 /> Protected enquiry workflow</span>
      <span><Clock3 /> Response: {seller.responseTime || (seller.averageResponseTimeHours ? `${seller.averageResponseTimeHours}h avg.` : 'ask supplier')}</span>
      <span><ShieldCheck /> Supplier details are audit-ready</span>
    </div>
  </aside>
}

function MobileActionBar({ busy, seller, actions }) {
  return <div className="manufacturer-mobile-actions">
    <button type="button" disabled={busy || !seller.userId} onClick={actions.contactSupplier}><MessageSquare /><span>Chat</span></button>
    <button type="button" onClick={actions.requestQuote}><Send /><span>Enquiry</span></button>
    <button type="button" className="primary" onClick={actions.orderSample}><PackageCheck /><span>Sample</span></button>
  </div>
}

function ManufacturerProduct({ product, verified, requestQuote }) {
  const id = product._id || product.id
  const image = product.image || product.images?.[0]
  const price = product.price || product.priceTiers?.[0]?.unitPrice
  const maxPrice = product.maxPrice
  const moq = product.minimumOrderQuantity || product.moq || 1
  return <article className="manufacturer-product-v2">
    <Link to={`/products/${id}`} className="manufacturer-product-v2__image">
      <SafeImage src={image} alt={product.name || 'Product'} />
      {verified && <span><ShieldCheck /> Verified supplier</span>}
      {product.sampleAvailable && <i>Sample available</i>}
    </Link>
    <div className="manufacturer-product-v2__body">
      <Link to={`/products/${id}`}><h3>{product.name || 'Supplier product'}</h3></Link>
      <strong>{price ? <><Money value={price} currency={product.currency} />{maxPrice ? <> – <Money value={maxPrice} currency={product.currency} /></> : null}</> : 'Request latest price'}</strong>
      <small>MOQ {moq} {product.unit || 'piece'}{moq > 1 ? 's' : ''}</small>
      <div><Link to={`/products/${id}`}>View details</Link><button type="button" onClick={() => requestQuote(product)}><Send /> Enquire</button></div>
    </div>
  </article>
}

function CertificateCard({ cert, index }) {
  const name = certificateName(cert, index)
  const url = typeof cert === 'object' ? cert.documentUrl || cert.url : ''
  const status = typeof cert === 'object' ? cert.status : ''
  const isImage = /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url)
  return <article className="manufacturer-certificate-v2">
    <div className="manufacturer-certificate-v2__preview">{url && isImage ? <SafeImage src={url} alt={`${name} certificate`} /> : <Award />}</div>
    <div>
      <span className={status === 'verified' ? 'verified' : ''}>{status === 'verified' ? <BadgeCheck /> : <FileCheck2 />}{formatLabel(status || 'Published')}</span>
      <h3>{name}</h3>
      <p>{typeof cert === 'object' ? [cert.issuer, cert.certificateNumber, cert.expiryDate ? `Valid until ${new Date(cert.expiryDate).toLocaleDateString()}` : ''].filter(Boolean).join(' · ') : 'Company certification'}</p>
      {url ? <a href={resolveApiResourceUrl(url)} target="_blank" rel="noreferrer"><ExternalLink /> View certificate</a> : <small>Certificate details available from supplier</small>}
    </div>
  </article>
}

function ReviewExperience({ reviews, rating, reviewCount }) {
  const breakdown = useMemo(() => {
    const values = reviews.map(reviewRating).filter(Boolean)
    return [5, 4, 3, 2, 1].map(star => [star, values.length ? Math.round((values.filter(value => Math.round(value) === star).length / values.length) * 100) : 0])
  }, [reviews])
  const dimensions = [
    ['Product quality', averageDimension(reviews, 'quality')],
    ['Supplier communication', averageDimension(reviews, 'communication')],
    ['On-time shipping', averageDimension(reviews, 'shipping')],
  ]
  return <div className="manufacturer-review-experience">
    <div className="manufacturer-review-summary">
      <div><strong>{rating ? rating.toFixed(1) : '—'}</strong><Stars value={rating} /><span>{reviewCount ? `${reviewCount} reviews` : 'No ratings yet'}</span></div>
      <div className="manufacturer-rating-bars">{breakdown.map(([star, percent]) => <span key={star}><small>{star} <Star /></small><i><b style={{ width: `${percent}%` }} /></i><em>{percent}%</em></span>)}</div>
      <div className="manufacturer-review-dimensions">{dimensions.map(([label, value]) => <span key={label}><small>{label}</small><b>{value ? value.toFixed(1) : '—'}</b></span>)}</div>
    </div>
    {reviews.length ? <div className="manufacturer-review-list">{reviews.slice(0, 6).map((review, index) => <article key={review._id || index}>
      <div className="manufacturer-review-buyer"><i>{reviewerName(review).slice(0, 1).toUpperCase()}</i><span><b>{reviewerName(review)}</b><small>{review.buyerCountry || review.userId?.country || 'EsyGlob buyer'}{review.createdAt ? ` · ${new Date(review.createdAt).toLocaleDateString()}` : ''}</small></span></div>
      <div><Stars value={reviewRating(review)} />{review.title && <h3>{review.title}</h3>}<p>{review.comment || review.review || review.content}</p>{review.verifiedPurchase && <small className="verified-purchase"><CheckCircle2 /> Verified purchase</small>}
        {!!review.images?.length && <div className="manufacturer-review-images">{review.images.map((image, imageIndex) => <a href={resolveApiResourceUrl(image)} target="_blank" rel="noreferrer" key={`${image}-${imageIndex}`}><SafeImage src={image} alt="Buyer review" /></a>)}</div>}
        {review.productId && <div className="manufacturer-review-purchase"><ShoppingBag /><span><b>{review.productId.name || 'Product purchase'}</b><small>Purchase information verified through EsyGlob</small></span></div>}
      </div>
    </article>)}</div> : <Empty icon={Star} text="This supplier has not received a published buyer review yet." />}
  </div>
}

function SectionHeading({ eyebrow, title, icon: Icon, description, badge, action }) {
  return <header className="manufacturer-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2><Icon /> {title}</h2><p>{description}</p></div>{badge && <span className="manufacturer-section-badge"><BadgeCheck /> {badge}</span>}{action}</header>
}
function Snapshot({ icon: Icon, value, label }) { return <article><Icon /><span><b>{displayValue(value)}</b><small>{label}</small></span></article> }
function Proof({ value, label }) { return <div className="manufacturer-proof"><strong>{displayValue(value)}</strong><span>{label}</span></div> }
function Capability({ title, icon: Icon, children }) { return <article className="manufacturer-capability"><h3><Icon /> {title}</h3>{children}</article> }
function LabelledTags({ label, values, empty }) { return <div className="manufacturer-labelled-tags"><h4>{label}</h4><TagList values={values} empty={empty} /></div> }
function Empty({ icon: Icon, text }) { return <div className="manufacturer-empty-v2"><Icon /><p>{text}</p></div> }
function InfoRows({ rows, compact = false }) { return <dl className={`manufacturer-info-v2 ${compact ? 'compact' : ''}`}>{rows.filter(([, value]) => hasValue(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl> }
function TagList({ values = [], empty }) { const list = normalizeList(values); return list.length ? <div className="manufacturer-tags-v2">{list.map((value, index) => <span key={`${displayValue(value)}-${index}`}>{displayValue(value)}</span>)}</div> : <p className="manufacturer-muted">{empty}</p> }
function Stars({ value = 0 }) { return <span className="manufacturer-stars-v2" aria-label={`${Number(value || 0).toFixed(1)} out of 5 stars`}>{[1, 2, 3, 4, 5].map(star => <Star className={star <= Math.round(Number(value || 0)) ? 'filled' : ''} key={star} />)}</span> }
function scrollToSection(id) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function normalizeList(value) { if (!value) return []; if (Array.isArray(value)) return value.filter(hasValue); return String(value).split(',').map(item => item.trim()).filter(Boolean) }
function uniqueMedia(values) { return [...new Set(values.flatMap(value => typeof value === 'string' ? [value] : value?.url ? [value.url] : []).filter(Boolean))] }
function hasValue(value) { return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0) }
function displayValue(value) { if (Array.isArray(value)) return value.map(displayValue).join(', '); if (typeof value === 'object') return value.name || Object.values(value).filter(item => typeof item !== 'object' && hasValue(item)).join(', '); return formatLabel(String(value)) }
function formatLabel(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
function formatAddress(value = {}) { return [value.street, value.city, value.state, value.country, value.pincode || value.zipCode].filter(Boolean).join(', ') }
function reviewerName(review) { return review.userId?.fullName || review.userName || review.reviewerName || 'Marketplace buyer' }
function reviewRating(review) { return Number(review.rating?.overall || review.overallRating || (typeof review.rating === 'number' ? review.rating : 0)) }
function averageReviewRating(reviews) { if (!reviews.length) return 0; return reviews.reduce((sum, review) => sum + reviewRating(review), 0) / reviews.length }
function averageDimension(reviews, key) { const values = reviews.map(review => Number(review.rating?.[key] || 0)).filter(Boolean); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
function initials(value) { return String(value || 'ES').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() }
function numberLabel(value) { const number = Number(value || 0); return number >= 1000 ? `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k+` : String(number) }
function certificateName(cert, index) { return typeof cert === 'string' ? cert : cert.name || cert.certificateNumber || `Certificate ${index + 1}` }
