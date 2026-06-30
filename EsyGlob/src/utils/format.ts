import { Product } from '../api/types';

export function getId(value: { _id?: string; id?: string }) {
  return value._id ?? value.id ?? Math.random().toString(36);
}

export function getStableKey(value: {
  _id?: string;
  id?: string;
  slug?: string;
  name?: string;
  companyName?: string;
  businessName?: string;
  displayName?: string;
}) {
  return (
    value._id ??
    value.id ??
    value.slug ??
    value.name ??
    value.companyName ??
    value.businessName ??
    value.displayName ??
    Math.random().toString(36)
  );
}

export function formatProductPrice(product: Product) {
  const currency = product.currency ?? 'USD';
  const price = product.price ?? product.minPrice;

  if (price == null || price === '') {
    return 'Price on request';
  }

  if (typeof price === 'number') {
    return `${currency} ${price.toLocaleString()}`;
  }

  return String(price);
}

export function formatMoq(product: Product) {
  const moq = product.moq ?? product.minimumOrderQuantity;

  if (!moq) {
    return 'MOQ available on request';
  }

  return `MOQ ${moq}${product.unit ? ` ${product.unit}` : ''}`;
}

export function getProductImage(product: Product) {
  return product.image ?? product.images?.[0] ?? null;
}

export function getSellerName(product: Product) {
  const seller = product.seller ?? product.sellerId;

  if (typeof seller === 'string') {
    return seller;
  }

  return seller?.companyName ?? seller?.businessName ?? seller?.displayName ?? 'Verified supplier';
}

export function getProductLocation(product: Product) {
  const seller = product.seller ?? product.sellerId;

  if (product.country || product.originCountry || product.countryOfOrigin) {
    return product.country ?? product.originCountry ?? product.countryOfOrigin;
  }

  if (typeof seller === 'object') {
    return seller.address?.country ?? seller.country;
  }

  return undefined;
}

export function isVerifiedProduct(product: Product) {
  const seller = product.seller ?? product.sellerId;
  return typeof seller === 'object' ? Boolean(seller.isVerified) : false;
}

export function getCategoryIcon(icon?: string) {
  const normalized = icon?.trim().toLowerCase();
  const iconMap: Record<string, string> = {
    package: 'package-variant-closed',
    agriculture: 'sprout',
    apparel: 'tshirt-crew-outline',
    automobile: 'car-outline',
    hardware: 'hammer-wrench',
    chemical: 'flask-outline',
    electronics: 'cellphone-link',
    food: 'food-variant',
    furniture: 'sofa-outline',
    machinery: 'cog-outline',
    perfumery: 'spray-bottle',
  };

  return normalized ? iconMap[normalized] ?? normalized : 'shape-outline';
}
