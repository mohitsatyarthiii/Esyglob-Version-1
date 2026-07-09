import GlobalSearchService from '../services/global-search.service.js';

class GlobalSearchController {
  /**
   * GET - Global marketplace search
   */
  static async search(req, res) {
    try {
      const result = await GlobalSearchService.search(req.query);

      // Set cache headers
      res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=120');

      return res.json(result);
    } catch (error) {
      console.error('[GlobalSearch] Error:', error);
      return res.status(500).json({ error: 'Unable to search marketplace' });
    }
  }
}

export default GlobalSearchController;