export function normalizeSellerCategories(value, products = []) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const productCategories = Array.isArray(products)
    ? products.map((product) => product.category?.name || product.categoryName || product.category).filter(Boolean)
    : []
  return [...new Set([...source, ...productCategories]
    .map((item) => typeof item === 'string' ? item.trim() : item?.name || item?.title)
    .filter(Boolean))]
}
