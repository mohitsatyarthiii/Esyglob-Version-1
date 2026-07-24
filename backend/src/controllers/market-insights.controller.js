import MarketInsightsService from '../services/market-insights.service.js';
import MarketResearchService from '../services/market-research.service.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { refundUsage } from '../lib/subscription-access.js';
import { buildMarketInsightPdf, sendMarketInsightPdf } from '../lib/market-insight-pdf.js';

const reportPayload = row => ({
  ...row.reportData,
  savedReportId: String(row._id),
  reportId: row.reportData?.id || String(row._id),
  reportVersion: row.reportVersion || row.reportData?.reportVersion || '1.0',
  pdfStatus: row.pdfStatus,
  status: row.pdfStatus === 'ready' ? 'ready' : row.pdfStatus,
  pdfUrl: `/api/market-insights/reports/${row._id}/pdf`,
  downloadUrl: `/api/market-insights/reports/${row._id}/pdf?download=1`,
  isBookmarked: row.isBookmarked,
  isFavorite: row.isFavorite,
  downloadCount: row.downloadCount || 0,
  lastOpenedAt: row.lastOpenedAt,
  generatedAt: row.reportData?.generatedAt || row.createdAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

class MarketInsightsController {
  static async listResearchReports(req, res) {
    try {
      const rows = await SavedResearchReport.find({ userId: req.user._id, status: 'active' })
        .select('title reportType productName country query reportData reportVersion pdfStatus isBookmarked isFavorite downloadCount lastOpenedAt createdAt updatedAt')
        .sort({ updatedAt: -1 }).limit(60).lean();
      return res.json({ reports: rows.map(reportPayload) });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unable to load research reports' });
    }
  }

  static async getResearchReport(req, res) {
    try {
      const row = await SavedResearchReport.findOne({ _id: req.params.reportId, userId: req.user._id, status: 'active' })
        .select('reportData reportVersion pdfStatus isBookmarked isFavorite downloadCount lastOpenedAt createdAt updatedAt').lean();
      if (!row) return res.status(404).json({ error: 'Report not found' });
      await SavedResearchReport.updateOne({ _id: row._id }, { $set: { lastOpenedAt: new Date() } });
      return res.json({ report: reportPayload({ ...row, lastOpenedAt: new Date() }) });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unable to open report' });
    }
  }

  static async downloadResearchPdf(req, res) {
    try {
      const row = await SavedResearchReport.findOne({ _id: req.params.reportId, userId: req.user._id, status: 'active' })
        .select('+pdfData reportData reportVersion pdfStatus query downloadCount lastOpenedAt createdAt pdfGeneratedAt');
      if (!row) return res.status(404).json({ error: 'Report not found' });
      let buffer = row.pdfData;
      if (!buffer?.length) {
        buffer = await buildMarketInsightPdf(row.reportData, {
          reportId: row.reportData?.id || String(row._id),
          generatedAt: row.reportData?.generatedAt || row.createdAt,
          query: row.query,
          reportVersion: row.reportVersion,
        });
        row.pdfData = buffer;
        row.pdfStatus = 'ready';
        row.pdfGeneratedAt = new Date();
      }
      row.downloadCount = Number(row.downloadCount || 0) + 1;
      row.lastOpenedAt = new Date();
      await row.save();
      return sendMarketInsightPdf(res, buffer, row.reportData, req.query.download === '1' ? 'attachment' : 'inline');
    } catch (error) {
      console.error('[Market-Insights-PDF] Error:', error);
      if (!res.headersSent) return res.status(500).json({ error: 'The PDF could not be prepared. Please retry.' });
    }
  }

  static async createShareLink(req, res) {
    try {
      const row = await SavedResearchReport.findOne({ _id: req.params.reportId, userId: req.user._id, status: 'active', pdfStatus: 'ready' }).select('+shareToken');
      if (!row) return res.status(404).json({ error: 'Report not found or PDF is not ready' });
      row.shareEnabled = true;
      row.shareCreatedAt = new Date();
      await row.save();
      const origin = String(process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}/api`).replace(/\/$/, '');
      return res.json({ shareUrl: `${origin}/market-insights/shared/${row.shareToken}/pdf` });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unable to create share link' });
    }
  }

  static async sharedResearchPdf(req, res) {
    try {
      const row = await SavedResearchReport.findOne({ shareToken: req.params.token, shareEnabled: true, status: 'active', pdfStatus: 'ready' }).select('+pdfData reportData');
      if (!row?.pdfData?.length) return res.status(404).json({ error: 'Shared report is unavailable' });
      return sendMarketInsightPdf(res, row.pdfData, row.reportData, 'inline');
    } catch {
      return res.status(404).json({ error: 'Shared report is unavailable' });
    }
  }
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
      await refundUsage(req.user, 'marketInsights', 1, { ai: true }).catch(() => undefined);
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

      const result = await MarketResearchService.run({
        userId: req.user._id,
        session: req.user,
        mode: mode || 'product_rd',
        productName,
        country: country || '',
        category: category || '',
      }, () => {});

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
      const updates = {};
      if (typeof isBookmarked === 'boolean') updates.isBookmarked = isBookmarked;
      if (typeof isFavorite === 'boolean') updates.isFavorite = isFavorite;
      const row = await SavedResearchReport.findOneAndUpdate({ _id: reportId, userId: req.user._id, status: 'active' }, { $set: updates }, { new: true })
        .select('reportData reportVersion pdfStatus isBookmarked isFavorite downloadCount lastOpenedAt createdAt updatedAt').lean();
      if (!row) return res.status(404).json({ error: 'Report not found' });
      return res.json({ report: reportPayload(row) });
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
      const reportId = req.params.reportId || req.body.reportId || req.query.reportId;
      if (!reportId) return res.status(400).json({ error: 'Report ID is required' });
      const result = await SavedResearchReport.updateOne({ _id: reportId, userId: req.user._id, status: 'active' }, { $set: { status: 'deleted', shareEnabled: false } });
      if (!result.modifiedCount) return res.status(404).json({ error: 'Report not found' });
      return res.json({ success: true, reportId });
    } catch (error) {
      console.error('[Market-Insights-DELETE] Error:', error);
      return res.status(500).json({ error: 'Failed to delete report' });
    }
  }
}

export default MarketInsightsController;
