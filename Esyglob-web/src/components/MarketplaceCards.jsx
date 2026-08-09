// components/ProductCards.jsx
import { ArrowUpRight, Award, BadgeCheck, Boxes, ChevronLeft, ChevronRight, Clock3, Factory, MapPin, Package, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { memo, useRef, useState } from 'react';
import WishlistButton from './WishlistButton';
import { resolveApiResourceUrl } from '../api/client';
import { Money } from './TradeUI';

// ─── SafeImage ──────────────────────────────────────────────────
export const SafeImage = memo(function SafeImage({ src, alt, className = '' }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <Package size={24} />
      </div>
    );
  }
  return (
    <span className={`relative block overflow-hidden bg-slate-100 ${className}`}>
      {!loaded && <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" aria-hidden="true" />}
      <img
        className={`h-full w-full ${className.includes('object-contain') ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        src={resolveApiResourceUrl(src)}
        alt={alt || ''}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  );
});

// ─── CategoryCard ───────────────────────────────────────────────
export const CategoryCard = memo(function CategoryCard({ category, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left transition-all duration-300 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100 hover:-translate-y-1 min-h-[80px] w-full"
    >
      <SafeImage
        src={category.image}
        alt=""
        className="h-14 w-14 flex-shrink-0 rounded-xl bg-gray-100 object-cover"
      />
      <span className="flex flex-1 flex-col min-w-0">
        <b className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
          {category.name}
        </b>
        <small className="text-[10px] text-gray-400 mt-1 font-medium">
          {Number(category.productCount || 0).toLocaleString()} products
        </small>
      </span>
      <ArrowUpRight
        size={16}
        className="flex-shrink-0 text-gray-300 transition-all duration-200 group-hover:text-blue-500 group-hover:translate-x-0.5"
      />
    </button>
  );
});

// ─── CategoryBubble ─────────────────────────────────────────────
export const CategoryBubble = memo(function CategoryBubble({ category }) {
  const id = category.slug || category._id || category.id || category.name;
  return (
    <Link
      to={`/categories/${encodeURIComponent(id)}`}
      className="category-bubble group relative flex flex-col items-center gap-2 flex-shrink-0 w-[78px] transition-transform duration-200 hover:-translate-y-1"
    >
      <SafeImage
        src={category.image || category.icon}
        alt=""
        className="h-16 w-16 rounded-full border-2 border-blue-100 bg-blue-50 object-cover transition-all duration-200 group-hover:border-blue-400 group-hover:shadow-[0_0_0_4px_rgba(59,130,246,0.1)]"
      />
      <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight max-w-[78px] truncate">
        {category.name}
      </span>
      <span className="category-bubble__tooltip" role="tooltip">{category.name}</span>
    </Link>
  );
});

// ─── ProductCard ────────────────────────────────────────────────
export const ProductCard = memo(function ProductCard({ product }) {
  const id = product._id || product.id;
  const images = [...new Set([product.image, ...(product.images || [])].filter(Boolean))].slice(0, 6);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const swipeStart = useRef(null);
  const suppressImageLink = useRef(false);
  const image = images[imageIndex];
  const originalPrice = Number(product.originalPrice || product.price || product.priceTiers?.[0]?.unitPrice || product.mrp || 0);
  const productDiscount = product.discount && typeof product.discount === 'object' ? product.discount : null;
  const discountActive = productDiscount?.status === 'active';
  const computedDiscountPrice = productDiscount?.type === 'fixed_amount'
    ? originalPrice - Number(productDiscount.value || 0)
    : originalPrice * (1 - Number(productDiscount?.value || 0) / 100);
  const price = Math.max(0, Number(discountActive ? productDiscount.discountedPrice ?? computedDiscountPrice : originalPrice));
  const rating = Number(product.rating || product.averageRating || 0);
  const moq = product.moq || product.minimumOrderQuantity || 1;
  
  const isVerified = product.verified || product.isVerifiedSeller || product.sellerId?.isVerified || ['verified','approved'].includes(product.sellerId?.verificationStatus);
  const supplierName = product.sellerId?.companyName || product.supplierName || product.brand;
  const supplierLocation = product.sellerId?.address?.country || product.sellerId?.country || product.countryOfOrigin || product.country;
  const isBestSeller = product.isBestSeller || product.badge === 'bestseller';
  const isNew = product.isNew || product.badge === 'new';
  const discount = discountActive
    ? Number(productDiscount.type === 'percentage' ? productDiscount.value : originalPrice ? (originalPrice - price) / originalPrice * 100 : 0)
    : Number(product.discountPercentage || 0);
  const reviewCount = product.reviewCount || product.totalReviews || 0;
  const orderCount = product.orderCount || product.totalOrders || 0;
  const leadTimeValue = product.leadTime?.value ?? product.leadTime;
  const leadTimeUnit = product.leadTime?.unit || 'days';
  const shippingLabel = product.shipping?.freeShipping
    ? 'Free shipping'
    : product.shipping?.available === false
      ? ''
      : product.shippingLabel || product.shipping?.method || 'Shipping available';
  const manufacturer = String(product.sellerId?.companyType || product.supplierType || '').toLowerCase().includes('manufacturer');
  const fastResponse = Number(product.sellerId?.responseRate || product.responseRate || 0) >= 80;

  function showImage(nextIndex) {
    setImageIndex((nextIndex + images.length) % images.length);
    setImageLoaded(false);
    setImgError(false);
  }

  function finishSwipe(event) {
    if (swipeStart.current === null || images.length < 2) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) < 36) return;
    suppressImageLink.current = true;
    window.setTimeout(() => { suppressImageLink.current = false }, 250);
    showImage(imageIndex + (distance < 0 ? 1 : -1));
  }

  return (
    <article className="market-product-card group relative min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_26px_rgba(15,42,78,.10)] active:scale-[.995]">
      <div
        className="relative aspect-[4/3] touch-pan-y overflow-hidden bg-slate-100"
        onPointerDown={(event) => { swipeStart.current = event.clientX }}
        onPointerUp={finishSwipe}
        onPointerCancel={() => { swipeStart.current = null }}
      >
        <Link to={`/products/${id}`} className="block h-full w-full" aria-label={`View ${product.name || 'product'}`} onClick={(event) => {
          if (!suppressImageLink.current) return;
          event.preventDefault();
          suppressImageLink.current = false;
        }}>
          {!imgError && image ? (
            <>
              {!imageLoaded && <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" aria-hidden="true" />}
              <img
                key={image}
                className={`h-full w-full object-contain p-2 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                src={resolveApiResourceUrl(image)}
                alt={`${product.name || 'Product'}${images.length > 1 ? `, image ${imageIndex + 1} of ${images.length}` : ''}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => { setImgError(true); setImageLoaded(true) }}
                loading="lazy"
                decoding="async"
              />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
              <Package size={28} />
              <span className="text-[10px] font-semibold">Image unavailable</span>
            </div>
          )}
        </Link>

        <div className="absolute left-2.5 top-2.5 flex max-w-[70%] flex-wrap gap-1.5">
          {isBestSeller && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/90 px-2 py-1 text-[9px] font-bold text-white shadow-sm backdrop-blur">
              <Award size={10} /> Bestseller
            </span>
          )}
          {isNew && <span className="rounded-full bg-blue-600 px-2 py-1 text-[9px] font-bold text-white shadow-sm">New</span>}
          {discount > 0 && <span className="rounded-full bg-rose-600 px-2 py-1 text-[9px] font-bold text-white shadow-sm">-{Math.round(discount)}%</span>}
        </div>

        <WishlistButton itemId={id} type="product" className="product-card-wishlist !right-2.5 !top-2.5" />

        {images.length > 1 && <>
          <button type="button" className="absolute left-2 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 opacity-100 shadow-md transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100" onClick={() => showImage(imageIndex - 1)} aria-label="Previous product image"><ChevronLeft size={15} /></button>
          <button type="button" className="absolute right-2 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 opacity-100 shadow-md transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100" onClick={() => showImage(imageIndex + 1)} aria-label="Next product image"><ChevronRight size={15} /></button>
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-slate-950/40 px-1.5 py-1 backdrop-blur" aria-label={`${images.length} product images`}>
            {images.slice(0, 6).map((src, index) => <button type="button" key={src} className={`h-1 rounded-full transition-all ${imageIndex === index ? 'w-3 bg-white' : 'w-1 bg-white/60'}`} onClick={() => showImage(index)} aria-label={`Show image ${index + 1}`} />)}
          </div>
          <span className="absolute bottom-2 right-2 rounded bg-slate-950/65 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur">{imageIndex + 1}/{images.length}</span>
        </>}
      </div>

      <div className="flex flex-col p-2.5 sm:p-3">
        <Link to={`/products/${id}`} className="line-clamp-2 min-h-[2.35rem] text-[12px] font-semibold leading-[1.2rem] text-slate-800 transition hover:text-blue-700 sm:text-[13px]">
          {product.name || product.title || 'Unnamed product'}
        </Link>

        <div className="mt-1 flex min-h-4 items-center gap-1.5 text-[9px]" aria-label={`${rating.toFixed(1)} out of 5 from ${reviewCount} reviews`}>
          <span className="tracking-[-1px] text-amber-400">{ratingStars(rating)}</span>
          <strong className="font-extrabold text-slate-700">{rating ? rating.toFixed(1) : 'New'}</strong>
          {reviewCount > 0 && <span className="text-slate-400">({Number(reviewCount).toLocaleString()})</span>}
          {orderCount > 0 && <span className="ml-auto hidden text-slate-400 sm:inline">{compactNumber(orderCount)} sold</span>}
        </div>

        <div className="mt-1.5">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <strong className="text-[16px] font-extrabold tracking-tight text-slate-950 sm:text-[18px]">
                {price ? <Money value={price} currency={product.currency} /> : '—'}
            </strong>
            {originalPrice && originalPrice > price && (
              <span className="text-[10px] text-slate-400 line-through"><Money value={originalPrice} currency={product.currency} /></span>
            )}
          </div>
          <span className="block text-[9px] font-medium text-slate-500">per {product.unit || 'piece'}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {isVerified && <ProductStatus icon={ShieldCheck} tone="emerald">Verified</ProductStatus>}
          <ProductStatus icon={Boxes} tone="violet">MOQ {Number(moq).toLocaleString()}</ProductStatus>
          {leadTimeValue && <ProductStatus icon={Clock3} tone="amber">{leadTimeValue} {leadTimeUnit}</ProductStatus>}
          {shippingLabel && <ProductStatus icon={Truck} tone="blue">{shippingLabel}</ProductStatus>}
          {manufacturer && <ProductStatus icon={Factory} tone="slate">Manufacturer</ProductStatus>}
          {fastResponse && <ProductStatus icon={Zap} tone="rose">Fast response</ProductStatus>}
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span className="min-w-0 truncate text-[9px] font-semibold text-slate-600">
            {supplierName || 'Marketplace supplier'}
            {isVerified && <BadgeCheck size={11} className="ml-1 inline text-blue-600" />}
          </span>
          {supplierLocation && <span className="inline-flex flex-shrink-0 items-center gap-1 text-[9px] text-slate-400">
            <span aria-hidden="true">{countryFlag(supplierLocation)}</span>
            <span className="max-w-[72px] truncate">{supplierLocation}</span>
          </span>}
        </div>
      </div>
    </article>
  );
});

const statusTones = {
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-100 bg-violet-50 text-violet-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  rose: 'border-rose-100 bg-rose-50 text-rose-700',
};

function ProductStatus({ icon: Icon, tone, children }) {
  return <span className={`inline-flex min-h-5 items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-bold leading-none ${statusTones[tone] || statusTones.slate}`}>
    <Icon size={10} strokeWidth={2.2} /> {children}
  </span>;
}

function ratingStars(rating) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
}

function compactNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return number.toLocaleString();
}

function countryFlag(country) {
  const names = {
    india: 'IN', china: 'CN', 'united states': 'US', usa: 'US', 'united arab emirates': 'AE',
    uae: 'AE', vietnam: 'VN', turkey: 'TR', germany: 'DE', bangladesh: 'BD',
    pakistan: 'PK', indonesia: 'ID', thailand: 'TH', japan: 'JP', korea: 'KR',
    'south korea': 'KR', france: 'FR', italy: 'IT', brazil: 'BR', canada: 'CA',
  };
  const code = String(country || '').trim().length === 2
    ? String(country).toUpperCase()
    : names[String(country || '').trim().toLowerCase()];
  return code?.replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))) || '🌐';
}

// ─── ManufacturerCard ───────────────────────────────────────────

export const ManufacturerCard = memo(function ManufacturerCard({ seller }) {
  const id = seller._id || seller.id;
  const logo = seller.companyLogo || seller.logo || seller.logoUrl;
  const location = [seller.address?.city, seller.address?.country || seller.country]
    .filter(Boolean)
    .join(', ') || 'Global supplier';
  const isVerified = seller.isVerified || ['verified', 'approved'].includes(seller.verificationStatus);
  
  // Generate consistent gradient based on seller ID
  const gradients = [
    'from-blue-600 to-indigo-700',
    'from-indigo-600 to-purple-700',
    'from-blue-700 to-cyan-700',
    'from-slate-700 to-blue-800',
    'from-blue-800 to-indigo-900',
  ];
  const gradientIndex = id ? id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length : 0;
  const gradient = gradients[gradientIndex];

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-xl hover:shadow-blue-100/50 hover:-translate-y-1">
      
      {/* ─── Gradient Header ──────────────────────────────────── */}
      <div className={`relative bg-gradient-to-br ${gradient} px-4 py-4 sm:px-5 sm:py-5`}>
        <WishlistButton type="supplier" itemId={id} className="supplier-save-button" />
        {/* Decorative circles */}
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="absolute -bottom-4 right-12 h-16 w-16 rounded-full bg-white/5" />
        
        {/* Header Content */}
        <div className="relative flex items-center gap-3">
          {/* Logo */}
          <div className="relative flex-shrink-0">
            <SafeImage
              src={logo}
              alt=""
              className="h-12 w-12 rounded-xl border-2 border-white/30 bg-white/10 object-cover shadow-lg sm:h-14 sm:w-14"
              fallback={
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white/30 bg-white/10 text-lg font-bold text-white shadow-lg sm:h-14 sm:w-14">
                  {(seller.companyName || 'S')[0].toUpperCase()}
                </div>
              }
            />
            {/* Verified Badge */}
            {isVerified && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md">
                <BadgeCheck size={14} className="text-blue-600" />
              </span>
            )}
          </div>

          {/* Name & Type */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-extrabold text-white truncate leading-tight sm:text-base">
              {seller.companyName || seller.name || 'Manufacturer'}
            </h3>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold text-white/70 capitalize">
                {seller.companyType || 'Supplier'}
              </span>
              {seller.verificationLevel > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] font-bold text-white/80">
                  Lv{seller.verificationLevel}
                </span>
              )}
            </div>
          </div>

          {/* Trust Score Badge */}
          {seller.trustScore > 0 && (
            <div className="hidden sm:flex flex-shrink-0 flex-col items-center rounded-lg bg-white/15 px-2.5 py-1.5 backdrop-blur-sm">
              <span className="text-lg font-extrabold text-white leading-none">{seller.trustScore}%</span>
              <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider">Trust</span>
            </div>
          )}
        </div>

        {/* Mobile Trust Score */}
        {seller.trustScore > 0 && (
          <div className="mt-3 flex items-center gap-3 sm:hidden">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 backdrop-blur-sm">
              <span className="text-sm font-extrabold text-white">{seller.trustScore}%</span>
              <span className="text-[9px] font-semibold text-white/60">Trust Score</span>
            </div>
            {isVerified && (
              <span className="flex items-center gap-1 rounded-lg bg-emerald-500/30 px-2 py-1 text-[9px] font-bold text-emerald-200 backdrop-blur-sm">
                <ShieldCheck size={11} /> Verified
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── Body ──────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5">
        {/* Description */}
        <p className="mb-4 text-[11px] leading-relaxed text-gray-500 line-clamp-2 sm:text-xs">
          {seller.companyDescription ||
            `Explore products and sourcing options from this ${seller.companyType || 'supplier'}.`}
        </p>

        {/* Location */}
        <div className="mb-4 flex items-center gap-1.5 text-[10px] font-medium text-gray-400">
          <MapPin size={12} className="flex-shrink-0 text-gray-300" />
          <span className="truncate">{location}</span>
        </div>

        {/* Metrics Grid */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center rounded-xl bg-blue-50/80 py-2.5">
            <span className="text-sm font-extrabold text-blue-700 sm:text-base">
              {seller.totalProducts || seller.productCount || 0}
            </span>
            <span className="text-[8px] font-bold text-blue-400 uppercase tracking-wider">Products</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-amber-50/80 py-2.5">
            <span className="text-sm font-extrabold text-amber-700 sm:text-base">
              {Number(seller.rating || 0).toFixed(1)}
            </span>
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wider">Rating</span>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-emerald-50/80 py-2.5">
            <span className="text-sm font-extrabold text-emerald-700 sm:text-base">
              {seller.responseRate || seller.onTimeDeliveryRate || 0}%
            </span>
            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider">Delivery</span>
          </div>
        </div>

        {/* CTA */}
        <Link
          to={`/sellers/${id}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-gray-800 hover:shadow-md active:scale-[0.98] sm:py-3 sm:text-xs"
        >
          View Full Profile
          <ArrowUpRight size={14} className="sm:size-[15px]" />
        </Link>
      </div>
    </article>
  );
});

// ─── SkeletonCards ──────────────────────────────────────────────
export function SkeletonCards({ count = 4, variant = 'product' }) {
  if (variant === 'category') {
    return Array.from({ length: count }, (_, i) => (
      <div key={i} className="market-skeleton flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3">
        <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded-md bg-gray-100" />
          <div className="h-2.5 w-1/2 rounded-md bg-gray-100" />
        </div>
      </div>
    ));
  }

  if (variant === 'manufacturer') {
    return Array.from({ length: count }, (_, i) => (
      <div key={i} className="market-skeleton space-y-4 rounded-lg border border-gray-100 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded-md bg-gray-100" />
            <div className="h-2.5 w-1/3 rounded-md bg-gray-100" />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-md bg-gray-100" />
          <div className="h-2.5 w-4/5 rounded-md bg-gray-100" />
        </div>
        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-gray-50">
          <div className="h-10 rounded-md bg-gray-100" />
          <div className="h-10 rounded-md bg-gray-100" />
          <div className="h-10 rounded-md bg-gray-100" />
        </div>
      </div>
    ));
  }

  // Default: product skeleton
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="market-skeleton overflow-hidden rounded-lg border border-gray-100 bg-white">
      <div className="aspect-[4/3] bg-gray-100" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-full rounded-md bg-gray-100" />
        <div className="h-3 w-3/4 rounded-md bg-gray-100" />
        <div className="h-5 w-24 rounded-md bg-gray-100" />
        <div className="flex gap-1">
          <div className="h-5 w-16 rounded bg-gray-100" />
          <div className="h-5 w-20 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  ));
}
