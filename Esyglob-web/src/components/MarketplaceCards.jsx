// components/ProductCards.jsx
import { ArrowUpRight, BadgeCheck, Box, Heart, MapPin, Package, Send, ShieldCheck, Star, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { memo, useState } from 'react';
import WishlistButton from './WishlistButton';
import { resolveApiResourceUrl } from '../api/client';

// ─── SafeImage ──────────────────────────────────────────────────
export const SafeImage = memo(function SafeImage({ src, alt, className = '' }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <Package size={24} />
      </div>
    );
  }
  return (
    <img
      className={className}
      src={resolveApiResourceUrl(src)}
      alt={alt || ''}
      loading="lazy"
      decoding="async"
    />
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
      className="group flex flex-col items-center gap-2 flex-shrink-0 w-[78px] transition-transform duration-200 hover:-translate-y-1"
    >
      <SafeImage
        src={category.image || category.icon}
        alt=""
        className="h-16 w-16 rounded-full border-2 border-blue-100 bg-blue-50 object-cover transition-all duration-200 group-hover:border-blue-400 group-hover:shadow-[0_0_0_4px_rgba(59,130,246,0.1)]"
      />
      <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight max-w-[78px] truncate">
        {category.name}
      </span>
    </Link>
  );
});

// ─── ProductCard ────────────────────────────────────────────────
export const ProductCard = memo(function ProductCard({ product }) {
  const id = product._id || product.id;
  const image = product.image || product.images?.[0];
  const price = Number(product.price || product.priceTiers?.[0]?.unitPrice || 0);
  const rating = Number(product.rating || product.averageRating || 0);
  const moq = product.moq || product.minimumOrderQuantity || 1;
  const [saved, setSaved] = useState(false);
  const [imgError, setImgError] = useState(false);
  
  const isVerified = product.verified || product.isVerifiedSeller || product.sellerId?.isVerified || ['verified','approved'].includes(product.sellerId?.verificationStatus);
  const supplierName = product.sellerId?.companyName || product.supplierName || product.brand;
  const supplierLocation = product.sellerId?.address?.country || product.sellerId?.country || product.country;
  const isBestSeller = product.isBestSeller || product.badge === 'bestseller';
  const isNew = product.isNew || product.badge === 'new';
  const discount = product.discount || product.discountPercentage;
  const originalPrice = product.originalPrice || product.mrp;
  const reviewCount = product.reviewCount || product.totalReviews || 0;
  const orderCount = product.orderCount || product.totalOrders || 0;

  return (
    <article className="product-card">
      {/* Image Container */}
      <div className="product-card-image">
        <Link to={`/products/${id}`} className="product-card-image-link">
          {!imgError && image ? (
            <img
              src={image}
              alt={product.name || 'Product'}
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="product-card-image-fallback">
              <Package size={40} />
              <span>No Image</span>
            </div>
          )}
        </Link>

        {/* Top Badges */}
        <div className="product-card-badges">
          {isBestSeller && (
            <span className="badge badge-bestseller">
              <Award size={10} /> Best Seller
            </span>
          )}
          {isNew && (
            <span className="badge badge-new">New</span>
          )}
          {discount > 0 && (
            <span className="badge badge-discount">-{discount}%</span>
          )}
        </div>

        {/* Wishlist */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSaved(!saved); }}
          className={`product-card-wishlist ${saved ? 'active' : ''}`}
          aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>

        {/* Verified Supplier Badge */}
        {isVerified && (
          <div className="product-card-verified">
            <ShieldCheck size={12} />
            <span>Verified</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="product-card-content">
        {/* Supplier Info */}
        {supplierName && (
          <div className="product-card-supplier">
            <span className="supplier-name">
              {supplierName}
              {isVerified && <ShieldCheck size={11} className="verified-icon-small" />}
            </span>
            {supplierLocation && (
              <span className="supplier-location">
                <MapPin size={10} />
                {supplierLocation}
              </span>
            )}
          </div>
        )}

        {/* Category */}
        <span className="product-card-category">
          {typeof product.category === 'object' ? product.category?.name : product.category || 'General'}
        </span>

        {/* Product Name */}
        <Link to={`/products/${id}`} className="product-card-name">
          {product.name || product.title || 'Unnamed Product'}
        </Link>

        {/* Key Specs */}
        {product.keySpecs && product.keySpecs.length > 0 && (
          <div className="product-card-specs">
            {product.keySpecs.slice(0, 3).map((spec, idx) => (
              <span key={idx} className="spec-tag">
                <CheckCircle2 size={10} />
                {spec}
              </span>
            ))}
          </div>
        )}

        {/* Rating & Orders */}
        <div className="product-card-metrics">
          {rating > 0 && (
            <div className="metric rating-metric">
              <Star size={12} fill="#f59e0b" color="#f59e0b" />
              <span className="metric-value">{rating.toFixed(1)}</span>
              {reviewCount > 0 && (
                <span className="metric-count">({reviewCount})</span>
              )}
            </div>
          )}
          {orderCount > 0 && (
            <div className="metric order-metric">
              <ShoppingBag size={12} />
              <span className="metric-value">{orderCount >= 1000 ? `${(orderCount/1000).toFixed(1)}k` : orderCount}</span>
              <span className="metric-label">orders</span>
            </div>
          )}
        </div>

        {/* Price Section */}
        <div className="product-card-price-section">
          <div className="price-main">
            <div className="price-value">
              <span className="price-currency">₹</span>
              <span className="price-amount">
                {price ? price.toLocaleString('en-IN') : '—'}
              </span>
            </div>
            {originalPrice && originalPrice > price && (
              <span className="price-original">₹{originalPrice.toLocaleString('en-IN')}</span>
            )}
            <span className="price-unit">/ {product.unit || 'piece'}</span>
          </div>
          
          {moq > 1 && (
            <span className="price-moq">{moq} {product.unit || 'pcs'} (Min. Order)</span>
          )}
        </div>
      </div>
    </article>
  );
});

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
      <div key={i} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 animate-pulse">
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
      <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 animate-pulse space-y-4">
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
    <div key={i} className="rounded-2xl border border-gray-100 bg-white overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-100" />
      <div className="p-3 space-y-2">
        <div className="h-2.5 w-16 rounded-md bg-gray-100" />
        <div className="h-3 w-full rounded-md bg-gray-100" />
        <div className="h-3 w-3/4 rounded-md bg-gray-100" />
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <div className="h-5 w-20 rounded-md bg-gray-100" />
          <div className="h-8 w-8 rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  ));
}
