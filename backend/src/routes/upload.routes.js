import { Router } from 'express';
import UploadController from '../controllers/upload.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';
import { upload, handleUploadError } from '../middlewares/upload.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// POST - Upload files (max 10 files, 5MB each)
router.post(
  '/',
  upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'file', maxCount: 1 },
  ]),
  handleUploadError,
  UploadController.upload
);

export default router;
