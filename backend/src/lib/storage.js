import UploadService from '../services/upload.service.js';

/**
 * Backward-compatible storage facade.
 * New and existing callers share the centralized multi-account upload pipeline.
 */
export function storeUpload(file, folder = 'documents', options = {}) {
  return UploadService.uploadFile(file, folder, options);
}

export function storeRemoteUpload(url, folder = 'documents', options = {}) {
  return UploadService.uploadRemote(url, folder, options);
}
