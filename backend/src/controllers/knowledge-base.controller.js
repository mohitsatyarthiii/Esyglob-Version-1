import KnowledgeBaseService from '../services/knowledge-base.service.js';

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
}
