import * as categoryRepository from '../repositories/category.repository.js';
import { MARKETPLACE_CATEGORIES } from '../lib/marketplace-categories.js';
import { cached } from '../lib/cache.js';

const EXPECTED_CATEGORY_SLUGS = MARKETPLACE_CATEGORIES.map((item) => item.slug);
const SEED_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let seedCheckPromise = null;
let lastSeedCheckAt = 0;

// ─── Seed Categories (lazy, non-blocking) ──────────────────
async function ensureSeedCategories(force = false) {
  if (!force && Date.now() - lastSeedCheckAt < SEED_CHECK_INTERVAL_MS) return;
  if (seedCheckPromise) return seedCheckPromise;

  seedCheckPromise = (async () => {
    const existingCount = await categoryRepository.countExpectedCategories();

    if (existingCount >= EXPECTED_CATEGORY_SLUGS.length) {
      lastSeedCheckAt = Date.now();
      return;
    }

    for (const [index, item] of MARKETPLACE_CATEGORIES.entries()) {
      await categoryRepository.seedCategory(item, index);
    }

    lastSeedCheckAt = Date.now();
  })().finally(() => {
    seedCheckPromise = null;
  });

  return seedCheckPromise;
}

// ─── Build Category Payload ────────────────────────────────
function buildCategoryPayload(categories, subcategories, productCounts) {
  const categoryIdSet = new Set(categories.map((cat) => String(cat._id)));
  const countByCategoryId = new Map();
  const countByCategoryName = new Map();
  const countBySubcategoryId = new Map();
  const countBySubcategoryName = new Map();
  const imageByCategory = new Map();

  productCounts.forEach((item) => {
    const categoryId = item._id.categoryId ? String(item._id.categoryId) : '';
    const subcategoryId = item._id.subcategoryId ? String(item._id.subcategoryId) : '';

    if (categoryId) {
      countByCategoryId.set(
        categoryId,
        (countByCategoryId.get(categoryId) || 0) + item.count
      );
    }
    if (item._id.category) {
      countByCategoryName.set(
        item._id.category,
        (countByCategoryName.get(item._id.category) || 0) + item.count
      );
    }
    if (subcategoryId) {
      countBySubcategoryId.set(
        subcategoryId,
        (countBySubcategoryId.get(subcategoryId) || 0) + item.count
      );
    }
    if (item._id.subcategory) {
      countBySubcategoryName.set(
        item._id.subcategory,
        (countBySubcategoryName.get(item._id.subcategory) || 0) + item.count
      );
    }
    if (item.sampleImage && (categoryId || item._id.category)) {
      imageByCategory.set(categoryId || item._id.category, item.sampleImage);
    }
  });

  const subcategoriesByCategory = subcategories.reduce((map, sub) => {
    const key = String(sub.categoryId);
    if (!categoryIdSet.has(key)) return map;
    if (!map.has(key)) map.set(key, []);

    map.get(key).push({
      ...sub,
      productCount:
        countBySubcategoryId.get(String(sub._id)) ||
        countBySubcategoryName.get(sub.name) ||
        0,
    });
    return map;
  }, new Map());

  return {
    categories: categories.map((category) => ({
      ...category,
      productCount:
        countByCategoryId.get(String(category._id)) ||
        countByCategoryName.get(category.name) ||
        0,
      image:
        category.image ||
        imageByCategory.get(String(category._id)) ||
        imageByCategory.get(category.name),
      subcategories: subcategoriesByCategory.get(String(category._id)) || [],
    })),
  };
}

// ─── Load Category Payload ─────────────────────────────────
async function loadCategoryPayload(options) {
  let [categories, subcategories, productCounts] =
    await categoryRepository.fetchAllCategoryData(options.activeOnly, options.includeCounts);

  // Seed if categories are missing
  if (categories.length < EXPECTED_CATEGORY_SLUGS.length) {
    await ensureSeedCategories(true);
    [categories, subcategories, productCounts] =
      await categoryRepository.fetchAllCategoryData(options.activeOnly, options.includeCounts);
  } else {
    // Fire-and-forget seed check
    void ensureSeedCategories().catch((error) => {
      console.error('Category seed check error:', error);
    });
  }

  return buildCategoryPayload(categories, subcategories, productCounts);
}

// ─── Get Categories (with caching) ─────────────────────────
export async function getCategories(options = {}) {
  const { includeCounts = false, activeOnly = true } = options;

  const cacheKey = `categories:${includeCounts}:${activeOnly}`;
  const ttl = includeCounts ? 90000 : 300000;

  return cached(cacheKey, ttl, () =>
    loadCategoryPayload({ includeCounts, activeOnly })
  );
}

export async function getCategory(categoryIdOrSlug, options = {}) {
  const { activeOnly = true } = options;
  const cacheKey = `category:${String(categoryIdOrSlug || '').toLowerCase()}:${activeOnly}`;

  return cached(cacheKey, 300000, async () => {
    const category = await categoryRepository.findCategoryByIdOrSlug(
      categoryIdOrSlug,
      activeOnly
    );

    if (!category) {
      const error = new Error('Category not found');
      error.statusCode = 404;
      throw error;
    }

    return { category };
  });
}
