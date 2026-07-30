import AISearchService from '../services/ai-search.service.js';
import UploadService from '../services/upload.service.js';
import { imageSourceMetadata, logImageSearch } from '../lib/image-search-logger.js';

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

class AISearchController {
  /**
   * POST - AI-powered marketplace search
   */
  static async search(req, res) {
    const startedAt = Date.now();
    try {
      const { query, imageUrl, role, includeAI, forceAI } = req.body;
      logImageSearch('info', 'request_received', {
        requestId: req.id,
        userId: String(req.user?._id || ''),
        contentType: req.get('content-type')?.split(';')[0],
        hasFile: Boolean(req.file),
        hasImageUrl: Boolean(imageUrl),
        queryLength: String(query || '').trim().length,
        role: role || 'general',
      });

      if (!query && !imageUrl && !req.file) {
        return res.status(400).json({
          error: 'A product image is required',
          code: 'IMAGE_REQUIRED',
          requestId: req.id,
        });
      }

      const searchQuery = query?.trim() || '';
      let resolvedImageUrl = imageUrl?.trim() || null;
      if (req.file) {
        logImageSearch('info', 'file_received', {
          requestId: req.id,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          fileName: String(req.file.originalname || '').slice(0, 160),
          bufferBytes: req.file.buffer?.length || 0,
        });
        const uploadStartedAt = Date.now();
        const uploaded = await UploadService.uploadFiles(req.user._id, [req.file], 'image-search');
        resolvedImageUrl = uploaded.uploads?.[0]?.url || null;
        if (!resolvedImageUrl) {
          throw Object.assign(new Error('Image storage did not return a usable URL'), {
            statusCode: 503,
            code: 'IMAGE_UPLOAD_INCOMPLETE',
            stage: 'upload',
          });
        }
        logImageSearch('info', 'file_uploaded', {
          requestId: req.id,
          durationMs: Date.now() - uploadStartedAt,
          ...imageSourceMetadata(resolvedImageUrl),
        });
      }

      const result = await AISearchService.search({
        query: searchQuery,
        imageUrl: resolvedImageUrl,
        role: role || 'general',
        includeAI: booleanValue(includeAI, true),
        forceAI: booleanValue(forceAI, false),
        userId: req.user?._id || null,
        requestId: req.id,
      });

      logImageSearch('info', 'response_sent', {
        requestId: req.id,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        productCount: result.products?.length || 0,
        sellerCount: result.suppliers?.length || 0,
        categoryCount: result.categories?.length || 0,
        provider: result.provider,
        model: result.model,
      });
      return res.json({ ...result, requestId: req.id });
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      logImageSearch('error', 'request_failed', {
        requestId: req.id,
        statusCode,
        stage: error.stage || 'request',
        durationMs: Date.now() - startedAt,
        error,
      });
      return res.status(statusCode).json({
        error: statusCode >= 500
          ? 'Image search is temporarily unavailable. Please retry in a moment.'
          : error.message,
        code: error.code || 'IMAGE_SEARCH_FAILED',
        stage: error.stage || 'request',
        retryable: error.retryable ?? statusCode >= 500,
        requestId: req.id,
      });
    }
  }
}

export default AISearchController;
