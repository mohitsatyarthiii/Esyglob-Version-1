import mongoose from 'mongoose';
import BulkProductImport from '../models/BulkProductImport.js';
import Product from '../models/Product.js';
import ProductCategoryMapping from '../models/ProductCategoryMapping.js';
import Seller from '../models/Seller.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';

// ─── Import Record ─────────────────────────────────────────
export async function findImportById(importId, sellerId) {
  return BulkProductImport.findOne({ _id: importId, sellerId }).exec();
}

export async function createImportRecord(data) {
  return BulkProductImport.create(data);
}

export async function updateImportRecord(importId, update) {
  return BulkProductImport.findByIdAndUpdate(importId, update, { new: true }).exec();
}

export async function findImports(filter, limit) {
  return BulkProductImport.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'sellers',
        localField: 'sellerId',
        foreignField: '_id',
        as: 'seller',
        pipeline: [{ $project: { companyName: 1 } }],
      },
    },
    { $set: { sellerId: { $first: '$seller' } } },
    {
      $project: {
        seller: 0,
        __v: 0,
        rows: 0,
      },
    },
  ]);
}

// ─── Product Creation ──────────────────────────────────────
export async function createProduct(data) {
  return Product.create(data);
}

export async function upsertCategoryMapping(productId, categoryId, subcategoryId) {
  return ProductCategoryMapping.findOneAndUpdate(
    { productId, categoryId, subcategoryId },
    { $set: { isPrimary: true } },
    { upsert: true, setDefaultsOnInsert: true }
  ).exec();
}

export async function incrementSellerProductCount(sellerId, count) {
  return Seller.updateOne({ _id: sellerId }, { $inc: { totalProducts: count } }).exec();
}

// ─── Category Lookups ──────────────────────────────────────
export async function findActiveCategories() {
  return Category.find({ isActive: true }).lean().exec();
}

export async function findActiveSubcategories() {
  return Subcategory.find({ isActive: true }).lean().exec();
}

export async function findSellerByUserId(userId) {
  return Seller.findOne({ userId }).lean().exec();
}