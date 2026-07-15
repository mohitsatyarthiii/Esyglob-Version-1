import { apiRequest } from './client';
import { normalizeList } from './normalizers';
import { Category, Product, SellerSummary } from './types';

export async function searchMarketplace(query: string) {
  const payload = await apiRequest('/search', {
    query: { q: query, raw: true },
    cacheTtlMs: 45_000,
  });

  const products = normalizeList<Record<string, any>>(payload, ['products']).map(entry => ({
    ...(entry.raw ?? entry),
    _id: entry.raw?._id ?? entry._id ?? entry.id,
    name: entry.raw?.name ?? entry.name ?? entry.label,
    image: entry.raw?.image ?? entry.image,
  })) as Product[];
  const suppliers = normalizeList<Record<string, any>>(payload, ['suppliers', 'sellers', 'manufacturers']).map(entry => ({
    ...(entry.raw ?? entry),
    _id: entry.raw?._id ?? entry._id ?? entry.id,
    companyName: entry.raw?.companyName ?? entry.companyName ?? entry.label,
    logo: entry.raw?.logo ?? entry.logo ?? entry.image,
  })) as SellerSummary[];
  const categories = normalizeList<Record<string, any>>(payload, ['categories']).map(entry => ({
    ...(entry.raw ?? entry),
    _id: entry.raw?._id ?? entry._id ?? entry.id,
    name: entry.raw?.name ?? entry.name ?? entry.label,
    image: entry.raw?.image ?? entry.image,
    resultType: entry.type,
  })) as Category[];
  return { products, categories, suppliers };
}
