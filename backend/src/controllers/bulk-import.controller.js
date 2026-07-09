import * as bulkImportService from '../services/bulk-import.service.js';
import { toPositiveInt } from '../lib/product-helpers.js';
import { invalidateMemoryCache } from '../lib/cache.js';

function invalidateProductCaches(sellerId) {
  invalidateMemoryCache('products:');
  invalidateMemoryCache('categories:');
  if (sellerId) invalidateMemoryCache(`supplier-profile:${sellerId}`);
}

// ─── POST /api/products/bulk/import/preview ─────────────────
export async function previewBulkUpload(req, res, next) {
  try {
    const user = req.user;

    if (!user?.roles?.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const file = req.file;
    const requestedProductStatus = req.body.status || 'draft';

    if (!file) {
      return res.status(422).json({ error: 'Upload a CSV, XLSX, or XLS file' });
    }

    const result = await bulkImportService.previewBulkUpload(
      user,
      file,
      requestedProductStatus
    );

    return res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Bulk product preview error:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Unable to validate bulk upload' });
  }
}

// ─── POST /api/products/bulk/import/execute ─────────────────
export async function executeBulkImport(req, res, next) {
  try {
    const user = req.user;

    if (!user?.roles?.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const { importId } = req.body;

    if (!importId) {
      return res.status(422).json({ error: 'Import ID is required' });
    }

    const result = await bulkImportService.executeBulkImport(user, importId);

    if (result.importedCount > 0) {
      const seller = await import('../repositories/bulk-import.repository.js').then(
        (m) => m.findSellerByUserId(user.id)
      );
      invalidateProductCaches(seller?._id);
    }

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Bulk product import error:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Unable to import products' });
  }
}

// ─── GET /api/products/bulk/import/history ──────────────────
export async function getImportHistory(req, res, next) {
  try {
    const user = req.user;

    if (!user?.roles?.some((role) => role === 'seller' || role === 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const limit = toPositiveInt(req.query.limit, 20, 100);
    const result = await bulkImportService.getImportHistory(user, limit);

    return res.json(result);
  } catch (error) {
    console.error('Bulk product import history error:', error);
    return res.status(500).json({ error: 'Unable to load import history' });
  }
}

// ─── GET /api/products/bulk/import/template ─────────────────
export async function downloadTemplate(req, res) {
  const type = req.query.type || 'csv';

  if (!['csv', 'xlsx', 'xls'].includes(type)) {
    return res.status(400).json({ error: 'Invalid template type' });
  }

  const template = bulkImportService.generateTemplate(type);

  res.setHeader('Content-Type', template.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${template.filename}"`
  );
  return res.send(template.buffer);
}