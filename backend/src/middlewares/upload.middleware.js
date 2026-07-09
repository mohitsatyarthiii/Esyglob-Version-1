import multer from 'multer';
import { UPLOAD } from '../lib/constants.js';

// Memory storage (files stored in buffer for Cloudinary upload)
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
 * Single file upload middleware (field name configurable)
 * Usage: uploadSingle('image') or uploadSingle('logo')
 */
export const uploadSingle = (fieldName = 'file') => uploadSingleFile.single(fieldName);

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
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds the 5MB limit' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(422).json({ error: `Maximum ${UPLOAD.MAX_FILES_PER_UPLOAD} files per upload` });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(422).json({ error: 'Unexpected file field' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err.message?.includes('Unsupported file type')) {
    return res.status(415).json({ error: err.message });
  }

  next(err);
}