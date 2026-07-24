import { getMarketplaceStatistics } from '../services/marketplace-home.service.js';

export async function statistics(_req, res, next) {
  try {
    const stats = await getMarketplaceStatistics();
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    return res.json({ stats });
  } catch (error) {
    return next(error);
  }
}
