import KnowledgeBaseService from '../services/knowledge-base.service.js';
import { extractKnowledgeContent, inferSourceType } from '../lib/knowledge-ingestion.js';

export default class KnowledgeBaseController {
  static async list(req, res, next) {
    try {
      const documents = await KnowledgeBaseService.list(req.query);
      res.json({ documents });
    } catch (error) { next(error); }
  }

  static async upsert(req, res, next) {
    try {
      if (!req.body?.title || !req.body?.category) {
        return res.status(400).json({ error: 'title and category are required' });
      }
      const document = await KnowledgeBaseService.upsert(req.body, req.user._id);
      return res.status(201).json({ document });
    } catch (error) { return next(error); }
  }

  static async ingest(req, res, next) {
    try {
      if (!req.body?.title) {
        return res.status(400).json({ error: 'title is required' });
      }
      const content = await extractKnowledgeContent(req.file, req.body.content);
      const source = {
        type: inferSourceType(req.file),
        fileName: req.file?.originalname,
        mimeType: req.file?.mimetype,
        uri: req.body.sourceUri,
      };
      const result = await KnowledgeBaseService.ingest({
        payload: req.body,
        content,
        source,
      }, req.user._id);
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      return next(error);
    }
  }
}
