import multer from 'multer';
import { UPLOAD } from '../lib/constants.js';
import { logImageSearch } from '../lib/image-search-logger.js';

// Memory storage keeps untrusted bytes out of the filesystem until the
// centralized StorageService validates and transforms them.
const storage = multer.memoryStorage();

/**
 * File filter - validate file types
 */
function fileFilter(req, file, cb) {
  const allowedTypes = [
    ...UPLOAD.ALLOWED_IMAGE_TYPES,
    ...UPLOAD.ALLOWED_DOCUMENT_TYPES,
    'application/image',
  ];

  // Also allow video
  const isVideo = file.mimetype.startsWith('video/');
  const isAllowed = allowedTypes.includes(file.mimetype) || isVideo;

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
}

/**
 * Multer instance for single file upload
 */
const uploadSingleFile = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD.MAX_FILE_SIZE,
    files: 1,
  },
});

/**
 * Multer instance for multiple file upload
 */
const uploadMultipleFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD.MAX_FILE_SIZE,
    files: UPLOAD.MAX_FILES_PER_UPLOAD,
  },
});

// ============ EXPORTS ============

/**
 * Single file upload middleware using the platform-standard "file" field.
 */
export const uploadSingle = uploadSingleFile.single('file');

const imageSearchUpload = multer({
  storage,
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(allowed ? null : new Error('Image search supports JPG, PNG, and WebP images only'), allowed);
  },
  limits: {
    fileSize: UPLOAD.MAX_FILE_SIZE,
    files: 1,
  },
});

export const uploadImageSearch = imageSearchUpload.single('file');

const bulkProductUpload = multer({
  storage,
  fileFilter(req, file, cb) {
    const extension = file.originalname?.split('.').pop()?.toLowerCase();
    const allowed = ['csv', 'xlsx', 'xls', 'json'].includes(extension);
    cb(allowed ? null : new Error('Unsupported bulk product file type'), allowed);
  },
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

export const uploadBulkProductFile = bulkProductUpload.single('file');

/**
 * Single-file middleware factory for endpoints that use a non-default field name.
 */
export const uploadSingleField = (fieldName) => uploadSingleFile.single(fieldName);

/**
 * Multiple files upload middleware (field name configurable, max 10)
 * Usage: uploadMultiple('images') or uploadMultiple('files')
 */
export const uploadMultiple = (fieldName = 'files') => uploadMultipleFiles.array(fieldName, UPLOAD.MAX_FILES_PER_UPLOAD);

/**
 * Raw multer instance for custom configurations
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD.MAX_FILE_SIZE,
    files: UPLOAD.MAX_FILES_PER_UPLOAD,
  },
});

/**
 * Handle multer errors
 */
export function handleUploadError(err, req, res, next) {
  const respond = (status, error, code) => {
    if (req.originalUrl?.includes('/ai-search')) {
      logImageSearch('warn', 'upload_validation_failed', {
        requestId: req.id,
        statusCode: status,
        code,
        error: err,
      });
    }
    return res.status(status).json({ error, code, requestId: req.id });
  };
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return respond(413, 'File exceeds the 5MB limit', 'IMAGE_TOO_LARGE');
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return respond(422, `Maximum ${UPLOAD.MAX_FILES_PER_UPLOAD} files per upload`, 'TOO_MANY_FILES');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return respond(422, 'Unexpected file field', 'UNEXPECTED_FILE_FIELD');
    }
    return respond(400, err.message, 'UPLOAD_VALIDATION_FAILED');
  }

  if (err.message?.includes('Unsupported file type') || err.message?.includes('Image search supports')) {
    return respond(415, err.message, 'UNSUPPORTED_IMAGE_TYPE');
  }

  next(err);
}
