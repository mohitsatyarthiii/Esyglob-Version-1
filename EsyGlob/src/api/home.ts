import { apiRequest } from './client';
import { unwrapData } from './normalizers';
import { HomePayload } from './types';

export async function fetchHome() {
  const payload = await apiRequest('/api/home', {
    query: { limit: 16 },
  });
  const data = unwrapData<HomePayload>(payload);

  return {
    categories: data?.categories ?? data?.featuredCategories ?? [],
    featuredProducts: data?.featuredProducts ?? [],
    latestProducts: data?.latestProducts ?? [],
    trendingProducts: data?.trendingProducts ?? [],
    recommendedProducts: data?.recommendedProducts ?? [],
  };
}
