import StorageService, { UploadStorageError } from './storage.service.js';
import { UPLOAD } from '../lib/constants.js';

class UploadService {
  static validateFiles(files) {
    if (!files?.length) throw Object.assign(new Error(`Upload between 1 and ${UPLOAD.MAX_FILES_PER_UPLOAD} files`), { statusCode: 422 });
    if (files.length > UPLOAD.MAX_FILES_PER_UPLOAD) throw Object.assign(new Error(`Maximum ${UPLOAD.MAX_FILES_PER_UPLOAD} files per upload`), { statusCode: 422 });
    for (const file of files) {
      if (Number(file.size || file.buffer?.length || 0) > UPLOAD.MAX_FILE_SIZE) throw Object.assign(new Error(`${file.originalname || 'File'} exceeds the 5MB limit`), { statusCode: 413 });
    }
  }

  static async uploadFiles(userId, files, folder = 'documents') {
    this.validateFiles(files);
    const safeFolder = StorageService.normalizeFolder(`${folder}/${userId}`);
    const uploads = [];
    for (const file of files) uploads.push(await StorageService.uploadFile(file, safeFolder));
    return { uploads };
  }

  static uploadFile(file, folder = 'documents', options = {}) {
    return StorageService.uploadFile(file, folder, options);
  }

  static uploadRemote(url, folder = 'products', options = {}) {
    return StorageService.uploadRemote(url, folder, options);
  }

  static deleteImage(storageKey) {
    return StorageService.deleteImage(storageKey);
  }

  static replaceImage(storageKey, upload) {
    return StorageService.replaceImage(storageKey, upload);
  }

  static getAccountHealth() {
    return [{ provider: 'vps', status: 'ready' }];
  }
}

export { UploadStorageError };
export default UploadService;
