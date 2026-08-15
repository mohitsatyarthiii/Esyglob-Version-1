import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import { escapeRegex } from './rfq-helpers.js';

function selector(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  const exact = new RegExp(`^${escapeRegex(input)}$`, 'i');
  return { $or: [{ name: exact }, { slug: exact }] };
}

export async function resolveTaxonomyPair(categoryValue, subcategoryValue, { requireSubcategory = false } = {}) {
  const categorySelector = selector(categoryValue);
  if (!categorySelector) {
    const error = new Error('Select a valid category');
    error.statusCode = 422;
    throw error;
  }

  const category = await Category.findOne({ ...categorySelector, isActive: true }).select('_id name slug').lean();
  if (!category) {
    const error = new Error('Select a valid category');
    error.statusCode = 422;
    throw error;
  }

  const subcategorySelector = selector(subcategoryValue);
  if (!subcategorySelector) {
    if (requireSubcategory) {
      const error = new Error('Select a valid subcategory');
      error.statusCode = 422;
      throw error;
    }
    return { category: category.name, subcategory: '' };
  }

  const subcategory = await Subcategory.findOne({
    ...subcategorySelector,
    categoryId: category._id,
    isActive: true,
  }).select('_id name slug').lean();
  if (!subcategory) {
    const error = new Error('The selected subcategory does not belong to the selected category');
    error.statusCode = 422;
    throw error;
  }

  return { category: category.name, subcategory: subcategory.name };
}

export async function validateSellerTaxonomy(categories = [], subcategories = []) {
  const uniqueCategories = [...new Set(categories.map((value) => String(value || '').trim()).filter(Boolean))];
  const uniqueSubcategories = [...new Set(subcategories.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!uniqueCategories.length && !uniqueSubcategories.length) return { categories: [], subcategories: [] };

  const categoryDocs = await Category.find({
    isActive: true,
    $or: uniqueCategories.map((value) => ({ name: new RegExp(`^${escapeRegex(value)}$`, 'i') })),
  }).select('_id name').lean();
  if (categoryDocs.length !== uniqueCategories.length) {
    const error = new Error('One or more selected categories are invalid');
    error.statusCode = 422;
    throw error;
  }

  const subcategoryDocs = uniqueSubcategories.length ? await Subcategory.find({
    isActive: true,
    categoryId: { $in: categoryDocs.map((item) => item._id) },
    $or: uniqueSubcategories.map((value) => ({ name: new RegExp(`^${escapeRegex(value)}$`, 'i') })),
  }).select('name categoryId').lean() : [];
  if (subcategoryDocs.length !== uniqueSubcategories.length) {
    const error = new Error('One or more selected subcategories do not belong to the selected categories');
    error.statusCode = 422;
    throw error;
  }

  return {
    categories: categoryDocs.map((item) => item.name),
    subcategories: subcategoryDocs.map((item) => item.name),
  };
}
