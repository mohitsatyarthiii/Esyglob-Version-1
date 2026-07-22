import { apiRequest, normalizeList, unwrapData } from './client'

export async function fetchCategories() {
  const payload = await apiRequest('/categories', {
    query: { type: 'homepage', withCounts: true },
    cacheTtlMs: 5 * 60_000,
  })
  return normalizeList(payload, ['categories', 'items', 'results'])
}

export async function fetchCategoryDetails(id) {
  const payload = await apiRequest(`/categories/${id}`, { cacheTtlMs: 2 * 60_000 })
  const data = unwrapData(payload) || {}
  return { category: data.category || data, products: data.products || [], pagination: data.pagination }
}

export async function fetchProducts(params = {}) {
  const payload = await apiRequest('/products', {
    query: { type: 'homepage', page: 1, limit: 12, ...params },
    cacheTtlMs: params.search ? 45_000 : 90_000,
  })
  const data = unwrapData(payload)
  return {
    products: normalizeList(payload, ['products', 'items', 'results']),
    pagination: data?.pagination,
  }
}

export async function fetchSellers(params = {}) {
  const payload = await apiRequest('/suppliers', {
    query: { limit: 12, sort: 'verified', ...params },
    cacheTtlMs: 90_000,
  })
  return normalizeList(payload, ['sellers', 'suppliers', 'manufacturers', 'items'])
}

export async function fetchProductDetails(id) {
  const payload = await apiRequest(`/products/${id}`, { cacheTtlMs: 2 * 60_000 })
  const data = unwrapData(payload) || {}
  return { product: data.product || data, seller: data.seller || data.product?.sellerId, similarProducts: data.similarProducts || [] }
}

export async function fetchSellerDetails(id) {
  const payload = await apiRequest(`/suppliers/${id}`, { cacheTtlMs: 2 * 60_000 })
  return unwrapData(payload) || {}
}

export async function fetchReviews(params = {}) {
  const payload = await apiRequest('/reviews', { query: params, cacheTtlMs: 60_000 })
  return normalizeList(payload, ['reviews', 'items'])
}

export async function fetchReviewSummary(params = {}) {
  const payload = await apiRequest('/reviews', { query: params, cache: false })
  const data = unwrapData(payload) || {}
  return {
    reviews: normalizeList(payload, ['reviews', 'items']),
    averageRating: Number(data.averageRating || 0),
    reviewCount: Number(data.reviewCount || 0),
    breakdown: data.breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  }
}

export async function createReview(input) {
  return unwrapData(await apiRequest('/reviews', { method: 'POST', body: input })) || {}
}

export async function updateReview(input) {
  return unwrapData(await apiRequest('/reviews', { method: 'PUT', body: input })) || {}
}

export async function searchMarketplace(query) {
  const payload = await apiRequest('/search', { query: { q: query, raw: true }, cacheTtlMs: 45_000 })
  return {
    products: normalizeList(payload, ['products']),
    sellers: normalizeList(payload, ['suppliers', 'sellers', 'manufacturers']),
    categories: normalizeList(payload, ['categories']),
  }
}

export async function fetchServiceActivity() {
  try {
    const payload = await apiRequest('/service-requests', { query: { limit: 4 }, cacheTtlMs: 30_000 })
    return normalizeList(payload, ['requests', 'services', 'items'])
  } catch (error) {
    if (error.status === 404) return []
    throw error
  }
}

export async function fetchSavedItems(params = {}) {
  const payload = await apiRequest('/buyer/saved', { query: { limit: 100, ...params }, cache: false })
  return normalizeList(payload, ['items', 'savedItems'])
}

export async function checkSavedItem(type, itemId) {
  const payload = await apiRequest('/buyer/saved', { query: { type, itemId }, cache: false })
  return Boolean(unwrapData(payload)?.saved)
}

export async function toggleSavedItem(itemType, itemId) {
  const payload = await apiRequest('/buyer/saved', { method: 'POST', body: { itemType, itemId } })
  return unwrapData(payload) || {}
}

export async function trackRecentlyViewed(productId) {
  return unwrapData(await apiRequest('/buyer/recently-viewed', { method: 'POST', body: { productId } }))
}

export async function searchByImage(imageUrl, query = '', role = 'buyer') {
  const payload = await apiRequest('/ai-search', { method: 'POST', body: { imageUrl, query: query.trim() || undefined, role, includeAI: true, forceAI: true } })
  const data = unwrapData(payload) || {}
  const results = data.results || {}
  return {
    answer: data.answer || '',
    products: data.products || results.products || [],
    sellers: data.suppliers || data.sellers || results.suppliers || [],
    categories: data.categories || results.categories || [],
    suggestions: data.suggestions || [],
    imageSearch: data.imageSearch || null,
  }
}

export async function startProductChat({ otherUserId, productId }) {
  const payload = await apiRequest('/chat', { method: 'POST', body: { otherUserId, productId, role: 'buyer', enquiry: false } })
  return unwrapData(payload) || {}
}

export async function createProductEnquiry(input) {
  const payload = await apiRequest('/rfqs/product-enquiry', { method: 'POST', body: input })
  return unwrapData(payload) || {}
}

export async function fetchAccountSummary(role) {
  const paths = role === 'seller'
    ? ['/profile', '/orders?type=seller&limit=1', '/service-requests?limit=1', '/wallet?role=seller', '/suppliers/me']
    : ['/profile', '/orders?limit=1', '/service-requests?limit=1', '/wallet?role=buyer', '/buyer/saved?limit=1']
  const values = await Promise.allSettled(paths.map((path) => apiRequest(path, { cacheTtlMs: 30_000 })))
  return values.map((result) => result.status === 'fulfilled' ? unwrapData(result.value) : null)
}

export async function fetchMessages() {
  const payload = await apiRequest('/chat', { query: { limit: 30 }, cache: false })
  return normalizeList(payload, ['chats', 'conversations', 'items'])
}
