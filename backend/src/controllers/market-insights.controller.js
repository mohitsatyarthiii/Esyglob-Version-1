import MarketInsightsService from '../services/market-insights.service.js';
import MarketResearchService from '../services/market-research.service.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { refundUsage } from '../lib/subscription-access.js';
import { buildMarketInsightPdf, sendMarketInsightPdf } from '../lib/market-insight-pdf.js';
import MarketReportStorageService from '../services/market-report-storage.service.js';

const reportPayload = row => ({
  title: row.title || row.reportData?.title,
  query: row.query || row.reportData?.query,
  description: row.query || row.reportData?.executiveSummary || 'AI-generated market intelligence report',
  reportType: row.reportType || row.reportData?.reportType,
  productName: row.productName || row.reportData?.productName,
  country: row.country || row.reportData?.country,
  savedReportId: String(row._id),
  reportId: row.reportData?.id || String(row._id),
  reportVersion: row.reportVersion || row.reportData?.reportVersion || '1.0',
  pdfStatus: row.pdfStatus,
  status: row.pdfStatus === 'ready' ? 'ready' : row.pdfStatus,
  previewUrl: row.previewUrl || `/api/market-insights/reports/${row._id}/pdf`,
  pdfUrl: row.previewUrl || `/api/market-insights/reports/${row._id}/pdf`,
  downloadUrl: row.downloadUrl || `/api/market-insights/reports/${row._id}/pdf?download=1`,
  pages: Number(row.pageCount || 0),
  fileSize: Number(row.fileSize || 0),
  generationTimeMs: Number(row.generationTimeMs || row.reportData?.elapsedMs || 0),
  storageProvider: row.storageProvider || 'mongodb',
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
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
      const filter = { userId: req.user._id, status: 'active' };
      const [rows, total] = await Promise.all([
        SavedResearchReport.find(filter)
          .select('title reportType productName country query reportData.id reportData.generatedAt reportVersion pdfStatus previewUrl downloadUrl pageCount fileSize generationTimeMs storageProvider isBookmarked isFavorite downloadCount lastOpenedAt createdAt updatedAt')
          .sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        SavedResearchReport.countDocuments(filter),
      ]);
      return res.json({
        reports: rows.map(reportPayload),
        pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: page * limit < total },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unable to load research reports' });
    }
  }

  static async getResearchReport(req, res) {
    try {
      const row = await SavedResearchReport.findOne({ _id: req.params.reportId, userId: req.user._id, status: 'active' })
        .select('title reportType productName country query reportData.id reportData.generatedAt reportVersion pdfStatus previewUrl downloadUrl pageCount fileSize generationTimeMs storageProvider isBookmarked isFavorite downloadCount lastOpenedAt createdAt updatedAt').lean();
      if (!row) return res.status(404).json({ error: 'Report not found' });
      await SavedResearchReport.updateOne({ _id: row._id }, { $set: { lastOpenedAt: new Date() } });
      return res.json({ report: reportPayload({ ...row, lastOpenedAt: new Date() }) });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unable to open report' });
    }
  }

static async downloadResearchPdf(req, res) {
  try {
    const row = await SavedResearchReport.findOne({ 
      _id: req.params.reportId, 
      userId: req.user._id, 
      status: 'active' 
    }).select('+pdfData +storageKey reportData reportVersion pdfStatus query downloadCount lastOpenedAt createdAt pdfGeneratedAt storageProvider');

    if (!row) {
      return res.status(404).json({ error: 'Report not found' });
    }

    let buffer = null;

    // Step 1: Try filesystem storage
    if (row.storageKey) {
      buffer = await MarketReportStorageService.read(row.storageKey);
      if (buffer?.length) {
        console.log(`PDF loaded from filesystem for report: ${row._id}`);
      }
    }

    // Step 2: Fallback to database pdfData
    if (!buffer?.length && row.pdfData?.length) {
      buffer = row.pdfData;
      console.log(`PDF loaded from database fallback for report: ${row._id}`);
    }

    // Step 3: Regenerate if both failed
    if (!buffer?.length) {
      console.log(`Regenerating PDF for report: ${row._id}`);
      const pdfStartedAt = Date.now();
      
      buffer = await buildMarketInsightPdf(row.reportData, {
        reportId: row.reportData?.id || String(row._id),
        generatedAt: row.reportData?.generatedAt || row.createdAt,
        query: row.query,
        reportVersion: row.reportVersion || '1.0',
      });

      // Save regenerated PDF
      const storedPdf = await MarketReportStorageService.write(row._id, buffer);
      row.pdfStatus = 'ready';
      row.pdfGeneratedAt = new Date();
      row.previewUrl = `/api/market-insights/reports/${row._id}/pdf`;
      row.downloadUrl = `/api/market-insights/reports/${row._id}/pdf?download=1`;
      row.pageCount = Number(buffer.pageCount || 0);
      row.fileSize = storedPdf.fileSize;
      row.storageProvider = storedPdf.storageProvider || 'filesystem';
      row.storageKey = storedPdf.storageKey;
      row.generationTimeMs = Date.now() - pdfStartedAt;
    }

    // Update download count and last opened
    if (req.query.download === '1') {
      row.downloadCount = Number(row.downloadCount || 0) + 1;
    }
    row.lastOpenedAt = new Date();

    try {
      await row.save();
    } catch (saveError) {
      console.error('Failed to save report metadata:', saveError);
      // Continue even if save fails - PDF is still valid
    }

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    return sendMarketInsightPdf(res, buffer, row.reportData, disposition);

  } catch (error) {
    console.error('[Market-Insights-PDF] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'The PDF could not be prepared. Please retry.' });
    }
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

  static async regenerateReport(req, res) {
    try {
      const existing = await SavedResearchReport.findOne({
        _id: req.params.reportId,
        userId: req.user._id,
        status: 'active',
      }).select('query productName country reportType reportData.category').lean();
      if (!existing) return res.status(404).json({ error: 'Report not found' });
      const report = await MarketResearchService.run({
        userId: req.user._id,
        session: req.user,
        query: existing.query,
        productName: existing.productName,
        country: existing.country,
        category: existing.reportData?.category || '',
        mode: existing.reportType,
        force: true,
      }, () => {});
      return res.status(201).json({ report });
    } catch (error) {
      await refundUsage(req.user, 'marketInsights', 1, { ai: true }).catch(() => undefined);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to regenerate report' });
    }
  }

  static async sharedResearchPdf(req, res) {
    try {
      const row = await SavedResearchReport.findOne({ shareToken: req.params.token, shareEnabled: true, status: 'active', pdfStatus: 'ready' }).select('+pdfData +storageKey reportData');
      if (!row) return res.status(404).json({ error: 'Shared report is unavailable' });
      const buffer = await MarketReportStorageService.read(row.storageKey) || row.pdfData;
      if (!buffer?.length) return res.status(404).json({ error: 'Shared report is unavailable' });
      return sendMarketInsightPdf(res, buffer, row.reportData, 'inline');
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
      const row = await SavedResearchReport.findOne({
        _id: reportId,
        userId: req.user._id,
        status: 'active',
      }).select('+storageKey');
      if (!row) return res.status(404).json({ error: 'Report not found' });
      await MarketReportStorageService.remove(row.storageKey);
      await SavedResearchReport.deleteOne({ _id: row._id, userId: req.user._id });
      return res.json({ success: true, reportId });
    } catch (error) {
      console.error('[Market-Insights-DELETE] Error:', error);
      return res.status(500).json({ error: 'Failed to delete report' });
    }
  }
}

export default MarketInsightsController;
