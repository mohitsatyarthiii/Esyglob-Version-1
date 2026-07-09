import * as categoryService from '../services/category.service.js';

export async function getCategories(req, res, next) {
  try {
    const includeCounts =
      req.query.includeCounts === 'true' || req.query.withCounts === 'true';
    const activeOnly = req.query.activeOnly !== 'false';

    const payload = await categoryService.getCategories({
      includeCounts,
      activeOnly,
    });

    const cacheControl = includeCounts
      ? 'public, s-maxage=60, stale-while-revalidate=300'
      : 'public, s-maxage=180, stale-while-revalidate=600';

    res.set('Cache-Control', cacheControl);
    return res.json(payload);
  } catch (error) {
    console.error('Fetch categories error:', error);
    return res.status(500).json({ error: 'Unable to fetch categories' });
  }
}

export async function getCategory(req, res, next) {
  try {
    const activeOnly = req.query.activeOnly !== 'false';
    const payload = await categoryService.getCategory(req.params.categoryIdOrSlug, {
      activeOnly,
    });

    res.set('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=600');
    return res.json(payload);
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'Category not found' });
    }
    console.error('Fetch category error:', error);
    return res.status(500).json({ error: 'Unable to fetch category' });
  }
}
