import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import GlobalTradeResearchService from './global-trade-research.service.js';
import MarketInsightsRepository from '../repositories/market-insights.repository.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { buildMarketInsightPdf } from '../lib/market-insight-pdf.js';
import KnowledgeBaseService from './knowledge-base.service.js';
import MarketReportStorageService from './market-report-storage.service.js';

const cache = new Map();
const CACHE_TTL = Number(process.env.MARKET_RESEARCH_CACHE_TTL_MS || 15 * 60 * 1000);
const REPORT_REUSE_TTL = Number(process.env.MARKET_RESEARCH_REUSE_TTL_MS || 24 * 60 * 60 * 1000);
const REPORT_VERSION = '3.0';

// ─── Helpers ───────────────────────────────────────────────────────
function extractJson(text) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function fmtUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'N/A';
  if (Math.abs(amount) >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  if (Math.abs(amount) >= 1e3) return `$${(amount / 1e3).toFixed(1)}K`;
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function fmtNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'N/A';
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return Math.round(num).toLocaleString('en-US');
}

function reportMetadata(report, id, persisted = {}) {
  const reportId = String(id);
  return {
    savedReportId: reportId,
    reportId: report.id || reportId,
    title: report.title,
    query: report.query,
    reportType: report.reportType,
    productName: report.productName || '',
    country: report.country || '',
    reportVersion: report.reportVersion || REPORT_VERSION,
    status: 'ready',
    pdfStatus: persisted.pdfStatus || 'ready',
    previewUrl: persisted.previewUrl || `/api/market-insights/reports/${reportId}/pdf`,
    pdfUrl: `/api/market-insights/reports/${reportId}/pdf`,
    downloadUrl: persisted.downloadUrl || `/api/market-insights/reports/${reportId}/pdf?download=1`,
    pages: Number(persisted.pageCount || 0),
    fileSize: Number(persisted.fileSize || 0),
    generationTimeMs: Number(persisted.generationTimeMs || report.elapsedMs || 0),
    generatedAt: report.generatedAt || new Date().toISOString(),
    createdAt: persisted.createdAt || new Date().toISOString(),
    description: report.executiveSummary || '',
  };
}

class MarketResearchService {
  static emit(emit, startedAt, event) {
    emit({ elapsedMs: Date.now() - startedAt, timestamp: new Date().toISOString(), ...event });
  }

  static step(emit, startedAt, agent, operation, progress, status = 'success', sourceCount = 0) {
    this.emit(emit, startedAt, { type: 'step', agent, operation, progress, status, sourceCount });
  }

  static async run({ userId, session, query, productName = '', country = '', category = '', mode = 'product_rd', force = false }, emit) {
    const startedAt = Date.now();
    const researchQuery = String(query || [productName, category, country].filter(Boolean).join(' ')).trim();
    
    if (researchQuery.length < 3) {
      throw Object.assign(new Error('Please provide a detailed research query'), { statusCode: 400 });
    }

    // Cache check
    const queryHash = crypto.createHash('sha256').update(researchQuery.toLowerCase() + REPORT_VERSION).digest('hex');
    const cacheKey = `${userId}:${queryHash}`;

    if (!force) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
        this.emit(emit, startedAt, { type: 'research_started', researchId: cached.report.reportId, cached: true, progress: 5 });
        this.emit(emit, startedAt, { type: 'report', report: cached.report, progress: 100 });
        return cached.report;
      }

      const reusable = await SavedResearchReport.findOne({
        userId, queryHash, status: 'active', pdfStatus: 'ready',
        createdAt: { $gte: new Date(Date.now() - REPORT_REUSE_TTL) },
      }).select('reportData reportVersion previewUrl pageCount fileSize generationTimeMs createdAt pdfStatus storageKey').sort({ createdAt: -1 }).lean();

      if (reusable?.reportData) {
        const report = reportMetadata(reusable.reportData, reusable._id, reusable);
        this.emit(emit, startedAt, { type: 'research_started', researchId: report.reportId, cached: true, progress: 5 });
        this.emit(emit, startedAt, { type: 'report', report, cached: true, progress: 100 });
        cache.set(cacheKey, { createdAt: Date.now(), report });
        return report;
      }
    }

    const researchId = `research-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    this.emit(emit, startedAt, { type: 'research_started', researchId, progress: 1 });

    // ─── PHASE 1: Knowledge Base Retrieval ───────────────────────────
    this.step(emit, startedAt, 'Knowledge Engine', 'Searching expert knowledge base for relevant market intelligence', 8, 'running');
    
    const knowledgeResults = await KnowledgeBaseService.retrieve({
      query: researchQuery,
      rewrittenQuery: researchQuery,
      role: 'buyer',
      intent: 'market_research',
      limit: 15,
    });

    const knowledgeDocs = KnowledgeBaseService.format(knowledgeResults);
    const knowledgeSources = knowledgeResults.map(doc => ({
      title: doc.title || 'Expert Analysis',
      type: doc.category || 'Market Intelligence',
      category: doc.category,
      relevance: doc.score ? `${Math.round(doc.score * 100)}%` : 'High',
    }));

    this.step(emit, startedAt, 'Knowledge Engine', `Retrieved ${knowledgeDocs.length} expert documents across ${[...new Set(knowledgeResults.map(d => d.category))].length} categories`, 25, 'success', knowledgeDocs.length);

    // ─── PHASE 2: Global Trade Data ──────────────────────────────────
    this.step(emit, startedAt, 'Trade Intelligence', 'Collecting trade statistics, tariffs, and market indicators', 30, 'running');
    
    const globalData = await GlobalTradeResearchService.collect({
      query: researchQuery,
      productName,
      country,
    });

    this.step(emit, startedAt, 'Trade Intelligence', `Trade data collected — ${globalData.sources.filter(s => s.status === 'connected').length} official sources connected`, 45, 'success', globalData.sources.length);

    // ─── PHASE 3: AI Analysis ────────────────────────────────────────
    this.step(emit, startedAt, 'AI Analyst', 'Analyzing evidence and generating comprehensive market report', 55, 'running');

    const analysisPrompt = `You are a senior international trade and market research analyst. Generate a comprehensive, professional market research report based SOLELY on the provided knowledge base documents and trade data.

RESEARCH QUERY: ${researchQuery}
PRODUCT: ${productName || 'N/A'}
COUNTRY: ${country || 'Global'}

KNOWLEDGE BASE DOCUMENTS (Expert Analysis):
${knowledgeDocs.slice(0, 8).map((doc, i) => `[Document ${i + 1}] Category: ${doc.category || 'General'}\n${doc.content || doc.text || ''}`).join('\n\n')}

TRADE DATA:
- HS Code: ${globalData.hsCode || 'Not identified'}
- Target Market: ${globalData.target?.name || 'Global'}
- Import Markets: ${JSON.stringify(globalData.macroImports?.slice(0, 5) || [])}
- Export Markets: ${JSON.stringify(globalData.macroExports?.slice(0, 5) || [])}

CRITICAL INSTRUCTIONS:
1. ONLY use information from the provided knowledge base documents and trade data.
2. NEVER mention any platform, marketplace, or "EsyGlob" in the report.
3. Write in a professional, objective, third-person tone suitable for business executives.
4. Structure the report with clear sections, actionable insights, and data-backed conclusions.
5. If specific data is unavailable, clearly state it rather than fabricating.
6. Focus on: market overview, trade policies, tariffs, demand-supply, pricing trends, opportunities, risks, and strategic recommendations.
7. Include specific numbers, percentages, and statistics WHERE AVAILABLE from the documents.
8. Write minimum 2500 words of substantive analysis.

Return ONLY valid JSON:
{
  "title": "Professional report title",
  "executiveSummary": "200-250 word comprehensive executive summary",
  "marketOverview": "400-500 word market landscape analysis",
  "tradePolicies": "300-400 word on tariffs, regulations, trade agreements, compliance",
  "marketDynamics": "300-400 word on supply, demand, pricing trends, competitive landscape",
  "opportunities": ["5 specific, actionable market opportunities"],
  "risks": ["5 material risks with mitigation suggestions"],
  "keyStatistics": [{"label": "Stat label", "value": "Stat value", "source": "Source reference"}],
  "recommendations": ["5 strategic, actionable recommendations"],
  "outlook": "200-250 word future market outlook",
  "conclusion": "150-200 word conclusion",
  "references": ["List of sources referenced from knowledge base"]
}`;

    let analysis = null;
    try {
      const aiResponse = await AIChatService.callOllama(
        analysisPrompt,
        [],
        'You are a senior market research analyst at a top-tier consulting firm. Your reports are used by Fortune 500 executives for strategic decisions. Be thorough, objective, and data-driven.',
        { maxTokens: 4000, temperature: 0.2, timeoutMs: 90000, jsonMode: true }
      );
      analysis = extractJson(aiResponse.message);
    } catch (aiError) {
      console.error('AI analysis failed:', aiError.message);
    }

    // Fallback analysis from knowledge base
    if (!analysis) {
      analysis = {
        title: `${productName || researchQuery} — Comprehensive Market Analysis`,
        executiveSummary: knowledgeDocs.slice(0, 3).map(d => d.content?.slice(0, 300) || '').join(' ').slice(0, 500) || 'Detailed market analysis based on available trade intelligence.',
        marketOverview: knowledgeDocs.find(d => d.category === 'market-reports')?.content?.slice(0, 800) || 'Market analysis based on available data.',
        tradePolicies: knowledgeDocs.find(d => d.category === 'trade-policies')?.content?.slice(0, 600) || 'Trade policy analysis requires current regulatory review.',
        marketDynamics: knowledgeDocs.find(d => d.category === 'industries')?.content?.slice(0, 600) || 'Market dynamics assessment based on industry analysis.',
        opportunities: ['Market expansion through targeted trade partnerships', 'Leverage preferential trade agreements', 'Optimize supply chain for cost efficiency', 'Explore emerging market segments', 'Invest in quality certifications for market access'],
        risks: ['Regulatory changes in target markets', 'Currency fluctuation exposure', 'Supply chain disruptions', 'Competitive pressure from established players', 'Compliance and documentation requirements'],
        keyStatistics: globalData.macroImports?.slice(0, 4).map(row => ({ label: `${row.country} Imports`, value: fmtUsd(row.valueUsd), source: 'World Bank' })) || [],
        recommendations: ['Conduct detailed market entry analysis', 'Establish local partnerships', 'Ensure regulatory compliance', 'Develop competitive pricing strategy', 'Monitor policy changes regularly'],
        outlook: 'Market outlook remains cautiously optimistic pending further regulatory clarity and economic indicators.',
        conclusion: 'This report provides a foundational analysis. Detailed primary research is recommended before making significant commercial decisions.',
        references: knowledgeSources.map(s => s.title),
      };
    }

    this.step(emit, startedAt, 'AI Analyst', 'Comprehensive analysis completed with actionable insights', 75, 'success', knowledgeDocs.length + globalData.sources.length);

    // ─── PHASE 4: Build Report Structure ────────────────────────────
    this.step(emit, startedAt, 'Report Builder', 'Structuring professional research report', 82, 'running');

    const reportSections = [
      { type: 'executive-summary', title: 'Executive Summary', content: analysis.executiveSummary },
      { type: 'market-overview', title: 'Market Landscape & Overview', content: analysis.marketOverview },
      { type: 'trade-policies', title: 'Trade Policies, Tariffs & Regulatory Framework', content: analysis.tradePolicies },
      { type: 'market-dynamics', title: 'Market Dynamics: Supply, Demand & Pricing', content: analysis.marketDynamics },
      { type: 'statistics', title: 'Key Market Statistics & Indicators', statistics: analysis.keyStatistics || [] },
      { type: 'opportunities', title: 'Market Opportunities & Growth Areas', points: analysis.opportunities || [] },
      { type: 'risks', title: 'Risk Assessment & Mitigation Strategies', points: analysis.risks || [] },
      { type: 'recommendations', title: 'Strategic Recommendations', points: analysis.recommendations || [] },
      { type: 'outlook', title: 'Future Market Outlook', content: analysis.outlook },
      { type: 'conclusion', title: 'Conclusion & Next Steps', content: analysis.conclusion },
    ];

    // Trade data tables
    const tradeTables = [];
    if (globalData.macroImports?.length) {
      tradeTables.push({
        title: 'Top Import Markets — Macro Trade Context',
        columns: ['Rank', 'Country', 'Import Value', 'Year'],
        rows: globalData.macroImports.slice(0, 5).map((row, i) => [i + 1, row.country, fmtUsd(row.valueUsd), row.year || '2024']),
      });
    }
    if (globalData.macroExports?.length) {
      tradeTables.push({
        title: 'Top Export Markets — Macro Trade Context',
        columns: ['Rank', 'Country', 'Export Value', 'Year'],
        rows: globalData.macroExports.slice(0, 5).map((row, i) => [i + 1, row.country, fmtUsd(row.valueUsd), row.year || '2024']),
      });
    }
    if (globalData.tariffData?.length) {
      tradeTables.push({
        title: 'Applied Tariff Rates by Market',
        columns: ['Country', 'Product', 'Tariff Rate', 'Type'],
        rows: globalData.tariffData.slice(0, 8).map(row => [row.country || 'N/A', row.product || productName, row.rate || 'N/A', row.type || 'MFN']),
      });
    }

    // Build final report
    const report = {
      id: researchId,
      reportType: mode,
      query: researchQuery,
      title: analysis.title || `${productName || 'Market'} — International Trade Analysis`,
      executiveSummary: analysis.executiveSummary,
      productName: productName || researchQuery,
      country,
      category,
      reportVersion: REPORT_VERSION,
      sections: reportSections,
      tables: tradeTables,
      charts: buildCharts(globalData),
      references: analysis.references || knowledgeSources.map(s => s.title),
      keyFindings: analysis.opportunities?.slice(0, 3) || [],
      sources: [
        ...knowledgeSources.map(s => ({ name: s.title, type: s.type || 'Expert Analysis', category: s.category })),
        ...globalData.sources,
      ],
      sourceCount: knowledgeSources.length + globalData.sources.length,
      generatedBy: 'Market Intelligence Research',
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
    };

    // ─── PHASE 5: Generate & Save PDF ──────────────────────────────
    this.step(emit, startedAt, 'PDF Engine', 'Generating professional research report PDF', 90, 'running');

    const saved = new SavedResearchReport({
      userId,
      roleContext: 'buyer',
      reportType: mode,
      title: report.title,
      productName,
      country,
      query: researchQuery,
      queryHash,
      reportVersion: REPORT_VERSION,
      reportData: report,
      pdfStatus: 'pending',
      lastOpenedAt: new Date(),
    });

    report.savedReportId = String(saved._id);

    try {
      const pdf = await buildMarketInsightPdf(report, {
        reportId: report.id,
        generatedAt: report.generatedAt,
        query: researchQuery,
        reportVersion: REPORT_VERSION,
      });

      let storedPdf;
      try {
        storedPdf = await MarketReportStorageService.write(saved._id, pdf);
      } catch (storageError) {
        console.warn('Filesystem storage unavailable, using MongoDB:', storageError.message);
        storedPdf = { storageKey: '', storageProvider: 'mongodb', fileSize: pdf.length || Buffer.byteLength(pdf) };
        saved.pdfData = pdf;
      }

      saved.pdfStatus = 'ready';
      saved.pdfGeneratedAt = new Date();
      saved.previewUrl = `/api/market-insights/reports/${saved._id}/pdf`;
      saved.downloadUrl = `/api/market-insights/reports/${saved._id}/pdf?download=1`;
      saved.pageCount = Number(pdf.pageCount || 0);
      saved.fileSize = storedPdf.fileSize;
      saved.storageProvider = storedPdf.storageProvider || 'mongodb';
      saved.storageKey = storedPdf.storageKey || '';
      saved.generationTimeMs = Date.now() - startedAt;
      saved.reportData = report;
      await saved.save();

    } catch (pdfError) {
      console.error('PDF generation failed:', pdfError.message);
      if (saved.storageKey) await MarketReportStorageService.remove(saved.storageKey).catch(() => {});
      saved.pdfStatus = 'failed';
      saved.pdfError = String(pdfError.message).slice(0, 500);
      saved.reportData = report;
      await saved.save().catch(() => {});
      throw Object.assign(new Error('Report analysis completed but PDF generation failed. Please retry.'), { cause: pdfError });
    }

    const completedReport = reportMetadata(report, saved._id, saved);
    cache.set(cacheKey, { createdAt: Date.now(), report: completedReport });

    this.step(emit, startedAt, 'Complete', 'Professional market research report ready', 100, 'success', report.sourceCount);
    this.emit(emit, startedAt, { type: 'report', report: completedReport, progress: 100 });

    return completedReport;
  }
}

// ─── Chart Builder ─────────────────────────────────────────────────
function buildCharts(globalData) {
  const charts = [];
  
  if (globalData.macroImports?.length >= 3) {
    charts.push({
      type: 'bar',
      title: 'Import Market Size Comparison',
      data: globalData.macroImports.slice(0, 6).map(row => ({
        label: row.country,
        value: row.valueUsd,
        displayValue: fmtUsd(row.valueUsd),
      })),
    });
  }
  
  if (globalData.macroExports?.length >= 3) {
    charts.push({
      type: 'bar',
      title: 'Export Market Comparison',
      data: globalData.macroExports.slice(0, 6).map(row => ({
        label: row.country,
        value: row.valueUsd,
        displayValue: fmtUsd(row.valueUsd),
      })),
    });
  }

  if (globalData.tariffData?.length >= 3) {
    charts.push({
      type: 'bar',
      title: 'Tariff Rate Comparison by Market',
      data: globalData.tariffData.slice(0, 8).map(row => ({
        label: row.country || 'N/A',
        value: parseFloat(row.rate) || 0,
        displayValue: row.rate || 'N/A',
      })),
    });
  }

  return charts;
}

export default MarketResearchService;