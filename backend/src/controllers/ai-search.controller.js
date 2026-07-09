import AISearchService from '../services/ai-search.service.js';

class AISearchController {
  /**
   * POST - AI-powered marketplace search
   */
  static async search(req, res) {
    try {
      const { query, imageUrl, role, includeAI, forceAI } = req.body;

      if (!query && !imageUrl) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const searchQuery = query?.trim() || (imageUrl ? 'Find visually similar products and suppliers for this uploaded image' : '');

      const result = await AISearchService.search({
        query: searchQuery,
        imageUrl: imageUrl?.trim() || null,
        role: role || 'general',
        includeAI: includeAI !== false,
        forceAI: forceAI || false,
        userId: req.user?._id || null,
      });

      return res.json(result);
    } catch (error) {
      console.error('[AI-Search] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'AI search failed' });
    }
  }
}

export default AISearchController;