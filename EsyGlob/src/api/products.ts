import { apiRequest } from './client';
import { normalizeList, unwrapData } from './normalizers';
import { Product, ProductListResponse } from './types';

export type ProductQuery = {
  q?: string;
  category?: string;
  subcategory?: string;
  seller?: string;
  sort?: 'latest' | 'rating' | 'price_asc' | 'price_desc' | string;
  minPrice?: number | string;
  maxPrice?: number | string;
  verifiedOnly?: boolean;
  page?: number;
  limit?: number;
};

export async function fetchProducts(params: ProductQuery = {}): Promise<ProductListResponse> {
  const payload = await apiRequest('/products', {
    query: {
      type: 'homepage',
      q: params.q,
      search: params.q,
      category: params.category,
      subcategory: params.subcategory,
      seller: params.seller,
      sort: params.sort,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      verifiedOnly: params.verifiedOnly,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    },
    cacheTtlMs: params.q ? 45_000 : 90_000,
  });

  const data = unwrapData<ProductListResponse | Product[]>(payload);

  return {
    products: Array.isArray(data)
      ? data
      : Array.isArray(data?.products)
      ? data.products
      : normalizeList<Product>(payload, ['products']),
    pagination: Array.isArray(data) ? undefined : data?.pagination,
  };
}

export async function fetchProductDetails(productId: string): Promise<Product> {
  const payload = await apiRequest(`/products/${productId}`, {
    cacheTtlMs: 2 * 60_000,
  });


  // Try multiple response shapes
  let product: unknown = null;

  // Shape 1: { success: true, data: { product: {...} } }
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (p.success && p.data) {
      const d = p.data as Record<string, unknown>;
      product = d.product ?? d;
    }
  }

  // Shape 2: { product: {...} }
  if (!product && payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    product = p.product ?? p;
  }

  // Shape 3: Direct product object
  if (!product) {
    product = payload;
  }

  // Unwrap with normalizer
  if (!product || (typeof product === 'object' && !('_id' in product) && !('id' in product) && !('name' in product))) {
    const unwrapped = unwrapData<{ product?: Product } | Product>(payload);
    const data = unwrapped && typeof unwrapped === 'object' && 'product' in unwrapped
      ? unwrapped.product
      : unwrapped;
    if (data) {
      product = data;
    }
  }

  if (!product) {
    throw new Error('Product details were not returned by the backend.');
  }

  return product as Product;
}
