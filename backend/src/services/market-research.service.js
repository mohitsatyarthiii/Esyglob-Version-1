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

// ─── Safe Array Helper ────────────────────────────────────────────
function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return value.documents || value.results || value.items || value.data || [];
  }
  return [];
}

function safeString(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

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

    // ⭐ FIX: Multiple ways to get array from knowledge results
    let knowledgeDocs = [];
    
    // Try format() first
    try {
      const formatted = KnowledgeBaseService.format(knowledgeResults);
      knowledgeDocs = ensureArray(formatted);
    } catch (e) {
      console.warn('KnowledgeBaseService.format() failed, using raw results:', e.message);
    }

    // Fallback: try raw results directly
    if (!knowledgeDocs.length) {
      knowledgeDocs = ensureArray(knowledgeResults);
    }

    // Fallback: try common nested paths
    if (!knowledgeDocs.length && knowledgeResults) {
      knowledgeDocs = ensureArray(knowledgeResults.data || knowledgeResults.results || knowledgeResults.items);
    }

    console.log(`Knowledge base: ${knowledgeDocs.length} documents retrieved`);

    // Build knowledge sources (always array)
    const knowledgeSources = knowledgeDocs.map(doc => ({
      title: doc.title || doc.name || doc.label || 'Expert Analysis',
      type: doc.category || doc.type || 'Market Intelligence',
      category: doc.category || doc.type || 'general',
      relevance: doc.score ? `${Math.round(Number(doc.score) * 100)}%` : 'High',
    }));

    // Build knowledge content string for AI
    const knowledgeContent = knowledgeDocs.slice(0, 8).map((doc, i) => {
      const category = doc.category || doc.type || 'General';
      const content = doc.content || doc.text || doc.description || doc.summary || 
                     (typeof doc === 'string' ? doc : JSON.stringify(doc).slice(0, 500));
      return `[Document ${i + 1}] Category: ${category}\n${safeString(content, 'No content available')}`;
    }).join('\n\n');

    this.step(emit, startedAt, 'Knowledge Engine', 
      `Retrieved ${knowledgeDocs.length} expert documents`, 
      25, 'success', knowledgeDocs.length);

    // ─── PHASE 2: Global Trade Data ──────────────────────────────────
    this.step(emit, startedAt, 'Trade Intelligence', 'Collecting trade statistics, tariffs, and market indicators', 30, 'running');
    
    const globalData = await GlobalTradeResearchService.collect({
      query: researchQuery,
      productName,
      country,
    });

    const connectedSources = (globalData.sources || []).filter(s => s.status === 'connected').length;
    this.step(emit, startedAt, 'Trade Intelligence', 
      `Trade data collected — ${connectedSources} official sources connected`, 
      45, 'success', (globalData.sources || []).length);

    // ─── PHASE 3: AI Analysis ────────────────────────────────────────
    this.step(emit, startedAt, 'AI Analyst', 'Analyzing evidence and generating comprehensive market report', 55, 'running');

    // Build safe trade data strings
    const macroImports = ensureArray(globalData.macroImports).slice(0, 5);
    const macroExports = ensureArray(globalData.macroExports).slice(0, 5);
    const tariffData = ensureArray(globalData.tariffData).slice(0, 5);

    const analysisPrompt = `You are a senior international trade and market research analyst. Generate a comprehensive, professional market research report based on the provided knowledge base documents and trade data.

RESEARCH QUERY: ${researchQuery}
PRODUCT: ${productName || 'N/A'}
COUNTRY: ${country || 'Global'}

KNOWLEDGE BASE DOCUMENTS (Expert Analysis):
${knowledgeContent || 'No specific knowledge base documents found. Use general trade and market knowledge.'}

TRADE DATA:
- HS Code: ${globalData.hsCode || 'Not identified'}
- Target Market: ${globalData.target?.name || 'Global'}
- Import Markets: ${JSON.stringify(macroImports)}
- Export Markets: ${JSON.stringify(macroExports)}
- Tariff Info: ${JSON.stringify(tariffData)}

CRITICAL INSTRUCTIONS:
1. ONLY use information from the provided knowledge base documents and trade data.
2. NEVER mention any platform, marketplace, or company name (like "EsyGlob") in the report.
3. Write in a professional, objective, third-person tone suitable for business executives.
4. Structure the report with clear sections, actionable insights, and data-backed conclusions.
5. If specific data is unavailable, clearly state it rather than fabricating numbers.
6. Focus on: market overview, trade policies, tariffs, demand-supply, pricing trends, opportunities, risks, and strategic recommendations.
7. Include specific numbers, percentages, and statistics WHERE AVAILABLE from the documents.
8. Write minimum 2000 words of substantive analysis.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "title": "Professional report title for ${productName || researchQuery}",
  "executiveSummary": "200-250 word comprehensive executive summary with key findings",
  "marketOverview": "400-500 word detailed market landscape analysis with production, consumption, trade flow data",
  "tradePolicies": "300-400 word on tariffs, regulations, trade agreements, compliance requirements, HS codes",
  "marketDynamics": "300-400 word on supply chain, demand drivers, pricing trends, competitive landscape",
  "opportunities": ["5 specific, actionable market opportunities with brief explanation"],
  "risks": ["5 material risks with mitigation suggestions"],
  "keyStatistics": [{"label": "Stat label", "value": "Stat value with unit", "source": "Source reference"}],
  "recommendations": ["5 strategic, actionable recommendations for market entry/expansion"],
  "outlook": "200-250 word future market outlook with trends and predictions",
  "conclusion": "150-200 word conclusion summarizing key takeaways",
  "references": ["List of sources referenced from knowledge base documents"]
}`;

    let analysis = null;
    try {
      const aiResponse = await AIChatService.callOllama(
        analysisPrompt,
        [],
        'You are a senior market research analyst at a top-tier consulting firm. Your reports are used by Fortune 500 executives for strategic decisions. Be thorough, objective, and data-driven. Never mention any platform or marketplace name.',
        { maxTokens: 4000, temperature: 0.2, timeoutMs: 90000, jsonMode: true }
      );
      
      const rawMessage = aiResponse?.message || '';
      analysis = extractJson(rawMessage);
      
      if (!analysis) {
        console.warn('AI response was not valid JSON, trying to parse...');
        // Try to extract JSON from response
        const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { analysis = JSON.parse(jsonMatch[0]); } catch {}
        }
      }
    } catch (aiError) {
      console.error('AI analysis failed:', aiError.message);
    }

    // ─── FALLBACK: Build analysis from knowledge base ───────────────
    if (!analysis) {
      console.log('Using knowledge base fallback for report generation');
      
      // Get content from first few documents
      const docContents = knowledgeDocs.slice(0, 5).map(d => {
        if (typeof d === 'string') return d;
        return d.content || d.text || d.description || d.summary || '';
      }).filter(Boolean);

      const combinedContent = docContents.join(' ').slice(0, 3000);
      
      const categoryDocs = {};
      knowledgeDocs.forEach(doc => {
        const cat = doc.category || doc.type || 'general';
        if (!categoryDocs[cat]) categoryDocs[cat] = [];
        categoryDocs[cat].push(doc);
      });

      analysis = {
        title: `${productName || researchQuery} — Comprehensive International Trade Analysis`,
        executiveSummary: combinedContent.slice(0, 500) || 
          `This report provides a detailed analysis of ${researchQuery}, covering market conditions, trade policies, regulatory requirements, and strategic opportunities based on available trade intelligence and expert analysis.`,
        marketOverview: (categoryDocs['market-reports']?.[0]?.content || combinedContent).slice(0, 800) ||
          `The global market for ${productName || 'this product'} is shaped by complex trade dynamics, regulatory frameworks, and competitive forces. This analysis examines key market indicators and trade flows to provide actionable intelligence.`,
        tradePolicies: (categoryDocs['trade-policies']?.[0]?.content || categoryDocs['policies']?.[0]?.content || combinedContent).slice(0, 600) ||
          'Trade policies, including tariff structures, non-tariff barriers, and regulatory requirements, significantly impact market access conditions. A thorough understanding of applicable trade agreements and compliance obligations is essential.',
        marketDynamics: (categoryDocs['industries']?.[0]?.content || combinedContent).slice(0, 600) ||
          'Supply-demand dynamics, pricing trends, and competitive forces shape market opportunities. Analysis of production capacity, consumption patterns, and trade flows reveals strategic entry points.',
        opportunities: [
          'Explore preferential trade agreements to reduce tariff burdens',
          'Target market segments with supply gaps or unmet demand',
          'Leverage quality certifications for premium market positioning',
          'Develop strategic partnerships with established distributors',
          'Invest in compliance infrastructure to overcome regulatory barriers',
        ],
        risks: [
          'Regulatory changes may alter market access conditions — Monitor policy developments closely',
          'Currency fluctuations impact pricing competitiveness — Use hedging strategies',
          'Supply chain disruptions affect delivery reliability — Diversify logistics partners',
          'Competitive pressure from established players — Differentiate through quality or service',
          'Compliance costs may erode margins — Factor into pricing models',
        ],
        keyStatistics: macroImports.slice(0, 4).map(row => ({
          label: `${row.country || 'Market'} Imports`,
          value: fmtUsd(row.valueUsd),
          source: 'World Bank / UN Comtrade',
        })),
        recommendations: [
          'Conduct detailed market entry feasibility study',
          'Establish relationships with local trade partners',
          'Ensure full regulatory compliance before market entry',
          'Develop competitive pricing strategy based on landed costs',
          'Monitor trade policy developments and adapt strategy accordingly',
        ],
        outlook: 'The market outlook reflects evolving trade patterns, regulatory developments, and changing demand dynamics. Stakeholders should maintain flexibility in their strategic approach while building sustainable competitive advantages.',
        conclusion: 'This analysis provides a foundation for strategic decision-making. Success requires ongoing monitoring of market conditions, regulatory changes, and competitive dynamics. Detailed primary research is recommended before significant commercial commitments.',
        references: knowledgeSources.slice(0, 10).map(s => s.title),
      };
    }

    // Ensure all required fields exist
    analysis.opportunities = ensureArray(analysis.opportunities);
    analysis.risks = ensureArray(analysis.risks);
    analysis.keyStatistics = ensureArray(analysis.keyStatistics);
    analysis.recommendations = ensureArray(analysis.recommendations);
    analysis.references = ensureArray(analysis.references);

    this.step(emit, startedAt, 'AI Analyst', 'Comprehensive analysis completed with actionable insights', 75, 'success', 
      knowledgeDocs.length + (globalData.sources || []).length);

    // ─── PHASE 4: Build Report Structure ────────────────────────────
    this.step(emit, startedAt, 'Report Builder', 'Structuring professional research report', 82, 'running');

    const reportSections = [
      { type: 'executive-summary', title: 'Executive Summary', content: analysis.executiveSummary },
      { type: 'market-overview', title: 'Market Landscape & Overview', content: analysis.marketOverview },
      { type: 'trade-policies', title: 'Trade Policies, Tariffs & Regulatory Framework', content: analysis.tradePolicies },
      { type: 'market-dynamics', title: 'Market Dynamics: Supply, Demand & Pricing', content: analysis.marketDynamics },
      { type: 'statistics', title: 'Key Market Statistics & Indicators', statistics: analysis.keyStatistics },
      { type: 'opportunities', title: 'Market Opportunities & Growth Areas', points: analysis.opportunities },
      { type: 'risks', title: 'Risk Assessment & Mitigation Strategies', points: analysis.risks },
      { type: 'recommendations', title: 'Strategic Recommendations', points: analysis.recommendations },
      { type: 'outlook', title: 'Future Market Outlook', content: analysis.outlook },
      { type: 'conclusion', title: 'Conclusion & Next Steps', content: analysis.conclusion },
    ];

    // Trade data tables
    const tradeTables = [];
    if (macroImports.length) {
      tradeTables.push({
        title: 'Top Import Markets — Macro Trade Context',
        columns: ['Rank', 'Country', 'Import Value', 'Year'],
        rows: macroImports.map((row, i) => [i + 1, safeString(row.country), fmtUsd(row.valueUsd), safeString(row.year || '2024')]),
      });
    }
    if (macroExports.length) {
      tradeTables.push({
        title: 'Top Export Markets — Macro Trade Context',
        columns: ['Rank', 'Country', 'Export Value', 'Year'],
        rows: macroExports.map((row, i) => [i + 1, safeString(row.country), fmtUsd(row.valueUsd), safeString(row.year || '2024')]),
      });
    }
    if (tariffData.length) {
      tradeTables.push({
        title: 'Applied Tariff Rates by Market',
        columns: ['Country', 'Product', 'Tariff Rate', 'Type'],
        rows: tariffData.map(row => [
          safeString(row.country), 
          safeString(row.product || productName), 
          safeString(row.rate), 
          safeString(row.type || 'MFN')
        ]),
      });
    }

    // Build final report object
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
      references: analysis.references || knowledgeSources.map(s => s.title),
      sources: [
        ...knowledgeSources.map(s => ({ name: s.title, type: s.type || 'Expert Analysis', category: s.category })),
        ...(globalData.sources || []),
      ],
      sourceCount: knowledgeSources.length + (globalData.sources || []).length,
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
        console.log(`PDF saved to filesystem: ${saved._id}`);
      } catch (storageError) {
        console.warn('Filesystem storage unavailable, using MongoDB fallback:', storageError.message);
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

      console.log(`Report saved: ${saved._id}, pdfStatus: ${saved.pdfStatus}`);

    } catch (pdfError) {
      console.error('PDF generation failed:', pdfError.message);
      if (saved.storageKey) await MarketReportStorageService.remove(saved.storageKey).catch(() => {});
      saved.pdfStatus = 'failed';
      saved.pdfError = String(pdfError.message).slice(0, 500);
      saved.reportData = report;
      await saved.save().catch(() => {});
      throw Object.assign(
        new Error('Report analysis completed but PDF generation failed. Please retry.'),
        { cause: pdfError }
      );
    }

    const completedReport = reportMetadata(report, saved._id, saved);
    cache.set(cacheKey, { createdAt: Date.now(), report: completedReport });

    this.step(emit, startedAt, 'Complete', 'Professional market research report ready', 100, 'success', report.sourceCount);
    this.emit(emit, startedAt, { type: 'report', report: completedReport, progress: 100 });

    console.log(`Market research completed: ${saved._id}, elapsed: ${Date.now() - startedAt}ms`);
    return completedReport;
  }
}

export default MarketResearchService;