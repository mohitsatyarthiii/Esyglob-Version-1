import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import Product from '../models/Product.js';
import { MARKETPLACE_CATEGORIES, categoryImageSeed, slugifyCategory } from '../lib/marketplace-categories.js';
import mongoose from 'mongoose';

const EXPECTED_CATEGORY_SLUGS = MARKETPLACE_CATEGORIES.map((item) => item.slug);
const CATEGORY_FIELDS = 'name slug description image icon metadata isActive createdAt updatedAt';
const SUBCATEGORY_FIELDS = 'categoryId name slug description image icon metadata isActive createdAt updatedAt';

// ─── Product Counts Aggregation ────────────────────────────
export function productCountsPipeline() {
  return [
    { $match: { status: { $in: ['active', 'published'] }, isVerifiedSeller: true } },
    {
      $project: {
        categoryId: 1,
        category: 1,
        subcategoryId: 1,
        subcategory: 1,
        sampleImage: { $arrayElemAt: ['$images', 0] },
      },
    },
    {
      $group: {
        _id: {
          categoryId: '$categoryId',
          category: '$category',
          subcategoryId: '$subcategoryId',
          subcategory: '$subcategory',
        },
        count: { $sum: 1 },
        sampleImage: { $first: '$sampleImage' },
      },
    },
  ];
}

// ─── Seed Categories ───────────────────────────────────────
export async function countExpectedCategories() {
  return Category.countDocuments({ slug: { $in: EXPECTED_CATEGORY_SLUGS } });
}

export async function seedCategory(item, index) {
  const category = await Category.findOneAndUpdate(
    { slug: item.slug },
    {
      $set: {
        name: item.name,
        slug: item.slug,
        description: item.description,
        image: categoryImageSeed(item.slug),
        icon: 'Package',
        metadata: {
          sortOrder: index,
          isFeatured: index < 8,
          keywords: item.trending || [],
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  for (const [subIndex, subName] of item.subcategories.entries()) {
    await Subcategory.findOneAndUpdate(
      { categoryId: category._id, slug: slugifyCategory(subName) },
      {
        $set: {
          categoryId: category._id,
          name: subName,
          slug: slugifyCategory(subName),
          image: categoryImageSeed(`${item.slug}-${subIndex}`),
          icon: 'Package',
          metadata: { sortOrder: subIndex, isFeatured: subIndex < 4 },
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  return category;
}

// ─── Fetch Categories & Subcategories ──────────────────────
export async function fetchCategories(activeOnly) {
  const filter = activeOnly ? { isActive: true } : {};

  return Category.find(filter)
    .select(CATEGORY_FIELDS)
    .sort({ 'metadata.sortOrder': 1, name: 1 })
    .lean()
    .exec();
}

export async function fetchSubcategories(activeOnly) {
  const filter = activeOnly ? { isActive: true } : {};

  return Subcategory.find(filter)
    .select(SUBCATEGORY_FIELDS)
    .sort({ 'metadata.sortOrder': 1, name: 1 })
    .lean()
    .exec();
}

export async function findCategoryByIdOrSlug(categoryIdOrSlug, activeOnly = true) {
  const value = String(categoryIdOrSlug || '').trim();
  if (!value) return null;

  const filter = activeOnly ? { isActive: true } : {};
  if (mongoose.Types.ObjectId.isValid(value)) {
    filter._id = value;
  } else {
    filter.slug = value.toLowerCase();
  }

  const category = await Category.findOne(filter)
    .select(CATEGORY_FIELDS)
    .lean()
    .exec();

  if (!category) return null;

  const subcategories = await Subcategory.find({
    categoryId: category._id,
    ...(activeOnly ? { isActive: true } : {}),
  })
    .select(SUBCATEGORY_FIELDS)
    .sort({ 'metadata.sortOrder': 1, name: 1 })
    .lean()
    .exec();

  return { ...category, subcategories };
}

export async function fetchProductCounts() {
  return Product.aggregate(productCountsPipeline()).allowDiskUse(false);
}

export async function fetchAllCategoryData(activeOnly, includeCounts) {
  return Promise.all([
    fetchCategories(activeOnly),
    fetchSubcategories(activeOnly),
    includeCounts ? fetchProductCounts() : Promise.resolve([]),
  ]);
}
