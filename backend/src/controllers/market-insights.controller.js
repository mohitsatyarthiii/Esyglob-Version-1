import MarketInsightsService from '../services/market-insights.service.js';
import MarketResearchService from '../services/market-research.service.js';

class MarketInsightsController {
  static async streamResearch(req, res) {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const send = event => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': keep-alive\n\n'); }, 10000);
    try {
      await MarketResearchService.run({ userId, session: req.user, ...req.body }, send);
      send({ type: 'done' });
    } catch (error) {
      console.error('[Market-Research-Stream] Error:', error);
      send({ type: 'error', message: error.message || 'Research failed', status: error.statusCode || 500 });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }
  /**
   * GET - Dashboard data (products + countries)
   */
  static async getDashboard(req, res) {
    try {
      const data = await MarketInsightsService.getDashboardData();
      return res.json(data);
    } catch (error) {
      console.error('[Market-Insights-GET] Error:', error);
      return res.status(500).json({ products: [], countries: [], error: error.message });
    }
  }

  /**
   * POST - Generate intelligence report
   */
  static async generateReport(req, res) {
    try {
      const { mode, productName, country, category } = req.body;

      if (!productName) {
        return res.status(400).json({ error: 'Product required' });
      }

      const result = await MarketInsightsService.generateReport({
        mode: mode || 'product_rd',
        productName,
        country: country || '',
        category: category || '',
      });

      return res.json(result);
    } catch (error) {
      console.error('[Market-Insights-POST] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message || 'Unable to generate report' });
    }
  }

  /**
   * PATCH - Update bookmark/favorite
   */
  static async updateReport(req, res) {
    try {
      const { reportId, isBookmarked, isFavorite } = req.body;
      const result = await MarketInsightsService.updateReportMeta(reportId, { isBookmarked, isFavorite });
      return res.json(result);
    } catch (error) {
      console.error('[Market-Insights-PATCH] Error:', error);
      return res.status(500).json({ error: 'Failed to update report' });
    }
  }

  /**
   * DELETE - Remove report
   */
  static async deleteReport(req, res) {
    try {
      const result = await MarketInsightsService.deleteReport();
      return res.json(result);
    } catch (error) {
      console.error('[Market-Insights-DELETE] Error:', error);
      return res.status(500).json({ error: 'Failed to delete report' });
    }
  }
}

export default MarketInsightsController;
