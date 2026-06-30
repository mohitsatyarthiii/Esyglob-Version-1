import { apiRequest } from './client';
import { normalizeList } from './normalizers';
import { Category, Product, SellerSummary } from './types';

export async function searchMarketplace(query: string) {
  const payload = await apiRequest('/api/search', {
    query: { q: query },
  });

  return {
    products: normalizeList<Product>(payload, ['products']),
    categories: normalizeList<Category>(payload, ['categories']),
    suppliers: normalizeList<SellerSummary>(payload, ['suppliers', 'sellers', 'manufacturers']),
  };
}
