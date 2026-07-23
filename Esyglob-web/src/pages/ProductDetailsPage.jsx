/* eslint-disable react-hooks/set-state-in-effect */
import { BadgeCheck, Camera, Check, ChevronLeft, ChevronRight, Copy, CreditCard, FileCheck2, FileText, Globe2, MapPin, Maximize2, MessageSquare, Minus, PackageCheck, Paperclip, Plus, Send, Share2, ShieldCheck, Star, Store, Truck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchProductDetails, fetchProducts, startProductChat, submitProductEnquiry, trackRecentlyViewed } from '../api/marketplace'
import { uploadFiles } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { ProductCard, SafeImage, SkeletonCards } from '../components/MarketplaceCards'
import ProductReviews from '../components/ProductReviews'
import { Money } from '../components/TradeUI'
import WishlistButton from '../components/WishlistButton'
import useAsyncData from '../hooks/useAsyncData'

export default function ProductDetailsPage() {
  const { productId } = useParams()
  const details = useAsyncData(useCallback(() => fetchProductDetails(productId), [productId]))
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  const product = details.data?.product || {}
  const categoryName = typeof product.category === 'object' ? product.category.name : product.category || ''
  const related = useAsyncData(useCallback(async () => categoryName ? (await fetchProducts({ category: categoryName, limit: 10 })).products.filter((item) => String(item._id || item.id) !== String(productId)) : [], [categoryName, productId]))
  
  const [selectedImage, setSelectedImage] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [enquiryOpen, setEnquiryOpen] = useState(false)
  const [variantIndex, setVariantIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('piece')
  const [action, setAction] = useState({ busy: false, message: '', error: '' })
  
  useEffect(() => { if (status === 'authenticated' && productId) trackRecentlyViewed(productId).catch(() => {}) }, [productId, status])
  
  const data = details.data || {}
  const seller = data.seller || product.sellerId || {}
  const images = [product.image, ...(product.images || []), ...(product.gallery || [])].filter((value, index, list) => value && list.indexOf(value) === index)
  const variants = product.variants?.filter((item) => item.isActive !== false) || []
  const variant = variants[variantIndex]
  const moq = Number(variant?.minimumOrderQuantity || product.moq || product.minimumOrderQuantity || 1)
  const tiers = useMemo(() => [...(product.priceTiers || [])].sort((a, b) => Number(a.minimumQuantity || a.minQty || 0) - Number(b.minimumQuantity || b.minQty || 0)), [product.priceTiers])
  const eligibleTier = tiers.filter((tier) => quantity >= Number(tier.minimumQuantity || tier.minQty || 1)).at(-1)
  const price = Number(eligibleTier?.unitPrice || eligibleTier?.price || variant?.price || product.price || 0)
  const units = product.availableUnits?.length ? product.availableUnits : [product.unit || 'piece']
  const sellerId = seller._id || seller.id
  const sellerUserId = seller.userId?._id || seller.userId || product.userId?._id || product.userId
  
  useEffect(() => { setQuantity(moq); setUnit(product.unit || 'piece') }, [moq, product.unit])
  
  function authAction(callback) { if (status !== 'authenticated') return navigate('/login', { state: { from: location.pathname, notice: 'Sign in to contact suppliers and use account features.' } }); callback() }
  async function chat() { setAction({ busy: true, message: '', error: '' }); try { const created = await startProductChat({ otherUserId: sellerUserId, productId }); const id = created.chat?._id || created._id; navigate(id ? `/messages/${id}` : '/messages') } catch (error) { setAction({ busy: false, message: '', error: error.message }) } }
  async function share() { try { if (navigator.share) await navigator.share({ title: product.name, text: product.name, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); setAction({ busy: false, message: 'Product link copied.', error: '' }) } } catch (error) { if (error.name !== 'AbortError') setAction({ busy: false, message: '', error: 'Unable to share this product.' }) } }
  function enquiry() { authAction(() => setEnquiryOpen(true)) }
  function startRfq() { authAction(() => navigate('/rfqs/new', { state: { product: { ...product, requestedQuantity: quantity, requestedUnit: unit, selectedVariant: variant }, sellerUserId } })) }
  
  if (details.loading) return <AppShell><div className="detail-page container"><SkeletonCards count={4} /></div></AppShell>
  if (details.error) return <AppShell><div className="detail-page container"><div className="inline-error">{details.error.message}</div></div></AppShell>
  
  const certifications = normalizeList(product.certifications || seller.certifications)
  const payments = normalizeList(product.paymentMethods || seller.paymentMethods || ['Secure platform payment'])
  
  return (
    <AppShell>
      <div className="detail-page product-native-detail container">
        <nav className="breadcrumbs">
          <Link to="/home">Home</Link><ChevronRight />
          <Link to="/products">Products</Link><ChevronRight />
          <span>{product.name}</span>
        </nav>
        
        <section className="product-detail-top">
          <ProductGallery product={product} images={images} selected={selectedImage} setSelected={setSelectedImage} setZoom={setZoom} share={share} authAction={authAction} navigate={navigate} productId={productId} />
          
          <div className="product-summary">
            <span className="eyebrow">{categoryName || 'Marketplace product'}</span>
            <h1>{product.name}</h1>
            
            <div className="rating-summary">
              <span><Star /> {Number(product.rating || product.averageRating || 0).toFixed(1)}</span>
              <a href="#reviews">{product.reviewCount || 0} reviews</a>
              {(seller.isVerified || seller.verificationStatus === 'verified') && <i><ShieldCheck /> Verified supplier</i>}
            </div>
            
            <div className="detail-price"><Money value={price} currency={product.currency} /> <small>/ {unit}</small></div>
            
            <MoqSelector tiers={tiers} quantity={quantity} setQuantity={setQuantity} currency={product.currency} unit={unit} />
            
            {variants.length > 0 && (
              <div className="variant-selector">
                <label>Choose variant</label>
                <div>
                  {variants.map((item, index) => (
                    <button type="button" className={variantIndex === index ? 'active' : ''} key={item._id || item.sku || index} onClick={() => setVariantIndex(index)}>
                      {item.name || item.sku || Object.values(item.attributes || {}).join(' / ') || `Option ${index + 1}`} {variantIndex === index && <Check />}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="order-config">
              <div>
                <label>Quantity</label>
                <div className="quantity-stepper">
                  <button type="button" onClick={() => setQuantity(Math.max(moq, quantity - 1))} disabled={quantity <= moq}><Minus /></button>
                  <input aria-label="Order quantity" type="number" min={moq} value={quantity} onChange={(event) => setQuantity(Math.max(moq, Number(event.target.value) || moq))} />
                  <button type="button" onClick={() => setQuantity(quantity + 1)}><Plus /></button>
                </div>
                <small>Minimum order {moq}</small>
              </div>
              <label>Unit<select value={unit} onChange={(event) => setUnit(event.target.value)}>{units.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            
            <div className="order-total">
              <span>Estimated product total</span>
              <b><Money value={price * quantity} currency={product.currency} /></b>
              <small>Shipping, duties and taxes are quoted separately.</small>
            </div>

            {/* Sample Order Link */}
            {product.sampleAvailable && (
              <div className="sample-order-link">
                <button onClick={enquiry} className="sample-order-btn">
                  <PackageCheck size={15} className="text-blue-600 flex-shrink-0" />
                  <span className="flex-1 text-left font-semibold text-gray-700">Request sample order</span>
                  <span className="text-blue-600 font-bold text-xs">
                    {product.samplePrice ? <Money value={product.samplePrice} currency={product.currency} /> : 'Ask for price'}
                  </span>
                  <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                </button>
              </div>
            )}
            
            <div className="trust-row">
              <span><ShieldCheck /> Buyer protection</span>
              <span><BadgeCheck /> Supplier checked</span>
              <span><Truck /> Logistics support</span>
            </div>
            
            {action.error && <p className="action-error">{action.error}</p>}
            {action.message && <p className="action-success">{action.message}</p>}
            
            {/* Desktop: Pricing ke paas action buttons */}
            <div className="product-actions">
              {sellerId && (
                <Link to={`/sellers/${sellerId}`} className="button button--secondary">
                  <Store size={15} /> Store
                </Link>
              )}
              <button className="button button--secondary" disabled={action.busy || !sellerUserId} onClick={() => authAction(chat)}>
                <MessageSquare size={15} /> Chat Now
              </button>
              <button className="button button--primary" disabled={!sellerUserId} onClick={startRfq}>
                <FileText size={15} /> Send RFQ
              </button>
            </div>
            
            <button className="product-copy-action" onClick={() => navigator.clipboard.writeText(`${product.name} — ${quantity} ${unit}`)}>
              <Copy /> Copy product requirement
            </button>
          </div>
        </section>
        
        {/* Mobile: Sticky bottom bar */}
        <ProductTradeActions 
          disabled={action.busy || !sellerUserId} 
          onContact={() => authAction(chat)} 
          onRfq={startRfq}
          sellerId={sellerId}
        />
        
        <div className="product-native-flow">
          <InfoSection icon={PackageCheck} title="Product information">
            <p className="product-description">{product.description || product.shortDescription || 'Product description is provided by the supplier.'}</p>
            <InfoRows rows={[['Brand', product.brand], ['Product type', product.productType], ['Model / SKU', product.sku || product.modelNumber], ['Country of origin', product.countryOfOrigin], ['HS code', product.hsCode]]} />
          </InfoSection>
          <InfoSection icon={FileCheck2} title="Specifications"><Specifications product={product} /></InfoSection>
          <div className="product-info-pair">
            <InfoSection icon={Truck} title="Shipping information">
              <InfoRows rows={[['Lead time', formatTime(product.leadTime)], ['Delivery estimate', formatTime(product.deliveryTime)], ['Ships from', product.shippingOrigin || product.countryOfOrigin], ['Incoterms', normalizeList(product.incoterms).join(', ')], ['Packaging', product.packagingDetails || product.packagingType]]} />
            </InfoSection>
            <InfoSection icon={CreditCard} title="Payment information">
              <InfoRows rows={[['Accepted methods', payments.join(', ')], ['Payment terms', product.paymentTerms], ['Sample available', product.sampleAvailable ? 'Yes' : 'Ask supplier'], ['Direct order', product.directOrderEnabled ? 'Available' : 'Request quotation']]} />
            </InfoSection>
          </div>
          <InfoSection icon={ShieldCheck} title="Trade assurance & certifications">
            <div className="assurance-grid">
              <span><ShieldCheck /><b>Buyer protection</b><small>Marketplace-supported trade workflow</small></span>
              <span><BadgeCheck /><b>{seller.isVerified || seller.verificationStatus === 'verified' ? 'Verified supplier' : 'Supplier profile'}</b><small>Business information and trust signals</small></span>
              {certifications.map((item) => <span key={typeof item === 'string' ? item : item.name}><FileCheck2 /><b>{typeof item === 'string' ? item : item.name}</b><small>{typeof item === 'object' ? item.issuer || item.status : 'Product certification'}</small></span>)}
            </div>
          </InfoSection>
          <SupplierSection seller={seller} sellerId={sellerId} sellerUserId={sellerUserId} chat={() => authAction(chat)} />
        </div>
        
        <ProductReviews productId={productId} sellerId={sellerId} />
        <ProductRail title="Related products" products={related.data || []} loading={related.loading} category={categoryName} />
        <ProductRail title="Similar products" products={data.similarProducts || []} category={categoryName} />
        
        {enquiryOpen && <ProductEnquiryModal product={product} productId={productId} sellerUserId={sellerUserId} initialQuantity={quantity} unit={unit} onClose={() => setEnquiryOpen(false)} onStartRfq={startRfq} onSubmitted={() => { setEnquiryOpen(false); setAction({ busy: false, error: '', message: 'Your enquiry was sent to the supplier.' }) }} />}
        {zoom && <div className="image-zoom-modal" onClick={() => setZoom(false)}><button aria-label="Close zoom"><X /></button><img src={images[selectedImage]} alt={product.name} onClick={(event) => event.stopPropagation()} /></div>}
      </div>
    </AppShell>
  )
}

function ProductTradeActions({ disabled, onContact, onRfq, sellerId }) {
  return (
    <>
      <div className="product-trade-actions" aria-label="Supplier actions">
        {sellerId && (
          <Link to={`/sellers/${sellerId}`} className="trade-store-btn" title="View Store">
            <Store size={18} />
          </Link>
        )}
        <button className="trade-chat-btn" disabled={disabled} onClick={onContact}>
          <MessageSquare size={15} /> <span>Chat Now</span>
        </button>
        <button className="trade-rfq-btn" disabled={disabled} onClick={onRfq}>
          <FileText size={15} /> <span>Send RFQ</span>
        </button>
      </div>

      <style>{`
        /* ============================================ */
        /* PRODUCT TRADE ACTIONS - MOBILE ONLY STICKY */
        /* ============================================ */

        .product-trade-actions {
          display: none;  /* Desktop me hide */
          align-items: center;
          gap: 8px;
          z-index: 100;
        }

        /* ─── Desktop: Hidden ─── */
        @media(min-width: 769px) {
          .product-trade-actions {
            display: none !important;
          }
        }

        /* ─── Mobile: Fixed Bottom Bar ─── */
        @media(max-width: 768px) {
          .product-trade-actions {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 8px 12px;
            padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.08);
            gap: 6px;
            animation: slideUpBar 0.3s ease;
          }
        }

        @keyframes slideUpBar {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        /* ─── Store Button ─── */
        .trade-store-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 10px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          color: #4b5563;
          transition: all 0.2s ease;
          flex-shrink: 0;
          text-decoration: none;
          cursor: pointer;
        }

        .trade-store-btn:active {
          transform: scale(0.95);
          background: #e5e7eb;
        }

        /* ─── Chat Now Button (Orange) ─── */
        .trade-chat-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 1;
          min-width: 0;
          padding: 0 14px;
          height: 40px;
          border-radius: 10px;
          background: #f97316;
          border: 1px solid #f97316;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 2px 8px rgba(249, 115, 22, 0.2);
          font-family: inherit;
          white-space: nowrap;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .trade-chat-btn:active:not(:disabled) {
          transform: scale(0.97);
          background: #ea580c;
        }

        .trade-chat-btn:disabled {
          background: #f3f4f6;
          border-color: #e5e7eb;
          color: #9ca3af;
          cursor: not-allowed;
          box-shadow: none;
          opacity: 0.6;
        }

        /* ─── Send RFQ Button (Blue) ─── */
        .trade-rfq-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 1;
          min-width: 0;
          padding: 0 14px;
          height: 40px;
          border-radius: 10px;
          background: #2563eb;
          border: 1px solid #2563eb;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
          font-family: inherit;
          white-space: nowrap;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .trade-rfq-btn:active:not(:disabled) {
          transform: scale(0.97);
          background: #1d4ed8;
        }

        .trade-rfq-btn:disabled {
          background: #f3f4f6;
          border-color: #e5e7eb;
          color: #9ca3af;
          cursor: not-allowed;
          box-shadow: none;
          opacity: 0.6;
        }

        /* ─── Mobile Sizes ─── */
        @media(max-width: 768px) {
          .trade-store-btn {
            width: 38px;
            height: 38px;
            min-width: 38px;
            border-radius: 8px;
          }

          .trade-chat-btn,
          .trade-rfq-btn {
            height: 38px;
            padding: 0 12px;
            font-size: 12px;
            border-radius: 8px;
            gap: 5px;
          }
        }

        /* ─── Small Mobile ─── */
        @media(max-width: 380px) {
          .product-trade-actions {
            gap: 5px;
            padding: 6px 8px;
            padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
          }

          .trade-store-btn {
            width: 34px;
            height: 34px;
            min-width: 34px;
          }

          .trade-chat-btn,
          .trade-rfq-btn {
            height: 34px;
            padding: 0 10px;
            font-size: 11px;
            gap: 4px;
          }
        }

        /* ─── Only Icons on Very Small ─── */
        @media(max-width: 340px) {
          .trade-chat-btn span,
          .trade-rfq-btn span {
            display: none;
          }

          .trade-chat-btn,
          .trade-rfq-btn {
            flex: 0 1 auto;
            padding: 0;
            width: 38px;
            min-width: 38px;
            border-radius: 50%;
          }
        }
      `}</style>
    </>
  );
}

function ProductEnquiryModal({ product, productId, sellerUserId, initialQuantity, unit, onClose, onStartRfq, onSubmitted }) {
  const [message, setMessage] = useState(`Hello, I am interested in ${product.name || 'this product'}. Please share availability and commercial details.`)
  const [quantity, setQuantity] = useState(initialQuantity)
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function attach(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploading(true); setError('')
    try {
      const uploads = await uploadFiles(files, 'product-enquiries')
      setAttachments((current) => [...current, ...uploads.map((file, index) => ({ url: file.secure_url || file.url || file.location, name: file.name || file.originalName || files[index]?.name, type: file.mimeType || file.type || files[index]?.type, mimeType: file.mimeType || file.type || files[index]?.type, size: file.size || files[index]?.size }))])
    } catch (next) { setError(next.message) }
    finally { setUploading(false); event.target.value = '' }
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || uploading || !message.trim()) return
    setBusy(true); setError('')
    try {
      await submitProductEnquiry({ otherUserId: sellerUserId, productId, productName: product.name, content: message.trim(), quantity: Math.max(1, Number(quantity) || 1), unit, notes: notes.trim(), attachments })
      onSubmitted()
    } catch (next) { setError(next.message); setBusy(false) }
  }

  return (
    <div className="modal-backdrop enquiry-modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section className="enquiry-modal" role="dialog" aria-modal="true" aria-labelledby="enquiry-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">Quick supplier enquiry</span>
            <h2 id="enquiry-title">Send enquiry</h2>
            <p>Ask a question without creating a formal RFQ.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close enquiry"><X /></button>
        </header>
        <form onSubmit={submit}>
          <label>Enquiry message<textarea rows="5" maxLength="3000" required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what you need from the supplier" /></label>
          <div className="enquiry-modal-grid">
            <label>Quantity<input type="number" min="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <label>Unit<input value={unit} readOnly /></label>
          </div>
          <label>Additional notes<textarea rows="3" maxLength="1500" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Packaging, samples, target date, or questions (optional)" /></label>
          <label className="enquiry-upload">
            <Paperclip />
            <span><b>{uploading ? 'Uploading files…' : 'Add attachments'}</b><small>Images, PDF, Word or spreadsheets</small></span>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={attach} disabled={busy || uploading} />
          </label>
          {attachments.length > 0 && (
            <div className="enquiry-files">
              {attachments.map((file, index) => (
                <span key={`${file.url}-${index}`}>
                  <FileText /><b>{file.name || `Attachment ${index + 1}`}</b>
                  <button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name || 'attachment'}`}><X /></button>
                </span>
              ))}
            </div>
          )}
          {error && <p className="action-error">{error}</p>}
          <footer>
            <button type="button" className="button button--secondary" disabled={busy} onClick={onStartRfq}><FileText /> Create full RFQ</button>
            <button className="button button--primary" disabled={busy || uploading || !message.trim()}>{busy ? 'Sending…' : <><Send /> Send enquiry</>}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function ProductGallery({ product, images, selected, setSelected, setZoom, share, authAction, navigate, productId }) {
  return (
    <div className="product-gallery">
      <div className="product-gallery__main" onClick={() => images.length && setZoom(true)}>
        <SafeImage src={images[selected]} alt={product.name || 'Product'} className="product-gallery__image" />
        <button className="gallery-zoom" aria-label="Zoom image"><Maximize2 /> Zoom</button>
        <div className="gallery-actions" onClick={(event) => event.stopPropagation()}>
          <WishlistButton itemId={productId} className="outline-icon" />
          <button className="outline-icon" onClick={share} aria-label="Share product"><Share2 /></button>
          <button className="outline-icon" onClick={() => authAction(() => navigate('/explore/image-search'))} aria-label="Search with another image"><Camera /></button>
        </div>
        {images.length > 1 && (
          <>
            <button className="gallery-arrow prev" onClick={(event) => { event.stopPropagation(); setSelected((selected - 1 + images.length) % images.length) }}><ChevronLeft /></button>
            <button className="gallery-arrow next" onClick={(event) => { event.stopPropagation(); setSelected((selected + 1) % images.length) }}><ChevronRight /></button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="thumbnail-strip">
          {images.map((image, index) => (
            <button key={image} className={selected === index ? 'active' : ''} onClick={() => setSelected(index)}>
              <img src={image} alt={`${product.name} view ${index + 1}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MoqSelector({ tiers, quantity, setQuantity, currency, unit }) {
  if (!tiers.length) return null
  return (
    <div className="product-moq-selector">
      <header><b>Select quantity range</b><span>{quantity} units selected</span></header>
      <div>
        {tiers.map((tier, index) => {
          const min = Number(tier.minimumQuantity || tier.minQty || 1)
          const max = tier.maximumQuantity || tier.maxQty
          const next = Number(tiers[index + 1]?.minimumQuantity || tiers[index + 1]?.minQty || 0)
          const active = quantity >= min && (!next || quantity < next)
          return (
            <button className={active ? 'active' : ''} onClick={() => setQuantity(min)} key={index}>
              <b>{max ? `${min} - ${max}` : `${min}+`}</b>
              <span><Money value={tier.unitPrice || tier.price} currency={currency} /></span>
              <small>/ {unit}</small>
              {active && <Check />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function InfoSection({ icon: Icon, title, children }) {
  return <section className="product-info-section"><header><i><Icon /></i><h2>{title}</h2></header>{children}</section>
}

function InfoRows({ rows }) {
  const visible = rows.filter(([, value]) => value !== undefined && value !== null && value !== '')
  return visible.length ? (
    <dl className="product-info-rows">
      {visible.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}
    </dl>
  ) : <p className="empty-copy">Ask the supplier for more information.</p>
}

function Specifications({ product }) {
  const source = product.specifications || product.attributes || {}
  const entries = Array.isArray(source) ? source.map((item) => [item.name || item.key, item.value]) : Object.entries(source)
  return entries.length ? (
    <dl className="spec-grid">
      {entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}
    </dl>
  ) : <InfoRows rows={[['Material', product.material], ['Warranty', product.warranty], ['Customization', product.customizationAvailable ? 'Available' : 'Ask supplier']]} />
}

function SupplierSection({ seller, sellerId, sellerUserId, chat }) {
  return (
    <InfoSection icon={Store} title="Seller & company details">
      <div className="product-seller-card">
        <div className="seller-company-mark">{seller.logo || seller.companyLogo ? <img src={seller.logo || seller.companyLogo} alt="" /> : <Store />}</div>
        <div>
          <h3>{seller.companyName || seller.businessName || 'Marketplace supplier'} {(seller.isVerified || seller.verificationStatus === 'verified') && <BadgeCheck />}</h3>
          <p><MapPin /> {[seller.address?.city, seller.address?.country || seller.country].filter(Boolean).join(', ') || 'Global supplier'}</p>
          <small>{seller.companyType || seller.businessType || 'B2B supplier'} {seller.yearEstablished ? `· Established ${seller.yearEstablished}` : ''}</small>
        </div>
        <div className="supplier-metrics">
          <span><b>{seller.trustScore || 0}</b> Trust</span>
          <span><b>{seller.rating || seller.averageRating || 0}</b> Rating</span>
          <span><b>{seller.totalProducts || 0}</b> Products</span>
        </div>
      </div>
      <div className="supplier-company-info">
        <span><Globe2 /> {seller.website || seller.exportMarkets || 'Global marketplace presence'}</span>
        <span><ShieldCheck /> {seller.verificationStatus === 'verified' || seller.isVerified ? 'Business verified' : 'Business profile available'}</span>
      </div>
      <div className="supplier-actions">
        {sellerId && <Link className="button button--secondary" to={`/sellers/${sellerId}`}><Store /> View supplier profile</Link>}
        <button className="button button--primary" disabled={!sellerUserId} onClick={chat}><MessageSquare /> Message supplier</button>
      </div>
    </InfoSection>
  )
}

// ProductRail function ko replace karo
function ProductRail({ title, products, loading, category }) {
  if (!loading && !products.length) return null
  return (
    <section className="product-detail-rail">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold text-gray-900 sm:text-base">{title}</h2>
        <Link 
          to={`/products?category=${encodeURIComponent(category || '')}`}
          className="text-[10px] font-bold text-blue-600 sm:text-xs"
        >
          View all
        </Link>
      </div>
      
      {/* Desktop: Horizontal swipeable */}
      <div className="hidden sm:flex sm:gap-3 sm:overflow-x-auto sm:pb-2 scrollbar-hide">
        {loading ? (
          <SkeletonCards count={5} variant="product" />
        ) : (
          products.map((item) => (
            <div key={item._id || item.id} className="w-[185px] flex-shrink-0 sm:w-[195px] lg:w-[210px]">
              <ProductCard product={item} />
            </div>
          ))
        )}
      </div>
      
      {/* Mobile: Horizontal swipeable */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide sm:hidden snap-x snap-mandatory">
        {loading ? (
          <SkeletonCards count={4} variant="product" />
        ) : (
          products.map((item) => (
            <div key={item._id || item.id} className="w-[150px] flex-shrink-0 snap-start">
              <ProductCard product={item} />
            </div>
          ))
        )}
      </div>
    </section>
  )
}
function normalizeList(value) { if (!value) return []; if (Array.isArray(value)) return value; return String(value).split(',').map((item) => item.trim()).filter(Boolean) }
function formatTime(value) { if (!value) return 'Ask supplier'; if (typeof value === 'object') return `${value.value || 0} ${value.unit || 'days'}`; return `${value} days` }