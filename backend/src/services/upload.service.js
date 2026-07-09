import { storeUpload } from '../lib/storage.js';
import { UPLOAD } from '../lib/constants.js';

class UploadService {
  /**
   * Upload files to Cloudinary
   */
  static async uploadFiles(userId, files, folder = 'general') {
    // Validate file count
    if (!files || !files.length) {
      throw Object.assign(
        new Error(`Upload between 1 and ${UPLOAD.MAX_FILES_PER_UPLOAD} files`),
        { statusCode: 422 }
      );
    }

    if (files.length > UPLOAD.MAX_FILES_PER_UPLOAD) {
      throw Object.assign(
        new Error(`Maximum ${UPLOAD.MAX_FILES_PER_UPLOAD} files per upload`),
        { statusCode: 422 }
      );
    }

    // Sanitize folder name
    const safeFolder = String(folder).trim().slice(0, 120).replace(/[^a-z0-9/_-]/gi, '') || 'general';

    // Validate each file
    for (const file of files) {
      const allowedTypes = [
        ...UPLOAD.ALLOWED_IMAGE_TYPES,
        ...UPLOAD.ALLOWED_DOCUMENT_TYPES,
      ];

      const isVideo = file.mimetype?.startsWith('video/');
      const isAllowed = allowedTypes.includes(file.mimetype) || isVideo;

      if (!isAllowed) {
        throw Object.assign(
          new Error(`Unsupported file type: ${file.mimetype}`),
          { statusCode: 415 }
        );
      }

      if (file.size > UPLOAD.MAX_FILE_SIZE) {
        throw Object.assign(
          new Error(`${file.originalname || 'File'} exceeds the 5MB limit`),
          { statusCode: 413 }
        );
      }
    }

    // Upload all files
    const uploads = [];
    for (const file of files) {
      const result = await storeUpload(
        {
          arrayBuffer: () => Promise.resolve(file.buffer),
          type: file.mimetype,
          name: file.originalname,
          size: file.size,
        },
        `${safeFolder}/${userId}`
      );
      uploads.push(result);
    }

    return { uploads };
  }
}

export default UploadService;