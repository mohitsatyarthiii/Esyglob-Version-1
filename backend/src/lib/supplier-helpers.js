import { COMPANY_TYPES } from './constants.js';

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sellerSortField(value) {
  const validFields = [
    'rating',
    'trustScore',
    'totalProducts',
    'totalOrders',
    'createdAt',
    'verificationLevel',
  ];
  return validFields.includes(value) ? value : 'rating';
}

export function buildSellerQuery(searchParams) {
  const search = searchParams.search || '';
  const companyType = searchParams.companyType;
  const isVerified = searchParams.isVerified;
  const minRating = Number(searchParams.minRating || 0);
  const minTrustScore = Number(searchParams.minTrustScore || 0);
  const hasProducts = searchParams.hasProducts === 'true';
  const region = searchParams.region;
  const yearEstablished = toNumber(searchParams.yearEstablished, 0);

  const query = { isActive: true };

  if (isVerified === 'true') query.isVerified = true;

  if (companyType) {
    const companyTypes = companyType
      .split(',')
      .filter((type) => COMPANY_TYPES.includes(type));
    if (companyTypes.length) query.companyType = { $in: companyTypes };
  }

  if (minRating > 0) query.rating = { $gte: minRating };
  if (minTrustScore > 0) query.trustScore = { $gte: minTrustScore };
  if (hasProducts) query.totalProducts = { $gt: 0 };

  if (region) {
    const safeRegion = escapeRegex(region.slice(0, 80));
    query.$or = [
      { 'address.country': { $regex: safeRegion, $options: 'i' } },
      { 'address.state': { $regex: safeRegion, $options: 'i' } },
      { 'address.city': { $regex: safeRegion, $options: 'i' } },
      { exportMarkets: { $regex: safeRegion, $options: 'i' } },
    ];
  }

  if (yearEstablished > 0) {
    query.yearEstablished = { $lte: yearEstablished };
  }

  if (search) {
    const safeSearch = escapeRegex(search.slice(0, 100));
    const searchConditions = [
      { companyName: { $regex: safeSearch, $options: 'i' } },
      { companyDescription: { $regex: safeSearch, $options: 'i' } },
      { companyType: { $regex: safeSearch, $options: 'i' } },
      { productCategories: { $regex: safeSearch, $options: 'i' } },
      { exportMarkets: { $regex: safeSearch, $options: 'i' } },
    ];

    if (query.$or) {
      query.$or = [...query.$or, ...searchConditions];
    } else {
      query.$or = searchConditions;
    }
  }

  return query;
}

export function stripUndefined(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)])
  );
}