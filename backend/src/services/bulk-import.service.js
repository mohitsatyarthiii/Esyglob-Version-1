import * as XLSX from 'xlsx';
import * as bulkImportRepository from '../repositories/bulk-import.repository.js';
import {
  parseBulkProductFile,
  buildCategoryLookup,
  validateBulkRows,
  summarizeRows,
  BULK_PRODUCT_HEADERS,
} from '../lib/bulk-product-import.js';
import { storeRemoteUpload } from '../lib/storage.js';

const BATCH_SIZE = 50;
const IMAGE_LIMIT = 8;
const ALLOWED_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function isAllowedFile(file) {
  const extension = file.originalname?.split('.').pop()?.toLowerCase();
  return ALLOWED_TYPES.has(file.mimetype) || ['csv', 'xlsx', 'xls'].includes(extension);
}

async function uploadImageUrls(urls, sellerId) {
  const uploaded = [];
  const urlsToProcess = (urls || []).slice(0, IMAGE_LIMIT);

  for (const url of urlsToProcess) {
    try {
      const stored = await storeRemoteUpload(url, `products/bulk/${sellerId}`);
      uploaded.push(stored.url);
    } catch {
      // Skip failed image uploads
    }
  }

  return uploaded;
}

function toProductPayload(row, seller, userId, importId) {
  const data = row.data;

  return {
    sellerId: seller._id,
    userId,
    bulkImportId: importId,
    importRowNumber: row.rowNumber,
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    subcategoryId: data.subcategoryId,
    category: data.category,
    subcategory: data.subcategory,
    price: data.price,
    currency: data.currency,
    minimumOrderQuantity: data.minimumOrderQuantity,
    unit: data.unit,
    brand: data.brand,
    countryOfOrigin: data.countryOfOrigin,
    stockQuantity: data.stockQuantity,
    specifications: data.specifications,
    leadTime: { value: data.leadTime || 0, unit: 'days' },
    deliveryTime: { value: data.leadTime || 0, unit: 'days' },
    videos: data.videos || [],
    tags: data.tags || [],
  };
}

// ─── Preview Upload ────────────────────────────────────────
export async function previewBulkUpload(user, file, requestedProductStatus) {
  if (!isAllowedFile(file)) {
    const error = new Error('Upload a CSV, XLSX, or XLS file');
    error.statusCode = 422;
    throw error;
  }

  if (!['draft', 'active', 'paused'].includes(requestedProductStatus)) {
    const error = new Error('Invalid import status');
    error.statusCode = 422;
    throw error;
  }

  if (file.size > 15 * 1024 * 1024) {
    const error = new Error('Bulk upload file must be 15MB or smaller');
    error.statusCode = 413;
    throw error;
  }

  const seller = await bulkImportRepository.findSellerByUserId(user.id);

  if (!seller || !user.hasCompletedOnboarding) {
    const error = new Error(
      'Complete seller onboarding before bulk importing products'
    );
    error.statusCode = 409;
    throw error;
  }

  const parsedRows = await parseBulkProductFile({
    arrayBuffer: async () => file.buffer,
    name: file.originalname,
  });

  if (!parsedRows.length) {
    const error = new Error('No products found in uploaded file');
    error.statusCode = 422;
    throw error;
  }

  const [categories, subcategories] = await Promise.all([
    bulkImportRepository.findActiveCategories(),
    bulkImportRepository.findActiveSubcategories(),
  ]);

  const rows = validateBulkRows(parsedRows, buildCategoryLookup(categories, subcategories));
  const totals = summarizeRows(rows);

  const importRecord = await bulkImportRepository.createImportRecord({
    sellerId: seller._id,
    userId: user.id,
    fileName: file.originalname,
    fileType: file.mimetype || file.originalname?.split('.').pop(),
    importStatus: 'validated',
    requestedProductStatus,
    totals,
    progress: {
      totalProducts: totals.validRows,
      importedProducts: 0,
      failedProducts: 0,
      remainingProducts: totals.validRows,
    },
    rows,
    errorReport: rows
      .filter((row) => row.errors.length)
      .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors, raw: row.raw })),
  });

  return {
    importId: importRecord._id,
    totals,
    rows: rows.slice(0, 200),
    truncated: rows.length > 200,
  };
}

// ─── Execute Import ────────────────────────────────────────
export async function executeBulkImport(user, importId) {
  const seller = await bulkImportRepository.findSellerByUserId(user.id);

  if (!seller) {
    const error = new Error('Seller profile not found');
    error.statusCode = 404;
    throw error;
  }

  const importRecord = await bulkImportRepository.findImportById(importId, seller._id);

  if (!importRecord) {
    const error = new Error('Bulk import not found');
    error.statusCode = 404;
    throw error;
  }

  if (
    !['validated', 'completed_with_errors', 'failed'].includes(importRecord.importStatus)
  ) {
    const error = new Error('This import is already processing or completed');
    error.statusCode = 409;
    throw error;
  }

  const validRows = importRecord.rows.filter(
    (row) => row.status === 'valid' || row.status === 'failed'
  );

  // Set status to processing
  importRecord.importStatus = 'processing';
  importRecord.startedAt = new Date();
  importRecord.progress = {
    totalProducts: validRows.length,
    importedProducts: 0,
    failedProducts: 0,
    remainingProducts: validRows.length,
  };
  await importRecord.save();

  let importedRows = 0;
  let failedRows = 0;

  for (let index = 0; index < validRows.length; index += BATCH_SIZE) {
    const batch = validRows.slice(index, index + BATCH_SIZE);

    for (const row of batch) {
      try {
        const images = await uploadImageUrls(row.data.images, seller._id);

        const product = await bulkImportRepository.createProduct({
          ...toProductPayload(row, seller, user.id, importRecord._id),
          images,
          status: importRecord.requestedProductStatus,
        });

        await bulkImportRepository.upsertCategoryMapping(
          product._id,
          product.categoryId,
          product.subcategoryId
        );

        row.status = 'imported';
        row.productId = product._id;
        row.failedReason = undefined;
        importedRows += 1;
      } catch (err) {
        row.status = 'failed';
        row.failedReason = err.message || 'Import failed';
        row.errors = [...(row.errors || []), row.failedReason];
        failedRows += 1;
      }
    }

    importRecord.progress = {
      totalProducts: validRows.length,
      importedProducts: importedRows,
      failedProducts: failedRows,
      remainingProducts: Math.max(validRows.length - importedRows - failedRows, 0),
    };
    await importRecord.save();
  }

  // Finalize import record
  importRecord.totals.importedRows = importedRows;
  importRecord.totals.failedRows += failedRows;
  importRecord.importStatus = failedRows ? 'completed_with_errors' : 'completed';
  importRecord.completedAt = new Date();
  importRecord.errorReport = importRecord.rows
    .filter((row) => row.status === 'invalid' || row.status === 'failed')
    .map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      errors: row.errors,
      failedReason: row.failedReason,
      raw: row.raw,
    }));

  await Promise.all([
    importRecord.save(),
    bulkImportRepository.incrementSellerProductCount(seller._id, importedRows),
  ]);

  return {
    importId: importRecord._id,
    status: importRecord.importStatus,
    totals: importRecord.totals,
    progress: importRecord.progress,
    errorReport: importRecord.errorReport,
    importedCount: importedRows,
  };
}

// ─── Import History ────────────────────────────────────────
export async function getImportHistory(user, limit) {
  let filter = {};

  if (!user.roles.includes('admin')) {
    const seller = await bulkImportRepository.findSellerByUserId(user.id);
    filter = seller ? { sellerId: seller._id } : { sellerId: null };
  }

  const imports = await bulkImportRepository.findImports(filter, limit);
  return { imports };
}

// ─── Generate Template ─────────────────────────────────────
export function generateTemplate(type = 'csv') {
  const sampleRow = {
    'Product Name': 'Industrial Packaging Machine',
    Description: 'Automatic packaging machine suitable for export-ready cartons',
    Category: 'Machinery',
    Subcategory: 'Packaging Machines',
    MOQ: 10,
    Unit: 'piece',
    Price: 125000,
    Currency: 'INR',
    Specifications: 'Material:Stainless Steel|Voltage:220V|Speed:60 packs/min',
    Brand: 'Esy Machinery',
    'Country Of Origin': 'India',
    'Lead Time': 21,
    'Stock Quantity': 50,
    'Product Images': 'https://example.com/image-1.jpg|https://example.com/image-2.jpg',
    'Product Videos': 'https://example.com/video.mp4',
    Tags: 'packaging machine|export ready|automatic',
  };

  if (type === 'xlsx' || type === 'xls') {
    const worksheet = XLSX.utils.json_to_sheet([sampleRow], {
      header: BULK_PRODUCT_HEADERS,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    const bookType = type === 'xls' ? 'biff8' : 'xlsx';
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType });

    return {
      buffer,
      contentType:
        type === 'xls'
          ? 'application/vnd.ms-excel'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `esyglob-product-bulk-template.${type}`,
    };
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  const csv = [
    BULK_PRODUCT_HEADERS.map(csvEscape).join(','),
    BULK_PRODUCT_HEADERS.map((header) => csvEscape(sampleRow[header])).join(','),
  ].join('\n');

  return {
    buffer: Buffer.from(csv, 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    filename: 'esyglob-product-bulk-template.csv',
  };
}