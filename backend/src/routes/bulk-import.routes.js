import { Router } from 'express';
import * as bulkImportController from '../controllers/bulk-import.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { uploadBulkProductFile } from '../middlewares/upload.middleware.js';

const router = Router();

// POST /api/products/bulk/import/preview - Upload and validate
router.post(
  '/import/preview',
  authenticate,
  requireAuth,
  requireRole('seller'),
  uploadBulkProductFile,
  bulkImportController.previewBulkUpload
);

// POST /api/products/bulk/import/execute - Execute import
router.post(
  '/import/execute',
  authenticate,
  requireAuth,
  requireRole('seller'),
  bulkImportController.executeBulkImport
);

// GET /api/products/bulk/import/history - Import history
router.get(
  '/import/history',
  authenticate,
  requireAuth,
  bulkImportController.getImportHistory
);

// GET /api/products/bulk/import/template - Download template
router.get(
  '/import/template',
  bulkImportController.downloadTemplate
);

export default router;
