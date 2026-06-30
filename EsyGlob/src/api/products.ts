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
  const payload = await apiRequest('/api/products', {
    query: {
      q: params.q,
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
  });
  const data = unwrapData<ProductListResponse | Product[]>(payload);

  return {
    products: Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : normalizeList<Product>(payload, ['products']),
    pagination: Array.isArray(data) ? undefined : data?.pagination,
  };
}

export async function fetchProductDetails(productId: string): Promise<Product> {
  const payload = await apiRequest(`/api/products/${productId}`);
  const data = unwrapData<{ product?: Product } | Product>(payload);
  const product = data && typeof data === 'object' && 'product' in data ? data.product : data;

  if (!product) {
    throw new Error('Product details were not returned by the backend.');
  }

  return product as Product;
}
