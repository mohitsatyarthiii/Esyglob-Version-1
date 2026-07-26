import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import GlobalTradeResearchService from './global-trade-research.service.js';
import KnowledgeBaseService from './knowledge-base.service.js';
import MarketReportStorageService from './market-report-storage.service.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { getAISearchResults } from '../lib/ai-marketplace-context.js';
import { analyzeRequest, rewriteSearchQuery } from '../lib/ai-intelligence-pipeline.js';
import { buildMarketInsightPdf } from '../lib/market-insight-pdf.js';

const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
const REPORT_REUSE_TTL = 24 * 60 * 60 * 1000;
const REPORT_VERSION = '4.0';

const asArray = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const fmtUsd = value => {
  const amount = number(value);
  if (!amount) return 'Not available';
  if (Math.abs(amount) >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  return `$${Math.round(amount).toLocaleString('en-US')}`;
};

function extractJson(value) {
  const raw = String(value || '').replace(/```(?:json)?|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function generatedFor(session = {}) {
  return clean(session.fullName || [session.firstName, session.lastName].filter(Boolean).join(' ') || session.email || 'EsyGlob member');
}

function reportMetadata(report, id, persisted = {}) {
  const savedReportId = String(id);
  return {
    savedReportId,
    reportId: report.id || savedReportId,
    title: report.title,
    description: report.executiveSummary || report.subtitle || report.query,
    query: report.query,
    reportType: report.reportType,
    productName: report.productName || '',
    country: report.country || '',
    reportVersion: REPORT_VERSION,
    status: persisted.pdfStatus || 'ready',
    pdfStatus: persisted.pdfStatus || 'ready',
    previewUrl: persisted.previewUrl || `/api/market-insights/reports/${savedReportId}/pdf`,
    pdfUrl: `/api/market-insights/reports/${savedReportId}/pdf`,
    downloadUrl: persisted.downloadUrl || `/api/market-insights/reports/${savedReportId}/pdf?download=1`,
    pages: number(persisted.pageCount),
    fileSize: number(persisted.fileSize),
    generationTimeMs: number(persisted.generationTimeMs || report.elapsedMs),
    generatedAt: report.generatedAt,
    createdAt: persisted.createdAt || report.generatedAt,
  };
}

function knowledgeContext(documents) {
  return documents.map((document, index) => {
    const excerpts = document.content
      || (document.retrievedChunks?.length ? document.retrievedChunks.map(chunk => chunk.content).join('\n') : '')
      || [document.overview, document.summary, JSON.stringify(document.metadata || {})].filter(Boolean).join('\n');
    return [
      `SOURCE ${index + 1}: ${document.title}`,
      `Category: ${document.category || 'market intelligence'}; Version: ${document.version || 1}`,
      clean(excerpts).slice(0, 5_000),
    ].join('\n');
  }).join('\n\n').slice(0, Number(process.env.MARKET_RESEARCH_KNOWLEDGE_CONTEXT_LIMIT || 48_000));
}

function marketplaceSummary(results = {}) {
  return {
    products: asArray(results.products).length,
    suppliers: asArray(results.suppliers).length,
    categories: asArray(results.categories).length,
    services: asArray(results.services).length,
  };
}

function parseNumeric(value) {
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function knowledgeArtifacts(documents = []) {
  const tables = [];
  const charts = [];
  const fingerprints = new Set();
  for (const document of documents) {
    const sourceText = String(document.content || document.retrievedChunks?.map(chunk => chunk.content).join('\n') || '');
    const lines = sourceText.split(/\r?\n/).map(line => line.trim());
    let index = 0;
    while (index < lines.length) {
      if (!lines[index].includes('|')) { index += 1; continue; }
      const group = [];
      while (index < lines.length && lines[index].includes('|')) {
        group.push(lines[index].replace(/^\||\|$/g, '').split('|').map(cell => clean(cell)));
        index += 1;
      }
      const usable = group.filter(row => !row.every(cell => /^:?-{3,}:?$/.test(cell)));
      if (usable.length < 3 || usable[0].length < 2) continue;
      const columns = usable[0];
      const rows = usable.slice(1).filter(row => row.length === columns.length).slice(0, 24);
      const fingerprint = `${columns.join('|')}:${rows.slice(0, 3).flat().join('|')}`;
      if (!rows.length || fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      const table = {
        title: `${document.title} — verified evidence table`,
        columns,
        rows,
        source: document.title,
      };
      tables.push(table);
      const numericColumn = columns.findIndex((_, column) => column > 0 && rows.filter(row => parseNumeric(row[column]) !== null).length >= 3);
      if (numericColumn > 0) {
        const data = rows.map(row => ({ label: row[0], value: parseNumeric(row[numericColumn]) })).filter(item => item.value !== null).slice(0, 10);
        if (data.length >= 3) charts.push({
          type: /share|mix|segment/i.test(columns[numericColumn]) ? 'pie' : /year|period/i.test(columns[0]) ? 'line' : 'bar',
          title: `${columns[numericColumn]} — ${document.title}`,
          data,
          source: document.title,
        });
      }
    }
  }
  return { tables: tables.slice(0, 6), charts: charts.slice(0, 5) };
}

function actualTradeTables(global = {}, query = '') {
  const macroRelevant = /\b(global|top markets?|country comparison|compare countries|macro|worldwide)\b/i.test(query);
  const imports = macroRelevant ? asArray(global.macroImports).slice(0, 10) : [];
  const exports = macroRelevant ? asArray(global.macroExports).slice(0, 10) : [];
  const product = asArray(global.officialProductRows).slice(0, 16);
  const tables = [];
  if (imports.length) tables.push({
    title: 'Leading import markets — macro trade context',
    subtitle: 'Values represent connected macro indicators and are not product-specific unless explicitly stated.',
    columns: ['Rank', 'Country', 'Import value', 'Year'],
    rows: imports.map((row, index) => [index + 1, row.country, fmtUsd(row.valueUsd), row.year || 'Latest']),
    source: 'World Bank — World Development Indicators',
  });
  if (exports.length) tables.push({
    title: 'Leading export markets — macro trade context',
    columns: ['Rank', 'Country', 'Export value', 'Year'],
    rows: exports.map((row, index) => [index + 1, row.country, fmtUsd(row.valueUsd), row.year || 'Latest']),
    source: 'World Bank — World Development Indicators',
  });
  if (product.length) tables.push({
    title: 'Product-level trade observations',
    columns: ['Flow', 'Reporter', 'Partner', 'HS code', 'Period', 'Value'],
    rows: product.map(row => [row.flow, row.reporter, row.partner, row.hsCode, row.period, fmtUsd(row.valueUsd)]),
    source: 'UN Comtrade',
  });
  return tables;
}

function actualCharts(global = {}, marketplace = {}, query = '') {
  const macroRelevant = /\b(global|top markets?|country comparison|compare countries|macro|worldwide)\b/i.test(query);
  const imports = macroRelevant ? asArray(global.macroImports).slice(0, 8) : [];
  const exports = macroRelevant ? asArray(global.macroExports).slice(0, 8) : [];
  const charts = [];
  if (imports.length > 1) charts.push({
    type: 'bar',
    title: 'Relative scale of leading import markets',
    data: imports.map(row => ({ label: row.country, value: number(row.valueUsd) })),
    source: 'World Bank — World Development Indicators',
  });
  if (exports.length > 1) charts.push({
    type: 'area',
    title: 'Relative scale of leading export markets',
    data: exports.map(row => ({ label: row.country, value: number(row.valueUsd) })),
    source: 'World Bank — World Development Indicators',
  });
  const marketplaceData = /\b(supplier|manufacturer|competitor|competition|marketplace|distribution)\b/i.test(query)
    ? Object.entries(marketplace).map(([label, value]) => ({ label, value })).filter(row => row.value > 0)
    : [];
  if (marketplaceData.length > 1) charts.push({
    type: 'pie',
    title: 'Connected EsyGlob marketplace evidence',
    data: marketplaceData,
    source: 'EsyGlob marketplace search snapshot',
  });
  return charts;
}

function fallbackAnalysis({ query, productName, country, knowledge, global, marketplace }) {
  const titles = knowledge.slice(0, 5).map(item => item.title).filter(Boolean);
  const scope = [productName || query, country].filter(Boolean).join(' in ');
  const sourceLanguage = titles.length
    ? `The evidence base covers ${titles.join(', ')} and connected trade indicators.`
    : 'The evidence base is limited to connected trade and marketplace indicators; primary research should precede material investment.';
  return {
    title: `${scope} — Market Intelligence and Trade Outlook`,
    subtitle: `An evidence-aware assessment of demand, trade structure, risk and commercial opportunity`,
    executiveSummary: `${scope} presents a market decision that depends on verified product classification, demand economics, regulatory access and supply-chain execution. ${sourceLanguage} The commercial priority is to validate product-level demand and landed cost before committing capital, then sequence entry through qualified partners and measurable buyer signals.`,
    executiveHighlights: [
      'Validate the HS classification and product-level trade series before relying on tariff or market-size estimates.',
      `${marketplace.suppliers || 0} suppliers and ${marketplace.products || 0} products were found in the connected marketplace snapshot.`,
      'Stage market entry around compliance readiness, landed-cost resilience and evidence of repeat demand.',
    ],
    sections: [
      { key: 'overview', title: 'Market Overview & Industry Structure', paragraphs: [`The ${scope} opportunity should be assessed as an interconnected system of end-user demand, domestic capacity, imports, distribution economics and regulation. ${sourceLanguage}`, 'Macro indicators establish market context but do not substitute for product-level sizing. Decision makers should normalize units, periods, HS classifications and nominal currencies before comparing markets.'], insights: ['Separate addressable product demand from broad sector growth.', 'Test buyer concentration and channel margins through primary interviews.', 'Use a consistent base year and currency for all scenario comparisons.'] },
      { key: 'supply-chain', title: 'Supply Chain, Demand Drivers & Pricing', paragraphs: ['Supply resilience depends on raw-material access, conversion capacity, quality control, transport corridors, inventory policy and the financial strength of channel partners. Demand should be segmented by application, buyer type, specification and purchasing frequency.', 'Pricing analysis should compare ex-works price, inland transport, duties, port charges, finance costs, insurance, distributor margin and post-sale obligations. A lower factory quote does not necessarily produce a lower landed cost.'], insights: ['Request comparable quotations under the same Incoterm and specification.', 'Model lead-time and currency sensitivity alongside price.', 'Qualify alternate suppliers before demand accelerates.'] },
      { key: 'trade', title: 'Import, Export & Trade Route Analysis', paragraphs: [`Connected official sources returned ${asArray(global.officialProductRows).length} product-level trade observations. ${global.hsCode ? `The working classification is HS ${global.hsCode}, subject to verification against the exact product specification.` : 'No verified HS classification was available, so product-level tariff claims are intentionally withheld.'}`, 'Trade-route selection should balance sailing or transit time, port reliability, customs capability, inland access and working-capital exposure.'], insights: asArray(global.gaps) },
      { key: 'competition', title: 'Competitive Landscape & Country Analysis', paragraphs: [`The connected marketplace snapshot contains ${marketplace.suppliers || 0} suppliers, ${marketplace.products || 0} products and ${marketplace.categories || 0} related categories. These counts indicate discoverable supply, not audited market share.`, 'Competitors should be compared on specification fit, certification scope, production capacity, delivery reliability, commercial terms, references and total cost of ownership.'], insights: ['Do not infer market leadership from listing volume.', 'Build a normalized competitor scorecard.', 'Validate claims with certificates, samples and factory evidence.'] },
      { key: 'regulation', title: 'Regulatory Environment & Market Access', paragraphs: ['Market access should begin with verified classification, destination-country standards, labeling, testing, documentation and importer-of-record obligations. Regulatory requirements can vary by end use even within the same tariff heading.', 'A compliance register should identify the responsible owner, evidence required, renewal date, cost and consequence of non-compliance for every obligation.'], insights: ['Obtain written classification guidance for ambiguous products.', 'Confirm current duties through official customs sources.', 'Treat certification lead time as part of the critical path.'] },
      { key: 'strategy', title: 'SWOT, Competitive Forces & Risk Assessment', paragraphs: ['The opportunity is strongest where differentiated specifications, reliable fulfillment or channel access solve a measurable buyer problem. Competitive pressure rises when products are standardized, switching costs are low and compliant capacity is abundant.', 'Material risks include classification error, policy change, demand overestimation, supplier concentration, logistics disruption, quality failure, currency volatility and slow receivables. Each risk requires an owner, trigger and mitigation action.'], insights: ['Strength: access to a broad supplier discovery base.', 'Weakness: limited product-level evidence until classification is verified.', 'Opportunity: targeted entry through underserved applications or regions.', 'Threat: margin erosion from compliance, freight and currency volatility.'] },
      { key: 'recommendations', title: 'Investment Opportunities & Strategic Recommendations', paragraphs: ['Use a staged investment process: verify demand, validate compliance, test supplier capability, run a landed-cost pilot and scale only after repeat orders or contracted demand. Capital should follow evidence rather than headline market growth.', 'A 90-day workplan should convert the highest-impact uncertainties into testable commercial questions and assign clear decision gates.'], insights: ['Complete product classification and regulatory mapping.', 'Interview priority buyers and distributors.', 'Run a controlled sample or pilot order.', 'Build downside, base and upside landed-cost scenarios.', 'Negotiate service levels and quality remedies before scale.'] },
      { key: 'outlook', title: 'Future Outlook & Conclusion', paragraphs: ['The medium-term outlook will be shaped by regulation, technology adoption, supply-chain regionalization, sustainability requirements and buyer preference for reliable, traceable supply. Continuous monitoring is more valuable than a static forecast when the evidence base is changing.', `The ${scope} opportunity can justify further diligence, but investment should remain conditional on verified product demand, compliant market access and resilient unit economics.`] },
    ],
  };
}

function normalizeAnalysis(value, fallback) {
  const analysis = value && typeof value === 'object' ? value : fallback;
  const sections = asArray(analysis.sections).filter(section => clean(section.title) && (clean(section.narrative || section.content) || asArray(section.paragraphs).length || asArray(section.insights).length));
  return {
    ...fallback,
    ...analysis,
    executiveHighlights: asArray(analysis.executiveHighlights).length ? analysis.executiveHighlights.slice(0, 5) : fallback.executiveHighlights,
    sections: sections.length ? sections.map(section => ({
      ...section,
      paragraphs: asArray(section.paragraphs).length ? section.paragraphs.map(clean).filter(Boolean) : [clean(section.narrative || section.content)].filter(Boolean),
      insights: asArray(section.insights || section.points).map(clean).filter(Boolean),
      subsections: asArray(section.subsections),
    })) : fallback.sections,
  };
}

function promptForAnalysis({ query, productName, country, intent, knowledge, global, marketplace }) {
  const macroRelevant = /\b(global|top markets?|country comparison|compare countries|macro|worldwide)\b/i.test(query);
  return `Act as a senior market intelligence analyst. Produce an original, evidence-aware report plan for:
QUERY: ${query}
PRODUCT: ${productName || 'Not specified'}
COUNTRY: ${country || 'Global'}
INTENT: ${intent}

PRIMARY KNOWLEDGE EVIDENCE:
${knowledge || 'No knowledge documents were returned. Do not invent facts.'}

CONNECTED TRADE EVIDENCE:
${JSON.stringify({ hsCode: global.hsCode, target: global.target?.name, ...(macroRelevant ? { macroImports: asArray(global.macroImports).slice(0, 8), macroExports: asArray(global.macroExports).slice(0, 8) } : {}), productTrade: asArray(global.officialProductRows).slice(0, 12), gaps: global.gaps })}

MARKETPLACE EVIDENCE:
${JSON.stringify(marketplace)}

Reason across sources, compare claims and distinguish verified facts from inference. Never write "according to document", "based on stored knowledge" or "retrieved information". Never copy source passages. Do not invent statistics, market shares, forecasts, companies or tariff rates. Write like an industry analyst for executives. Include only relevant sections, but consider market overview, industry structure, supply chain, demand, market size, growth outlook, imports, exports, routes, pricing, competition, country context, regulation, SWOT, Porter's Five Forces, risk, investment opportunities, recommendations and conclusion.

Return only valid JSON:
{
  "title":"specific professional title",
  "subtitle":"one-line scope",
  "executiveSummary":"300-450 words",
  "executiveHighlights":["3-5 evidence-based highlights"],
  "sections":[
    {
      "key":"stable-key",
      "title":"section title",
      "evidenceNote":"brief evidence scope",
      "paragraphs":["2-5 substantive analyst paragraphs"],
      "insights":["0-5 concise decision insights"],
      "subsections":[{"title":"optional subsection","paragraphs":["substantive paragraph"],"points":[]}]
    }
  ],
  "recommendations":["specific actions"],
  "risks":["specific risks"],
  "outlook":"professional outlook",
  "conclusion":"professional conclusion"
}`;
}

export default class MarketResearchService {
  static emit(emit, startedAt, event) {
    emit?.({ elapsedMs: Date.now() - startedAt, timestamp: new Date().toISOString(), ...event });
  }

  static step(emit, startedAt, agent, operation, progress, status = 'success', sourceCount = 0) {
    this.emit(emit, startedAt, { type: 'step', agent, operation, progress, status, sourceCount });
  }

  static async run({ userId, session = {}, query, productName = '', country = '', category = '', mode = 'product_rd', force = false }, emit = () => {}) {
    const startedAt = Date.now();
    const researchQuery = clean(query || [productName, category, country].filter(Boolean).join(' '));
    if (researchQuery.length < 3) throw Object.assign(new Error('Please provide a detailed research query'), { statusCode: 400 });
    const queryHash = crypto.createHash('sha256').update(`${researchQuery.toLowerCase()}:${REPORT_VERSION}`).digest('hex');
    const cacheKey = `${userId}:${queryHash}`;
    if (!force) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
        this.emit(emit, startedAt, { type: 'report', report: cached.report, cached: true, progress: 100 });
        return cached.report;
      }
      const reusable = await SavedResearchReport.findOne({ userId, queryHash, status: 'active', pdfStatus: 'ready', createdAt: { $gte: new Date(Date.now() - REPORT_REUSE_TTL) } })
        .select('reportData previewUrl downloadUrl pageCount fileSize generationTimeMs createdAt pdfStatus').sort({ createdAt: -1 }).lean();
      if (reusable?.reportData) {
        const report = reportMetadata(reusable.reportData, reusable._id, reusable);
        this.emit(emit, startedAt, { type: 'report', report, cached: true, progress: 100 });
        cache.set(cacheKey, { createdAt: Date.now(), report });
        return report;
      }
    }

    const researchId = `research-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    this.emit(emit, startedAt, { type: 'research_started', researchId, progress: 2 });
    const intelligence = analyzeRequest({ message: researchQuery, role: 'buyer' });
    const rewrittenQuery = rewriteSearchQuery({ message: researchQuery, intelligence });
    this.step(emit, startedAt, 'Research Orchestrator', 'Running hybrid knowledge, trade and marketplace retrieval', 10, 'running');
    const [knowledgeDocuments, global, marketplaceResults] = await Promise.all([
      KnowledgeBaseService.retrieve({ query: researchQuery, rewrittenQuery, role: 'buyer', intent: 'market_research', language: intelligence.language, limit: 12 }),
      GlobalTradeResearchService.collect({ query: researchQuery, productName: productName || researchQuery, country }),
      getAISearchResults({ query: researchQuery, filters: { categories: category ? [category] : [], countries: country ? [country] : [] }, userId }),
    ]);
    const knowledge = knowledgeContext(knowledgeDocuments);
    const marketplace = marketplaceSummary(marketplaceResults);
    const sourceCount = knowledgeDocuments.length + asArray(global.sources).length + Object.values(marketplace).reduce((sum, value) => sum + value, 0);
    this.step(emit, startedAt, 'Evidence Ranker', `Merged and ranked ${knowledgeDocuments.length} knowledge sources`, 35, 'success', sourceCount);

    const fallback = fallbackAnalysis({ query: researchQuery, productName, country, knowledge: knowledgeDocuments, global, marketplace });
    let generated;
    try {
      this.step(emit, startedAt, 'AI Analyst', 'Reasoning across the evidence and planning the report', 48, 'running', sourceCount);
      const response = await AIChatService.callOllama(
        promptForAnalysis({ query: researchQuery, productName, country, intent: intelligence.intent, knowledge, global, marketplace }),
        [],
        'You are EsyGlob AI Market Intelligence. Synthesize evidence into original executive analysis. Return valid JSON only.',
        { maxTokens: 7_000, temperature: .18, timeoutMs: 150_000, jsonMode: true },
      );
      generated = extractJson(response?.message);
    } catch (error) {
      console.warn('[Market Insights] AI synthesis unavailable; using evidence-safe analytical fallback:', error.message);
    }
    const analysis = normalizeAnalysis(generated, fallback);
    this.step(emit, startedAt, 'Quality Reviewer', 'Cross-validating claims and attaching only measured charts and tables', 72, 'success', sourceCount);

    const artifacts = knowledgeArtifacts(knowledgeDocuments);
    const tradeTables = actualTradeTables(global, researchQuery);
    const charts = actualCharts(global, marketplace, researchQuery);
    const tradeSection = analysis.sections.find(section => /trade|import|export/i.test(section.key || section.title));
    if (tradeSection) {
      tradeSection.tables = tradeTables;
      tradeSection.charts = charts.filter(item => !item.source?.includes('EsyGlob'));
    }
    const evidenceSection = analysis.sections.find(section => /overview|industry|market|pricing|forecast|trend/i.test(section.key || section.title)) || analysis.sections[0];
    if (evidenceSection) {
      evidenceSection.tables = [...asArray(evidenceSection.tables), ...artifacts.tables];
      evidenceSection.charts = [...asArray(evidenceSection.charts), ...artifacts.charts];
    }
    const competitionSection = analysis.sections.find(section => /compet|marketplace|supplier/i.test(section.key || section.title));
    if (competitionSection) competitionSection.charts = charts.filter(item => item.source?.includes('EsyGlob'));
    const relevantGlobalSources = asArray(global.sources).filter(source => {
      if (source.status === 'unavailable') return false;
      if (/World Bank/i.test(source.name)) return /\b(global|top markets?|country comparison|compare countries|macro|worldwide)\b/i.test(researchQuery);
      if (/UN Comtrade/i.test(source.name)) return asArray(global.officialProductRows).length > 0;
      if (/WTO/i.test(source.name)) return /\b(wto|tariff|trade policy|trade agreement|duty)\b/i.test(researchQuery);
      if (/WCO|HS Classification/i.test(source.name)) return Boolean(global.hsCode);
      return source.status === 'connected';
    });
    const sources = [
      ...knowledgeDocuments.map(document => ({ name: document.title, publisher: document.source?.publisher, type: 'AI knowledge database', version: document.version })),
      ...relevantGlobalSources,
    ];
    const generatedAt = new Date().toISOString();
    const report = {
      id: researchId,
      reportType: ['product_rd', 'country_rd', 'opportunity_finder'].includes(mode) ? mode : 'product_rd',
      query: researchQuery,
      title: analysis.title,
      subtitle: analysis.subtitle,
      executiveSummary: analysis.executiveSummary,
      executiveHighlights: analysis.executiveHighlights,
      generatedFor: generatedFor(session),
      productName: productName || researchQuery,
      country,
      category,
      reportVersion: REPORT_VERSION,
      sections: analysis.sections,
      keyMetrics: [
        { label: 'Knowledge sources', value: knowledgeDocuments.length, note: 'Hybrid ranked' },
        { label: 'Official datasets', value: relevantGlobalSources.length, note: 'Query-relevant' },
        { label: 'Trade observations', value: asArray(global.officialProductRows).length, note: global.hsCode ? `HS ${global.hsCode}` : 'HS pending' },
        { label: 'Marketplace matches', value: marketplace.products + marketplace.suppliers, note: 'Current snapshot' },
      ],
      recommendations: asArray(analysis.recommendations),
      risks: asArray(analysis.risks),
      methodology: 'Intent detection followed by hybrid semantic and lexical knowledge retrieval, relevance ranking and deduplication, connected trade-data collection, marketplace retrieval, AI-assisted synthesis, cross-validation, section planning, measured chart/table planning and layout quality validation.',
      references: sources,
      sources,
      dataGaps: asArray(global.gaps),
      sourceCount,
      generatedBy: 'EsyGlob AI Market Intelligence',
      generatedAt,
      createdAt: generatedAt,
    };

    this.step(emit, startedAt, 'Document Planner', 'Planning continuous narrative, tables and charts', 82, 'running', sourceCount);
    const saved = new SavedResearchReport({
      userId,
      roleContext: session.primaryRole === 'seller' ? 'seller' : 'buyer',
      reportType: report.reportType,
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
      this.step(emit, startedAt, 'PDF Layout Engine', 'Rendering and validating the continuous report', 90, 'running', sourceCount);
      const pdf = await buildMarketInsightPdf(report, { reportId: report.id, generatedAt, query: researchQuery, reportVersion: REPORT_VERSION });
      let stored;
      try {
        stored = await MarketReportStorageService.write(saved._id, pdf);
      } catch (error) {
        console.warn('[Market Insights] Filesystem unavailable; using MongoDB PDF fallback:', error.message);
        stored = { storageKey: '', storageProvider: 'mongodb', fileSize: pdf.length };
        saved.pdfData = pdf;
      }
      saved.pdfStatus = 'ready';
      saved.pdfGeneratedAt = new Date();
      saved.previewUrl = `/api/market-insights/reports/${saved._id}/pdf`;
      saved.downloadUrl = `/api/market-insights/reports/${saved._id}/pdf?download=1`;
      saved.pageCount = number(pdf.pageCount);
      saved.fileSize = stored.fileSize;
      saved.storageProvider = stored.storageProvider;
      saved.storageKey = stored.storageKey;
      saved.generationTimeMs = Date.now() - startedAt;
      report.elapsedMs = saved.generationTimeMs;
      report.pdfValidation = pdf.validation;
      saved.reportData = report;
      await saved.save();
    } catch (error) {
      await MarketReportStorageService.remove(saved.storageKey).catch(() => undefined);
      saved.pdfStatus = 'failed';
      saved.pdfError = clean(error.message).slice(0, 500);
      saved.storageKey = '';
      saved.fileSize = 0;
      saved.reportData = report;
      await saved.save().catch(() => undefined);
      throw Object.assign(new Error('The analysis completed, but the validated PDF could not be produced. Please retry.'), { cause: error });
    }
    const completed = reportMetadata(report, saved._id, saved);
    cache.set(cacheKey, { createdAt: Date.now(), report: completed });
    this.step(emit, startedAt, 'Complete', 'Enterprise Market Intelligence PDF completed', 100, 'success', sourceCount);
    this.emit(emit, startedAt, { type: 'report', report: completed, progress: 100 });
    return completed;
  }
}
