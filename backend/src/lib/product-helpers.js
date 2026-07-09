export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function productSortField(value) {
  const validFields = [
    'createdAt',
    'updatedAt',
    'price',
    'averageRating',
    'totalOrders',
    'name',
  ];
  return validFields.includes(value) ? value : 'createdAt';
}