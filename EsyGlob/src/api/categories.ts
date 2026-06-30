import { apiRequest } from './client';
import { normalizeList, unwrapData } from './normalizers';
import { Category, ProductListResponse } from './types';

export async function fetchCategories() {
  const payload = await apiRequest('/api/categories');
  return normalizeList<Category>(payload, ['categories', 'items', 'results']);
}

export async function fetchCategoryDetails(categoryIdOrSlug: string) {
  const payload = await apiRequest(`/api/categories/${categoryIdOrSlug}`);
  const data = unwrapData<{ category?: Category } & ProductListResponse>(payload);

  return {
    category: data?.category,
    products: Array.isArray(data?.products) ? data.products : [],
    pagination: data?.pagination,
  };
}
