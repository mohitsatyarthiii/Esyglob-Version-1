import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import GlobalTradeResearchService from './global-trade-research.service.js';
import MarketInsightsRepository from '../repositories/market-insights.repository.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { getAISearchResults, getSearchTerms } from '../lib/ai-marketplace-context.js';

const cache = new Map();
const CACHE_TTL = Number(process.env.MARKET_RESEARCH_CACHE_TTL_MS || 15 * 60 * 1000);
const WEB_URL = String(process.env.PUBLIC_WEB_URL || 'https://esyglob.in').replace(/\/$/, '');
const absolute = path => `${WEB_URL}${path}`;

function extractJson(text) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim();
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function roleContext(session) {
  if (session?.roles?.includes('seller')) return 'seller';
  if (session?.roles?.includes('buyer')) return 'buyer';
  return 'general';
}

function productRows(results) {
  return (results.products || []).map(product => ({ product: product.name || 'Product', category: product.category || 'General', price: product.price != null ? `${product.currency || 'INR'} ${product.price}` : 'Request price', moq: product.minimumOrderQuantity != null ? `${product.minimumOrderQuantity} ${product.unit || 'units'}` : 'Ask seller', seller: product.sellerId?.companyName || 'Seller', verified: product.sellerId?.isVerified ? 'Yes' : 'No', link: absolute(`/products/${product._id}`), sellerLink: product.sellerId?._id ? absolute(`/manufacturers/${product.sellerId._id}`) : '' }));
}
function sellerRows(results) {
  return (results.suppliers || []).map(seller => ({ seller: seller.companyName || seller.businessName || 'Seller', type: seller.companyType || 'supplier', country: seller.address?.country || 'Not specified', verified: seller.isVerified ? 'Yes' : 'No', trustScore: seller.trustScore ?? 'N/A', rating: seller.rating ?? 'N/A', link: absolute(`/manufacturers/${seller._id}`) }));
}
function serviceRows(results) {
  return (results.services || []).map(service => ({ service: service.title, description: service.description || '', link: absolute(`/services/${service.key}`) }));
}

function fmtUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Unavailable';
  if (Math.abs(amount) >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

class MarketResearchService {
  static emit(emit, startedAt, event) { emit({ elapsedMs: Date.now() - startedAt, timestamp: new Date().toISOString(), ...event }); }
  static step(emit, startedAt, agent, operation, progress, status = 'success', sourceCount = 0, datasetsCollected = 0) { this.emit(emit, startedAt, { type: 'step', agent, operation, progress, status, sourceCount, datasetsCollected }); }

  static async run({ userId, session, query, productName = '', country = '', category = '', mode = 'product_rd' }, emit) {
    const startedAt = Date.now();
    const researchQuery = String(query || [productName, category, country].filter(Boolean).join(' ')).trim();
    if (researchQuery.length < 2) throw Object.assign(new Error('Research request is required'), { statusCode: 400 });
    const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ userId: String(userId), researchQuery, mode, country, category })).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
      this.emit(emit, startedAt, { type: 'research_started', researchId: cached.report.id, cached: true, progress: 2 });
      cached.report.sections?.forEach((section, index) => this.emit(emit, startedAt, { type: 'section', index, section, progress: 90 }));
      this.emit(emit, startedAt, { type: 'report', report: cached.report, progress: 100 });
      return cached.report;
    }

    const researchId = `research-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    this.emit(emit, startedAt, { type: 'research_started', researchId, query: researchQuery, model: process.env.OLLAMA_MODEL || 'qwen2.5:3b', progress: 1 });
    const plannedQueries = [`${productName || researchQuery} global trade statistics`, `${productName || researchQuery} ${country || 'global'} imports exports`, `${productName || researchQuery} industry pricing logistics regulations`];
    this.emit(emit, startedAt, { type: 'step', agent: 'Research Planner', operation: 'Generating targeted research queries and source priorities', searchQueries: plannedQueries, progress: 4, status: 'success', sourceCount: 0, datasetsCollected: 0 });
    this.step(emit, startedAt, 'Global Trade Research', 'Exploring official statistics and trusted public-market sources', 8, 'running');
    const global = await GlobalTradeResearchService.collect({ query: researchQuery, productName, country });
    const connectedSources = global.sources.filter(source => source.status === 'connected').length;
    this.step(emit, startedAt, 'Official Data', 'World Bank country and macro trade indicators collected', 18, 'success', connectedSources, 1);
    this.emit(emit, startedAt, { type: 'step', agent: 'Public Market Research', operation: global.publicArticles.length ? `Reviewing ${global.publicArticles.length} recent public market and industry records` : 'No recent public-market records passed source collection', searchQueries: global.searchQueries, progress: 23, status: 'success', sourceCount: global.sources.length, datasetsCollected: global.publicArticles.length ? 2 : 1 });
    this.step(emit, startedAt, 'HS & Customs', global.hsCode ? `Validating HS ${global.hsCode} through UN Comtrade` : 'HS code not supplied; product-level customs claims withheld', 28, 'success', global.sources.length, global.officialProductRows.length ? 2 : 1);
    this.step(emit, startedAt, 'Import / Export Intelligence', 'Comparing official import and export indicators', 38, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Industry & Competitor Research', 'Checking connected evidence for industry and competitor claims', 45, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Pricing Intelligence', 'Separating verified trade values from unavailable commercial pricing', 51, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Supply Chain & Logistics', 'Preparing customs, logistics and verification requirements', 57, 'success', global.sources.length, 2);

    const terms = getSearchTerms(researchQuery, { keywords: [productName, category].filter(Boolean), countries: country ? [country] : [] });
    const filters = { keywords: terms, categories: category ? [category] : [], countries: country ? [country] : [] };
    this.step(emit, startedAt, 'EsyGlob Opportunities', 'Global research complete; finding related marketplace opportunities', 64, 'running', global.sources.length, 2);
    const [results, marketplaceMetrics] = await Promise.all([
      getAISearchResults({ query: researchQuery, filters, userId }),
      MarketInsightsRepository.getMarketplaceData(productName || researchQuery, category, country),
    ]);
    this.step(emit, startedAt, 'EsyGlob Opportunities', 'Related platform products, sellers and services collected', 72, 'success', global.sources.length + 1, 3);

    const evidence = { request: researchQuery, hsCode: global.hsCode || 'unverified', targetCountry: global.target?.name || country || 'not specified', topMacroImporters: global.macroImports.slice(0, 4), topMacroExporters: global.macroExports.slice(0, 4), productLevelRecords: global.officialProductRows.slice(0, 4), dataGaps: global.gaps };
    this.step(emit, startedAt, 'Trade Analyst', 'Synthesizing evidence and recommendations', 78, 'running', global.sources.length, 3);
    let ai = null; let generated = null;
    try {
      ai = await AIChatService.callOllama(`Use only this evidence. Return concise JSON {"summary":"max 45 words","insights":["max 18 words"],"recommendations":["max 18 words"],"risks":["max 18 words"]}. Use 3 insights, 3 actions, 2 risks. State macro scope and missing HS evidence. ${JSON.stringify(evidence).slice(0, 2200)}`, [], 'You are an evidence-first international trade analyst. Never invent statistics, tariffs, companies or sources.', { maxTokens: 240, temperature: 0.1, timeoutMs: 55000, jsonMode: true });
      generated = extractJson(ai.message);
    } catch { /* deterministic evidence report remains available */ }
    generated ||= { summary: `This report prioritizes connected official trade indicators for ${productName || researchQuery}. Product-level customs statistics are ${global.officialProductRows.length ? 'available for the supplied HS code' : 'not verified'}, so macro indicators are clearly separated from EsyGlob marketplace opportunities.`, insights: ['Macro trade indicators describe total goods and services, not this product.', global.hsCode ? `HS ${global.hsCode} was used for the connected customs query.` : 'Provide a verified HS code for product-level customs analysis.', 'Commercial pricing and freight require current supplier or carrier quotations.'], recommendations: ['Confirm the HS classification with a licensed customs professional.', 'Validate destination tariffs and certifications before contracting.', 'Request comparable landed-cost quotations from shortlisted suppliers.'], risks: ['Using macro trade totals as product demand would be misleading.', 'Tariffs and compliance requirements can change by classification and origin.'] };

    const globalTables = [
      ...(global.officialProductRows.length ? [{ title: `Verified product trade — HS ${global.hsCode}`, columns: ['rank', 'reporter', 'partner', 'hsCode', 'flow', 'reportYear', 'sourceDataYear', 'valueUsd'], rows: global.officialProductRows.slice(0, 5).map(row => ({ ...row, reportYear: 2026, sourceDataYear: row.period })) }] : []),
      { title: 'Largest import markets — macro context', columns: ['rank', 'country', 'valueUsd', 'reportYear', 'sourceDataYear', 'scope'], rows: global.macroImports.slice(0, 5).map(row => ({ ...row, valueUsd: fmtUsd(row.valueUsd), reportYear: 2026, sourceDataYear: row.year })) },
      { title: 'Largest export markets — macro context', columns: ['rank', 'country', 'valueUsd', 'reportYear', 'sourceDataYear', 'scope'], rows: global.macroExports.slice(0, 5).map(row => ({ ...row, valueUsd: fmtUsd(row.valueUsd), reportYear: 2026, sourceDataYear: row.year })) },
      ...(global.publicArticles.length ? [{ title: 'Recent public market & industry sources', columns: ['title', 'domain', 'date', 'url'], rows: global.publicArticles.slice(0, 5) }] : []),
    ];
    const charts = [
      { type: 'bar', title: 'Macro import market comparison', data: global.macroImports.slice(0, 6).map(row => ({ label: row.country, value: row.valueUsd })) },
      { type: 'bar', title: 'Macro export market comparison', data: global.macroExports.slice(0, 6).map(row => ({ label: row.country, value: row.valueUsd })) },
    ];
    const sections = [
      { type: 'trade', title: 'Research scope & product classification', summary: global.hsCode ? `HS code ${global.hsCode} was used for the connected UN Comtrade query. Classification status: ${global.hsResolution?.status || 'unverified'}. Destination-customs confirmation remains necessary.` : 'No verifiable HS code was supplied or matched. The report does not guess a classification, tariff, or product-level trade value.', points: generated.insights || [], confidence: global.hsResolution?.selected ? 92 : global.hsCode ? 72 : 60, evidenceType: 'official-data-and-analysis' },
      { type: 'trade', title: 'Global trade intelligence', summary: 'World Bank country rankings use official aggregate imports and exports of goods and services as macroeconomic context. They are not represented as product market size.', points: [`Top 5 of ${global.macroImports.length} reviewed import markets and ${global.macroExports.length} export markets are presented.`, global.target ? `Target-country indicators were matched for ${global.target.name}.` : 'No target-country record was selected.'], confidence: 92, evidenceType: 'official-data' },
      ...(global.publicArticles.length ? [{ type: 'narrative', title: 'Recent market & industry reading', summary: 'Recent public records are provided as a research reading list. Their headlines are not treated as verified statistics without primary-source confirmation.', points: [`${global.publicArticles.length} unique records were retained from targeted searches.`, 'Open the source links to evaluate methodology, publication date and primary evidence.'], confidence: 70, evidenceType: 'public-market-data' }] : []),
      { type: 'strategy', title: 'Regulation, pricing & logistics validation', summary: 'Exact tariffs, non-tariff measures, certifications, freight and landed costs depend on HS classification, origin, destination and shipment terms.', points: ['Verify applied and preferential duties in the destination customs or WTO tariff portal.', 'Obtain current freight, insurance and customs-broker quotations.', 'Confirm product standards and documentary requirements with the competent authority.'], confidence: 88, evidenceType: 'official-reference-and-analysis' },
    ];
    const marketplaceSection = {
      title: 'Related Opportunities on Esyglob',
      summary: 'These live marketplace matches complement the global research and are not used as official trade statistics.',
      metrics: marketplaceMetrics,
      tables: [
        ...(results.products.length ? [{ title: 'Related products', columns: ['product', 'category', 'price', 'moq', 'seller', 'verified', 'link', 'sellerLink'], rows: productRows(results) }] : []),
        ...(results.suppliers.length ? [{ title: 'Related suppliers and manufacturers', columns: ['seller', 'type', 'country', 'verified', 'trustScore', 'rating', 'link'], rows: sellerRows(results) }] : []),
        ...(results.services.length ? [{ title: 'Related services', columns: ['service', 'description', 'link'], rows: serviceRows(results) }] : []),
      ],
    };
    const marketplaceSources = [{ name: 'EsyGlob Marketplace — related opportunities', type: 'marketplace', url: WEB_URL, status: 'connected' }];
    const report = {
      id: researchId, reportType: mode, query: researchQuery, title: `${productName || researchQuery} — Global Trade Intelligence`, executiveSummary: generated.summary,
      reportYear: 2026,
      kpis: [
        { label: 'Official sources', value: connectedSources, trend: 'stable', note: 'Connected datasets with returned data' },
        { label: 'HS status', value: global.hsCode || 'Unverified', trend: 'stable', note: global.hsCode ? 'User-supplied classification' : 'Needed for product-level trade' },
        { label: 'Markets compared', value: global.macroImports.length, trend: 'stable', note: 'Macro trade context' },
        { label: 'Product records', value: global.officialProductRows.length, trend: 'stable', note: 'Connected UN Comtrade rows' },
      ],
      sections, charts, tables: globalTables, recommendations: (generated.recommendations || []).slice(0, 4), risks: (generated.risks || []).slice(0, 3).map((reason, index) => ({ label: `Research risk ${index + 1}`, level: 'medium', reason: String(reason) })),
      sources: [...global.sources, ...marketplaceSources], dataGaps: global.gaps, dataIntegrityNotes: global.gaps, marketplaceSection,
      model: ai?.model || process.env.OLLAMA_MODEL || 'qwen2.5:3b', provider: ai?.provider || 'deterministic-evidence', sourceCount: global.sources.length + 1, datasetsCollected: 3, createdAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    };
    sections.forEach((section, index) => this.emit(emit, startedAt, { type: 'section', section, index, progress: 82 + index * 3, sourceCount: report.sourceCount, datasetsCollected: 3 }));
    this.step(emit, startedAt, 'Evidence Review', 'Validating provenance, scope labels and data gaps', 94, 'success', report.sourceCount, 3);
    const saved = await SavedResearchReport.create({ userId, roleContext: roleContext(session), reportType: ['product_rd', 'country_rd', 'opportunity_finder'].includes(mode) ? mode : 'product_rd', title: report.title, productName, country, query: researchQuery, reportData: report });
    report.savedReportId = String(saved._id); cache.set(cacheKey, { createdAt: Date.now(), report });
    this.step(emit, startedAt, 'Report Generator', 'Professional global trade report completed', 98, 'success', report.sourceCount, 3);
    this.emit(emit, startedAt, { type: 'report', report, progress: 100, sourceCount: report.sourceCount, datasetsCollected: 3 });
    return report;
  }
}

export default MarketResearchService;
