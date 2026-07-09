import UploadService from '../services/upload.service.js';

class UploadController {
  /**
   * POST - Upload files
   */
  static async upload(req, res) {
    try {
      const files = Array.isArray(req.files)
        ? req.files
        : Object.values(req.files || {}).flat();
      const folder = req.body?.folder || 'general';

      const result = await UploadService.uploadFiles(req.user._id, files, folder);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Upload] Error:', error);

      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      if (error.statusCode === 415) {
        return res.status(415).json({ error: error.message });
      }
      if (error.statusCode === 413) {
        return res.status(413).json({ error: error.message });
      }

      const isCloudinaryConfigError = error.message?.includes('Cloudinary storage is missing');
      return res.status(isCloudinaryConfigError ? 503 : 500).json({
        error: isCloudinaryConfigError ? error.message : 'Unable to upload files',
      });
    }
  }
}

export default UploadController;
