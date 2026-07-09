import { ApiError, apiRequest } from './client';
import { unwrapData } from './normalizers';
import { HomePayload, ProductListResponse } from './types';

export async function fetchHome() {
  try {
    const payload = await apiRequest('/home', {
      query: { limit: 16 },
      cacheTtlMs: 90_000,
    });
    const data = unwrapData<HomePayload>(payload);

    return {
      categories: data?.categories ?? data?.featuredCategories ?? [],
      featuredProducts: data?.featuredProducts ?? [],
      latestProducts: data?.latestProducts ?? [],
      trendingProducts: data?.trendingProducts ?? [],
      recommendedProducts: data?.recommendedProducts ?? [],
    };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
  }

  const [categoryPayload, featuredPayload, latestPayload] = await Promise.all([
    apiRequest('/categories', { query: { type: 'homepage', withCounts: true }, cacheTtlMs: 5 * 60_000 }),
    apiRequest('/products', { query: { type: 'homepage', limit: 12, featured: true }, cacheTtlMs: 90_000 }),
    apiRequest('/products', { query: { type: 'homepage', limit: 30 }, cacheTtlMs: 90_000 }),
  ]);
  const categories = unwrapData<HomePayload>(categoryPayload)?.categories ?? [];
  const featuredProducts = unwrapData<ProductListResponse>(featuredPayload)?.products ?? [];
  const latestProducts = unwrapData<ProductListResponse>(latestPayload)?.products ?? [];

  return {
    categories,
    featuredProducts,
    latestProducts,
    trendingProducts: latestProducts.slice(0, 12),
    recommendedProducts: latestProducts.slice(12, 24),
  };
}
