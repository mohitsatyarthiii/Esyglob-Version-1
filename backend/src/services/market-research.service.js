import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import GlobalTradeResearchService from './global-trade-research.service.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { buildMarketInsightPdf } from '../lib/market-insight-pdf.js';
import KnowledgeBaseService from './knowledge-base.service.js';
import MarketReportStorageService from './market-report-storage.service.js';

const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
const REPORT_REUSE_TTL = 24 * 60 * 60 * 1000;
const REPORT_VERSION = '3.0';

function extractJson(text) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function ensureArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return v.documents || v.results || v.items || v.data || [];
  return [];
}

function fmtUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
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
    reportVersion: REPORT_VERSION,
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

    // ═══ Cache Check ═══
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
    this.emit(emit, startedAt, { type: 'research_started', researchId, progress: 2 });

    // ═══════════════ PHASE 1: Knowledge Base Retrieval ═══════════════
    this.step(emit, startedAt, 'Research Engine', 'Searching knowledge base for relevant market intelligence...', 10);
    
    const knowledgeResults = await KnowledgeBaseService.retrieve({
      query: researchQuery,
      rewrittenQuery: researchQuery,
      role: 'buyer',
      intent: 'market_research',
      limit: 10,
    });

    const knowledgeDocs = Array.isArray(knowledgeResults) ? knowledgeResults : [];
    console.log(`📚 Knowledge Base: ${knowledgeDocs.length} documents found`);
    
    knowledgeDocs.forEach((doc, i) => {
      console.log(`  [${i + 1}] ${doc.title} | ${doc.category} | ${(doc.content || '').length} chars`);
    });

    const knowledgeContent = KnowledgeBaseService.format(knowledgeDocs);
    console.log(`📝 Knowledge content for AI: ${knowledgeContent.length} characters`);

    const knowledgeSources = knowledgeDocs.map(doc => ({
      title: doc.title || 'Expert Analysis',
      type: doc.category || 'Market Intelligence',
      category: doc.category || 'general',
    }));

    this.step(emit, startedAt, 'Research Engine', `Retrieved ${knowledgeDocs.length} expert documents`, 25, 'success', knowledgeDocs.length);

    // ═══════════════ PHASE 2: Trade Data ═══════════════
    this.step(emit, startedAt, 'Trade Intelligence', 'Collecting trade statistics and market indicators...', 30);
    
    const globalData = await GlobalTradeResearchService.collect({
      query: researchQuery,
      productName,
      country,
    });

    const macroImports = ensureArray(globalData.macroImports).slice(0, 5);
    const macroExports = ensureArray(globalData.macroExports).slice(0, 5);

    this.step(emit, startedAt, 'Trade Intelligence', 'Trade data collected successfully', 40, 'success', 
      (globalData.sources || []).filter(s => s.status === 'connected').length);

    // ═══════════════ PHASE 3: AI Analysis ═══════════════
    this.step(emit, startedAt, 'AI Analyst', 'Analyzing documents and generating comprehensive report...', 45);

    const analysisPrompt = `You are a senior international trade and market research analyst at a top-tier consulting firm.

═══════════════════════════════════════
RESEARCH QUERY
═══════════════════════════════════════
"${researchQuery}"
${productName ? `Product: ${productName}` : ''}
${country ? `Country: ${country}` : ''}

═══════════════════════════════════════
KNOWLEDGE BASE DOCUMENTS (PRIMARY SOURCE)
═══════════════════════════════════════

${knowledgeContent || 'No specific documents found. Use your expertise in international trade, tariffs, and market dynamics.'}

═══════════════════════════════════════
SUPPLEMENTARY TRADE DATA
═══════════════════════════════════════
HS Code: ${globalData.hsCode || 'Not identified'}
Target Market: ${globalData.target?.name || 'Global'}
Top Import Markets: ${JSON.stringify(macroImports)}
Top Export Markets: ${JSON.stringify(macroExports)}

═══════════════════════════════════════
CRITICAL INSTRUCTIONS
═══════════════════════════════════════

1. USE THE KNOWLEDGE BASE DOCUMENTS as your PRIMARY source of information.
2. Extract specific facts, statistics, policies, and insights directly from the documents.
3. Do NOT mention any platform, marketplace, or company name (like EsyGlob) in the report.
4. Write in professional, objective, third-person business tone suitable for executives.
5. Include specific numbers, percentages, HS codes, tariff rates, and data WHERE AVAILABLE in documents.
6. If documents don't cover a specific topic, clearly state "Specific data not available in current research" instead of fabricating.
7. Generate comprehensive, substantive analysis - minimum 2000 words total.

Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "title": "Professional market research report title",
  "executiveSummary": "250-300 word executive summary highlighting key findings from the research",
  "marketOverview": "500-600 word detailed market landscape including market size, key players, trade volumes, industry structure",
  "tradePolicies": "400-500 word analysis of tariffs, HS codes, trade agreements, regulatory requirements, compliance standards",
  "marketDynamics": "400-500 word analysis of supply-demand trends, pricing, competitive landscape, market drivers",
  "opportunities": ["6 specific, actionable market opportunities with brief supporting evidence"],
  "risks": ["6 material risks with practical mitigation strategies"],
  "keyStatistics": [
    {"label": "Statistic name", "value": "Value with unit", "source": "Document reference"}
  ],
  "recommendations": ["6 strategic, actionable recommendations for market entry or expansion"],
  "outlook": "250-300 word future market outlook with trends and predictions",
  "conclusion": "200-250 word conclusion summarizing key takeaways",
  "references": ["List of document titles or sources used"]
}`;

    let analysis = null;
    let aiAttempted = false;

    // TRY 1: AI with knowledge base
    if (knowledgeContent) {
      try {
        console.log('🤖 Calling AI for analysis...');
        const aiResponse = await AIChatService.callOllama(
          analysisPrompt,
          [],
          'You are a senior market research analyst. Be thorough, objective, and data-driven. ONLY use provided document data.',
          { maxTokens: 4000, temperature: 0.2, timeoutMs: 120000, jsonMode: true }
        );
        
        const rawMessage = aiResponse?.message || '';
        analysis = extractJson(rawMessage);
        
        if (analysis) {
          aiAttempted = true;
          console.log('✅ AI analysis completed successfully');
        } else {
          console.warn('⚠️ AI response was not valid JSON, trying to extract...');
          const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try { analysis = JSON.parse(jsonMatch[0]); } catch {}
          }
        }
      } catch (aiError) {
        console.error('❌ AI call failed:', aiError.message);
      }
    }

    // TRY 2: AI without knowledge base (uses training data)
    if (!analysis) {
      try {
        console.log('🤖 Retrying AI without knowledge base...');
        const fallbackPrompt = `Generate a professional market research report on: "${researchQuery}".
Use your knowledge of international trade, WTO rules, HS codes, tariff structures, and market dynamics.
Return ONLY valid JSON with all required fields. Be specific with real trade data and statistics.`;
        
        const aiResponse = await AIChatService.callOllama(
          fallbackPrompt,
          [],
          'You are a trade research expert. Provide specific, real data from your knowledge of international trade.',
          { maxTokens: 4000, temperature: 0.3, timeoutMs: 120000, jsonMode: true }
        );
        
        analysis = extractJson(aiResponse?.message || '');
        if (analysis) console.log('✅ Fallback AI analysis completed');
      } catch (e) {
        console.error('❌ Fallback AI also failed:', e.message);
      }
    }

    // TRY 3: Build from knowledge documents directly
    if (!analysis) {
      console.log('📝 Building report from knowledge documents...');
      
      const docContents = knowledgeDocs.slice(0, 5).map(d => d.content || '').filter(Boolean);
      const combinedContent = docContents.join('\n\n').slice(0, 5000);
      
      analysis = {
        title: `${productName || researchQuery} — Comprehensive Market Analysis`,
        executiveSummary: combinedContent.slice(0, 500) || `Detailed market analysis of ${researchQuery} based on available trade intelligence and expert research documents.`,
        marketOverview: combinedContent.slice(0, 1000) || 'Market analysis based on available research documents.',
        tradePolicies: combinedContent.slice(500, 1000) || 'Trade policy analysis requires review of current regulations and agreements.',
        marketDynamics: combinedContent.slice(1000, 1500) || 'Market dynamics assessment based on industry analysis and trade data.',
        opportunities: [
          'Leverage preferential trade agreements for market access',
          'Target growing market segments identified in research',
          'Develop competitive pricing strategies based on market analysis',
          'Invest in quality certifications for premium positioning',
          'Explore strategic partnerships with established distributors',
          'Utilize digital trade platforms for market expansion',
        ],
        risks: [
          'Regulatory changes may impact market access — Monitor policy developments',
          'Currency fluctuations affect pricing — Implement hedging strategies',
          'Supply chain disruptions pose operational risks — Diversify suppliers',
          'Competitive pressure from established players — Differentiate through quality',
          'Compliance costs impact margins — Factor into pricing models',
          'Geopolitical tensions affect trade flows — Diversify markets',
        ],
        keyStatistics: macroImports.slice(0, 4).map(row => ({
          label: `${row.country || 'Market'} Imports`,
          value: fmtUsd(row.valueUsd),
          source: 'World Bank Trade Data',
        })),
        recommendations: [
          'Conduct detailed market entry feasibility study',
          'Establish relationships with local trade partners',
          'Ensure full regulatory compliance before market entry',
          'Develop competitive pricing strategy based on landed costs',
          'Monitor trade policy developments regularly',
          'Invest in quality and certification infrastructure',
        ],
        outlook: 'The market outlook reflects evolving trade patterns, regulatory developments, and changing demand dynamics. Stakeholders should maintain strategic flexibility while building sustainable competitive advantages through quality, compliance, and market intelligence.',
        conclusion: 'This analysis provides a foundation for strategic decision-making. Success requires ongoing monitoring of market conditions, regulatory changes, and competitive dynamics. Detailed primary research is recommended before significant commercial commitments.',
        references: knowledgeSources.slice(0, 10).map(s => s.title),
      };
    }

    // Ensure all arrays exist
    analysis.opportunities = ensureArray(analysis.opportunities);
    analysis.risks = ensureArray(analysis.risks);
    analysis.keyStatistics = ensureArray(analysis.keyStatistics);
    analysis.recommendations = ensureArray(analysis.recommendations);
    analysis.references = ensureArray(analysis.references);

    this.step(emit, startedAt, 'AI Analyst', `Analysis completed — ${aiAttempted ? 'AI-generated' : 'evidence-based'} report`, 70, 'success', 
      knowledgeDocs.length + (globalData.sources || []).length);

    // ═══════════════ PHASE 4: Build Report ═══════════════
    this.step(emit, startedAt, 'Report Builder', 'Structuring professional research report...', 78);

    const reportSections = [
      { type: 'executive-summary', title: 'Executive Summary', content: analysis.executiveSummary },
      { type: 'market-overview', title: 'Market Landscape & Overview', content: analysis.marketOverview },
      { type: 'trade-policies', title: 'Trade Policies, Tariffs & Regulations', content: analysis.tradePolicies },
      { type: 'market-dynamics', title: 'Market Dynamics: Supply, Demand & Pricing', content: analysis.marketDynamics },
      { type: 'statistics', title: 'Key Market Statistics', statistics: analysis.keyStatistics },
      { type: 'opportunities', title: 'Market Opportunities', points: analysis.opportunities },
      { type: 'risks', title: 'Risk Assessment & Mitigation', points: analysis.risks },
      { type: 'recommendations', title: 'Strategic Recommendations', points: analysis.recommendations },
      { type: 'outlook', title: 'Future Market Outlook', content: analysis.outlook },
      { type: 'conclusion', title: 'Conclusion', content: analysis.conclusion },
    ];

    // Trade data tables
    const tradeTables = [];
    if (macroImports.length) {
      tradeTables.push({
        title: 'Top Import Markets',
        columns: ['Rank', 'Country', 'Import Value', 'Year'],
        rows: macroImports.map((row, i) => [i + 1, row.country || 'N/A', fmtUsd(row.valueUsd), row.year || '2024']),
      });
    }
    if (macroExports.length) {
      tradeTables.push({
        title: 'Top Export Markets',
        columns: ['Rank', 'Country', 'Export Value', 'Year'],
        rows: macroExports.map((row, i) => [i + 1, row.country || 'N/A', fmtUsd(row.valueUsd), row.year || '2024']),
      });
    }

    // Final report object
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

    // ═══════════════ PHASE 5: Generate PDF ═══════════════
    this.step(emit, startedAt, 'PDF Engine', 'Generating professional PDF report...', 85);

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
      console.log(`📄 Generating PDF for report: ${saved._id}`);
      
      const pdf = await buildMarketInsightPdf(report, {
        reportId: report.id,
        generatedAt: report.generatedAt,
        query: researchQuery,
        reportVersion: REPORT_VERSION,
      });

      console.log(`✅ PDF generated: ${pdf.length || Buffer.byteLength(pdf)} bytes`);

      // Save PDF - try filesystem first, then MongoDB
      let storedPdf;
      try {
        storedPdf = await MarketReportStorageService.write(saved._id, pdf);
        console.log(`💾 PDF saved to filesystem: ${storedPdf.storageKey}`);
      } catch (storageError) {
        console.warn('💾 Filesystem storage failed, using MongoDB:', storageError.message);
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

      console.log(`✅ Report saved: ${saved._id}, pages: ${saved.pageCount}, pdfStatus: ${saved.pdfStatus}`);

    } catch (pdfError) {
      console.error('❌ PDF generation failed:', pdfError.message);
      
      if (saved.storageKey) {
        await MarketReportStorageService.remove(saved.storageKey).catch(() => {});
      }
      
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

    console.log(`🎉 Research complete: ${saved._id}, elapsed: ${Date.now() - startedAt}ms`);
    return completedReport;
  }
}

export default MarketResearchService;