import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import GlobalTradeResearchService from './global-trade-research.service.js';
import MarketInsightsRepository from '../repositories/market-insights.repository.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { getAISearchResults, getSearchTerms } from '../lib/ai-marketplace-context.js';
import { buildMarketInsightPdf } from '../lib/market-insight-pdf.js';
import KnowledgeBaseService from './knowledge-base.service.js';
import MarketReportStorageService from './market-report-storage.service.js';
import { analyzeRequest, rewriteSearchQuery } from '../lib/ai-intelligence-pipeline.js';

const cache = new Map();
const CACHE_TTL = Number(process.env.MARKET_RESEARCH_CACHE_TTL_MS || 15 * 60 * 1000);
const REPORT_REUSE_TTL = Number(process.env.MARKET_RESEARCH_REUSE_TTL_MS || 24 * 60 * 60 * 1000);
const REPORT_VERSION = '2.0';
const WEB_URL = String(process.env.PUBLIC_WEB_URL || 'https://esyglob.in').replace(/\/$/, '');
const absolute = path => `${WEB_URL}${path}`;

function extractJson(text) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function roleContext(session) {
  if (session?.roles?.includes('seller')) return 'seller';
  if (session?.roles?.includes('buyer')) return 'buyer';
  return 'general';
}

function productRows(results) {
  return (results.products || []).map(product => ({
    product: product.name || 'Product',
    category: product.category || 'General',
    price: product.price != null ? `${product.currency || 'INR'} ${product.price}` : 'Request price',
    moq: product.minimumOrderQuantity != null ? `${product.minimumOrderQuantity} ${product.unit || 'units'}` : 'Ask seller',
    seller: product.sellerId?.companyName || 'Seller',
    verified: product.sellerId?.isVerified ? 'Yes' : 'No',
    link: absolute(`/products/${product._id}`),
    sellerLink: product.sellerId?._id ? absolute(`/manufacturers/${product.sellerId._id}`) : '',
  }));
}

function sellerRows(results) {
  return (results.suppliers || []).map(seller => ({
    seller: seller.companyName || seller.businessName || 'Seller',
    type: seller.companyType || 'supplier',
    country: seller.address?.country || 'Not specified',
    verified: seller.isVerified ? 'Yes' : 'No',
    trustScore: seller.trustScore ?? 'N/A',
    rating: seller.rating ?? 'N/A',
    link: absolute(`/manufacturers/${seller._id}`),
  }));
}

function serviceRows(results) {
  return (results.services || []).map(service => ({
    service: service.title,
    description: service.description || '',
    link: absolute(`/services/${service.key}`),
  }));
}

function fmtUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Unavailable';
  if (Math.abs(amount) >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
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
    productName: report.productName,
    country: report.country,
    reportVersion: report.reportVersion || REPORT_VERSION,
    status: 'ready',
    pdfStatus: persisted.pdfStatus || 'ready',
    previewUrl: persisted.previewUrl || `/api/market-insights/reports/${reportId}/pdf`,
    pdfUrl: `/api/market-insights/reports/${reportId}/pdf`,
    downloadUrl: persisted.downloadUrl || `/api/market-insights/reports/${reportId}/pdf?download=1`,
    pages: Number(persisted.pageCount || 0),
    fileSize: Number(persisted.fileSize || 0),
    generationTimeMs: Number(persisted.generationTimeMs || report.elapsedMs || 0),
    generatedAt: report.generatedAt || persisted.createdAt || new Date().toISOString(),
    createdAt: persisted.createdAt || report.createdAt || new Date().toISOString(),
    description: report.executiveSummary || report.summary || '',
  };
}

class MarketResearchService {
  static emit(emit, startedAt, event) {
    emit({
      elapsedMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  static step(emit, startedAt, agent, operation, progress, status = 'success', sourceCount = 0, datasetsCollected = 0) {
    this.emit(emit, startedAt, {
      type: 'step',
      agent,
      operation,
      progress,
      status,
      sourceCount,
      datasetsCollected,
    });
  }

  static async run({ userId, session, query, productName = '', country = '', category = '', mode = 'product_rd', force = false }, emit) {
    const startedAt = Date.now();
    const researchQuery = String(query || [productName, category, country].filter(Boolean).join(' ')).trim();
    
    if (researchQuery.length < 2) {
      throw Object.assign(new Error('Research request is required'), { statusCode: 400 });
    }

    // Generate query hash for caching
    const queryHash = crypto.createHash('sha256').update(JSON.stringify({
      researchQuery: researchQuery.toLowerCase(),
      productName: String(productName).trim().toLowerCase(),
      mode,
      country: String(country).trim().toLowerCase(),
      category: String(category).trim().toLowerCase(),
      reportVersion: REPORT_VERSION,
    })).digest('hex');

    const cacheKey = `${userId}:${queryHash}`;

    // Check memory cache
    const cached = cache.get(cacheKey);
    if (!force && cached && Date.now() - cached.createdAt < CACHE_TTL) {
      this.emit(emit, startedAt, { type: 'research_started', researchId: cached.report.reportId, cached: true, progress: 2 });
      this.emit(emit, startedAt, { type: 'report', report: cached.report, progress: 100 });
      return cached.report;
    }

    // Check database for reusable report
    const reusable = !force && await SavedResearchReport.findOne({
      userId,
      queryHash,
      status: 'active',
      pdfStatus: 'ready',
      createdAt: { $gte: new Date(Date.now() - REPORT_REUSE_TTL) },
    })
      .select('reportData reportVersion previewUrl downloadUrl pageCount fileSize generationTimeMs createdAt pdfStatus storageKey')
      .sort({ createdAt: -1 })
      .lean();

    if (reusable?.reportData) {
      const report = reportMetadata(reusable.reportData, reusable._id, reusable);
      this.emit(emit, startedAt, { type: 'research_started', researchId: report.reportId, cached: true, persisted: true, progress: 5 });
      this.step(emit, startedAt, 'Research Library', 'A current matching report was found and reused', 92, 'success');
      this.emit(emit, startedAt, { type: 'report', report, cached: true, progress: 100 });
      cache.set(cacheKey, { createdAt: Date.now(), report });
      return report;
    }

    // Start new research
    const researchId = `research-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    this.emit(emit, startedAt, { type: 'research_started', researchId, progress: 1 });
    this.step(emit, startedAt, 'Research Planner', 'Preparing evidence and source priorities', 4, 'success');

    // Collect data
    const terms = getSearchTerms(researchQuery, {
      keywords: [productName, category].filter(Boolean),
      countries: country ? [country] : [],
    });
    
    const filters = {
      keywords: terms,
      categories: category ? [category] : [],
      countries: country ? [country] : [],
    };

    const role = roleContext(session);
    const intelligence = analyzeRequest({ message: researchQuery, role });
    const rewrittenQuery = rewriteSearchQuery({
      message: researchQuery,
      intelligence: { ...intelligence, intent: 'market_research' },
    });

    this.step(emit, startedAt, 'Hybrid Research', 'Retrieving official, marketplace and knowledge evidence in parallel', 8, 'running');

    const [global, results, marketplaceMetrics, knowledgeDocuments] = await Promise.all([
      GlobalTradeResearchService.collect({ query: researchQuery, productName, country }),
      getAISearchResults({ query: rewrittenQuery, filters, userId }),
      MarketInsightsRepository.getMarketplaceData(productName || researchQuery, category, country),
      KnowledgeBaseService.retrieve({
        query: researchQuery,
        rewrittenQuery,
        role,
        intent: 'market_research',
        language: intelligence.language,
        limit: 4,
      }),
    ]);

    const connectedSources = global.sources.filter(source => source.status === 'connected').length;

    // Progress updates
    this.step(emit, startedAt, 'Official Data', 'World Bank country and macro trade indicators collected', 18, 'success', connectedSources, 1);
    this.step(emit, startedAt, 'Public Market Research', global.publicArticles.length ? `Reviewing ${global.publicArticles.length} recent public market records` : 'No recent public-market records passed source collection', 23, 'success', global.sources.length, global.publicArticles.length ? 2 : 1);
    this.step(emit, startedAt, 'HS & Customs', global.hsCode ? `Validating HS ${global.hsCode} through UN Comtrade` : 'HS code not supplied; product-level customs claims withheld', 28, 'success', global.sources.length, global.officialProductRows.length ? 2 : 1);
    this.step(emit, startedAt, 'Import / Export Intelligence', 'Comparing official import and export indicators', 38, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Industry & Competitor Research', 'Checking connected evidence for industry and competitor claims', 45, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Pricing Intelligence', 'Separating verified trade values from unavailable commercial pricing', 51, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Supply Chain & Logistics', 'Preparing customs, logistics and verification requirements', 57, 'success', global.sources.length, 2);
    this.step(emit, startedAt, 'Hybrid Retrieval', `${knowledgeDocuments.length} knowledge references and live marketplace evidence ranked`, 72, 'success', global.sources.length + knowledgeDocuments.length + 1, 4);

    // Build evidence
    const evidence = {
      request: researchQuery,
      hsCode: global.hsCode || 'unverified',
      targetCountry: global.target?.name || country || 'not specified',
      topMacroImporters: global.macroImports.slice(0, 4),
      topMacroExporters: global.macroExports.slice(0, 4),
      productLevelRecords: global.officialProductRows.slice(0, 4),
      marketplace: {
        productCount: marketplaceMetrics.productCount,
        supplierCount: marketplaceMetrics.supplierCount,
        verifiedSupplierCount: marketplaceMetrics.verifiedSupplierCount,
        rfqCount: marketplaceMetrics.rfqCount,
        averagePrice: marketplaceMetrics.averagePrice,
        averageMoq: marketplaceMetrics.averageMoq,
      },
      knowledge: KnowledgeBaseService.format(knowledgeDocuments).slice(0, 3200),
      dataGaps: global.gaps,
    };

    this.step(emit, startedAt, 'Trade Analyst', 'Synthesizing evidence and recommendations', 78, 'running', global.sources.length, 3);

    // AI Analysis
    let ai = null;
    let generated = null;
    
    try {
      ai = await AIChatService.callOllama(
        `Read, compare and reason over all supplied evidence. Do not copy knowledge passages. Return valid JSON with {"summary":"90-140 word executive summary","insights":["5 concise evidence-based findings"],"trends":["4 market trends"],"opportunities":["4 commercially useful opportunities"],"recommendations":["5 practical actions"],"risks":["4 material risks"],"outlook":"60-100 word future outlook","conclusion":"40-70 word conclusion"}. Reconcile marketplace, knowledge and official evidence, remove duplication, distinguish product-level facts from macro context, and explicitly disclose missing HS, market-size, CAGR, pricing or tariff data. Never invent figures, companies or sources. Evidence: ${JSON.stringify(evidence).slice(0, 7600)}`,
        [],
        'You are a senior evidence-first international trade and market intelligence analyst. Synthesize sources into original, decision-oriented analysis. Never expose retrieval metadata or convert macro totals into product market size.',
        { maxTokens: 1100, temperature: 0.12, timeoutMs: 65000, jsonMode: true }
      );
      generated = extractJson(ai.message);
    } catch (aiError) {
      console.warn('AI analysis failed, using evidence-only report:', aiError.message);
    }

    // Fallback generated content
    generated ||= {
      summary: `This report evaluates ${productName || researchQuery} using connected official trade indicators, recent public research records and live EsyGlob marketplace signals. ${global.officialProductRows.length ? `Product-level records associated with HS ${global.hsCode} are presented separately.` : 'A verified HS classification was not available, so no product market size, CAGR or product trade total is claimed.'} The analysis focuses on evidence quality, supply and demand signals, commercial validation steps and practical market-entry decisions.`,
      insights: [
        'Macro trade indicators describe total goods and services, not this product.',
        global.hsCode ? `HS ${global.hsCode} was used for the connected customs query.` : 'A verified HS classification is required for defensible product-level customs analysis.',
        `${marketplaceMetrics.productCount} matching marketplace products and ${marketplaceMetrics.supplierCount} suppliers were identified.`,
        'Commercial prices, freight and duties require current quotations and destination-specific verification.',
        'Marketplace activity is a platform signal and not a substitute for total market size.',
      ],
      trends: [
        'Buyers increasingly require traceable compliance and supplier-verification evidence.',
        'Flexible MOQ and sampling can reduce entry risk in unfamiliar markets.',
        'Landed-cost transparency is becoming central to supplier comparison.',
        'Digital sourcing signals should be validated against primary customs and industry datasets.',
      ],
      opportunities: [
        'Shortlist verified suppliers that can provide comparable specifications and documentation.',
        'Use active RFQ signals to validate buyer language, quantities and delivery expectations.',
        'Prioritize markets where compliance requirements and logistics can be verified before contracting.',
        'Differentiate offers through responsive quotations, sample readiness and clear landed-cost assumptions.',
      ],
      recommendations: [
        'Confirm the HS classification with a licensed customs professional.',
        'Validate destination tariffs and certifications before contracting.',
        'Request comparable landed-cost quotations from shortlisted suppliers.',
        'Run supplier due diligence before samples, deposits or production commitments.',
        'Refresh primary-source data immediately before a material trade decision.',
      ],
      risks: [
        'Using macro trade totals as product demand would be misleading.',
        'Tariffs and compliance requirements can change by classification and origin.',
        'Marketplace listing prices may exclude freight, tax, tooling and customization.',
        'Unverified supplier claims can create quality, delivery and payment exposure.',
      ],
      outlook: 'Future opportunity depends on verified product classification, buyer-specific demand validation and supplier execution capability. Businesses that combine primary-source trade research with live RFQs, documented compliance and disciplined landed-cost comparisons will be better positioned to identify defensible opportunities.',
      conclusion: 'Use this report as a structured research starting point. Confirm classification, regulation, pricing, logistics and counterparty evidence before committing commercial resources.',
    };

    // Build charts and tables
    const globalTables = [
      ...(global.officialProductRows.length ? [{
        title: `Verified product trade — HS ${global.hsCode}`,
        columns: ['rank', 'reporter', 'partner', 'hsCode', 'flow', 'reportYear', 'sourceDataYear', 'valueUsd'],
        rows: global.officialProductRows.slice(0, 5).map(row => ({ ...row, reportYear: 2026, sourceDataYear: row.period })),
      }] : []),
      {
        title: 'Largest import markets — macro context',
        columns: ['rank', 'country', 'valueUsd', 'reportYear', 'sourceDataYear', 'scope'],
        rows: global.macroImports.slice(0, 5).map(row => ({ ...row, valueUsd: fmtUsd(row.valueUsd), reportYear: 2026, sourceDataYear: row.year })),
      },
      {
        title: 'Largest export markets — macro context',
        columns: ['rank', 'country', 'valueUsd', 'reportYear', 'sourceDataYear', 'scope'],
        rows: global.macroExports.slice(0, 5).map(row => ({ ...row, valueUsd: fmtUsd(row.valueUsd), reportYear: 2026, sourceDataYear: row.year })),
      },
      ...(global.publicArticles.length ? [{
        title: 'Recent public market & industry sources',
        columns: ['title', 'domain', 'date', 'url'],
        rows: global.publicArticles.slice(0, 5),
      }] : []),
    ];

    const charts = [
      {
        type: 'bar',
        title: 'Macro import market comparison',
        data: global.macroImports.slice(0, 6).map(row => ({ label: row.country, value: row.valueUsd })),
      },
      {
        type: 'bar',
        title: 'Macro export market comparison',
        data: global.macroExports.slice(0, 6).map(row => ({ label: row.country, value: row.valueUsd })),
      },
      {
        type: 'pie',
        title: 'EsyGlob marketplace signal distribution',
        data: [
          { label: 'Matching products', value: marketplaceMetrics.productCount || 0 },
          { label: 'Suppliers', value: marketplaceMetrics.supplierCount || 0 },
          { label: 'Verified suppliers', value: marketplaceMetrics.verifiedSupplierCount || 0 },
          { label: 'Active RFQs', value: marketplaceMetrics.rfqCount || 0 },
          { label: 'Quotations', value: marketplaceMetrics.quotationCount || 0 },
          { label: 'Orders', value: marketplaceMetrics.orderCount || 0 },
        ],
      },
      {
        type: 'line',
        title: 'Marketplace sourcing funnel',
        data: [
          { label: 'Products', value: marketplaceMetrics.productCount || 0 },
          { label: 'Suppliers', value: marketplaceMetrics.supplierCount || 0 },
          { label: 'Verified', value: marketplaceMetrics.verifiedSupplierCount || 0 },
          { label: 'RFQs', value: marketplaceMetrics.rfqCount || 0 },
          { label: 'Quotes', value: marketplaceMetrics.quotationCount || 0 },
          { label: 'Orders', value: marketplaceMetrics.orderCount || 0 },
        ],
      },
    ];

    const topImportMarkets = global.macroImports.slice(0, 3).map(row => row.country).filter(Boolean);
    const topExportMarkets = global.macroExports.slice(0, 3).map(row => row.country).filter(Boolean);

    const priceSummary = marketplaceMetrics.averagePrice
      ? `The average listed marketplace price among matching records is approximately ${fmtUsd(marketplaceMetrics.averagePrice)}. This is a listing signal, not a transaction benchmark or landed cost.`
      : 'No defensible average marketplace price was available. Obtain normalized quotations using identical specifications, quantities, Incoterms and delivery destinations.';

    // Build report sections
    const sections = [
      {
        type: 'overview',
        title: 'Market Overview & Research Scope',
        summary: global.hsCode
          ? `The research covers ${productName || researchQuery} with HS ${global.hsCode} used for connected customs queries. Classification status is ${global.hsResolution?.status || 'unverified'} and must still be confirmed for the exact product specification and destination.`
          : `The research covers ${productName || researchQuery}, but no defensible HS classification was available. Product-level market size, CAGR, tariffs and customs totals are therefore not estimated.`,
        points: generated.insights || [],
        confidence: global.hsResolution?.selected ? 92 : global.hsCode ? 72 : 60,
        evidenceType: 'official-data-and-analysis',
      },
      {
        type: 'market-size',
        title: 'Market Size, Growth & CAGR',
        summary: global.officialProductRows.length
          ? `Connected product-level customs rows for HS ${global.hsCode} are included in the supporting tables. The available period coverage is insufficient to present a verified global market-size forecast or CAGR without additional longitudinal industry data.`
          : 'A verified product market size and CAGR are not available from the connected evidence. Macro import and export indicators are presented only as country-level trade capacity context.',
        points: [
          'Do not use displayed macro totals as product revenue or demand.',
          'Connect a product-specific time series before publishing market-size or CAGR claims.',
          `The report compares ${global.macroImports.length} macro import markets and ${global.macroExports.length} macro export markets.`,
        ],
        confidence: global.officialProductRows.length ? 76 : 58,
        evidenceType: 'scope-controlled-analysis',
      },
      {
        type: 'demand',
        title: 'Demand Analysis',
        summary: `Demand evidence combines ${marketplaceMetrics.rfqCount || 0} active EsyGlob RFQ signals, marketplace engagement and connected country indicators. These signals indicate sourcing activity but do not represent the entire addressable market.`,
        points: [
          `Target market: ${global.target?.name || country || 'Global / not specified'}.`,
          topImportMarkets.length ? `Leading macro import contexts displayed: ${topImportMarkets.join(', ')}.` : 'No connected macro import ranking was available.',
          'Validate buyer segments through interviews, RFQ specifications and repeat-order evidence.',
        ],
        confidence: 78,
        evidenceType: 'marketplace-and-official-context',
      },
      {
        type: 'supply',
        title: 'Supply & Production Landscape',
        summary: `EsyGlob returned ${marketplaceMetrics.productCount || 0} matching products from ${marketplaceMetrics.supplierCount || 0} suppliers, including ${marketplaceMetrics.verifiedSupplierCount || 0} verified suppliers.`,
        points: [
          topExportMarkets.length ? `Leading macro export contexts displayed: ${topExportMarkets.join(', ')}.` : 'No connected macro export ranking was available.',
          `Average MOQ signal: ${marketplaceMetrics.averageMoq ? Math.round(marketplaceMetrics.averageMoq).toLocaleString('en-US') : 'not available'}.`,
          'Factory capacity, quality systems and export history require document and site-level verification.',
        ],
        confidence: 80,
        evidenceType: 'marketplace-and-official-context',
      },
      {
        type: 'pricing',
        title: 'Price & Commercial Analysis',
        summary: priceSummary,
        points: [
          `Average quotation signal: ${marketplaceMetrics.averageQuotationPrice ? fmtUsd(marketplaceMetrics.averageQuotationPrice) : 'not available'}.`,
          `Average lead-time signal: ${marketplaceMetrics.averageLeadTime ? `${Math.round(marketplaceMetrics.averageLeadTime)} days` : 'not available'}.`,
          'Normalize currency, unit, material grade, quality level, packaging, tooling, tax, freight and payment terms before comparing offers.',
        ],
        confidence: marketplaceMetrics.averagePrice ? 72 : 55,
        evidenceType: 'marketplace-analysis',
      },
      {
        type: 'trade',
        title: 'Import, Export & Regional Insights',
        summary: 'World Bank country rankings provide official aggregate imports and exports of goods and services as macroeconomic context. Product-level customs rows are shown separately when a valid HS query returned data.',
        points: [
          `Top ${Math.min(5, global.macroImports.length)} import and ${Math.min(5, global.macroExports.length)} export contexts are included in the report tables.`,
          global.target ? `Target-country indicators were matched for ${global.target.name}.` : 'No target-country record was selected.',
          'Review source year and scope before comparing countries.',
        ],
        confidence: 92,
        evidenceType: 'official-data',
      },
      {
        type: 'competition',
        title: 'Competitive Landscape & Major Participants',
        summary: 'Competitive intensity is assessed from live marketplace supply, supplier verification and public research records. The report does not label companies as market leaders without a verifiable market-share source.',
        points: [
          `${results.suppliers.length || 0} related suppliers are included as sourcing candidates, not ranked market leaders.`,
          `${results.products.length || 0} related product listings provide specification and pricing reference points.`,
          'Compare certification scope, production capacity, lead time, MOQ, export experience and buyer reviews.',
        ],
        confidence: 75,
        evidenceType: 'marketplace-analysis',
      },
      {
        type: 'trends',
        title: 'Key Trends & Emerging Opportunities',
        summary: 'The following themes translate the available evidence into testable commercial hypotheses rather than unsupported forecasts.',
        points: [...(generated.trends || []), ...(generated.opportunities || [])].slice(0, 8),
        confidence: 70,
        evidenceType: 'ai-assisted-analysis',
      },
      {
        type: 'swot',
        title: 'SWOT Analysis',
        summary: 'A decision framework based on evidence coverage and marketplace conditions.',
        points: [
          `Strength - Access to ${marketplaceMetrics.supplierCount || 0} matching suppliers and ${marketplaceMetrics.verifiedSupplierCount || 0} verified profiles.`,
          `Weakness - ${global.hsCode ? 'Product classification still requires destination confirmation.' : 'No verified HS classification or product-level market-size series.'}`,
          `Opportunity - ${(generated.opportunities || [])[0] || 'Validate demand through targeted RFQs and comparable supplier quotations.'}`,
          `Threat - ${(generated.risks || [])[0] || 'Regulatory, quality, logistics and counterparty conditions can change landed economics.'}`,
        ],
        confidence: 72,
        evidenceType: 'analyst-framework',
      },
      {
        type: 'value-chain',
        title: 'Value Chain, Logistics & Compliance',
        summary: 'The commercial value chain runs from specification and supplier qualification through production, inspection, export documentation, freight, customs, delivery and after-sales support.',
        points: [
          'Confirm specification, HS classification and applicable standards before quotation comparison.',
          'Audit supplier capacity, quality controls, traceability and subcontracting exposure.',
          'Obtain current freight, insurance, tax and customs-broker quotations.',
          'Define inspection, payment protection, delivery acceptance and dispute milestones.',
        ],
        confidence: 86,
        evidenceType: 'official-reference-and-analysis',
      },
      {
        type: 'risks',
        title: 'Market Challenges & Risk Factors',
        summary: 'Material risks are stated separately so they can be assigned controls before market entry or sourcing commitment.',
        points: generated.risks || [],
        confidence: 84,
        evidenceType: 'evidence-and-risk-analysis',
      },
      {
        type: 'outlook',
        title: 'Future Outlook & AI Recommendations',
        summary: generated.outlook || 'Future opportunity depends on validated classification, demand evidence and execution capability.',
        points: generated.recommendations || [],
        confidence: 72,
        evidenceType: 'ai-assisted-analysis',
      },
      {
        type: 'conclusion',
        title: 'Conclusion',
        summary: generated.conclusion || 'Use the findings as a structured starting point and verify all material commercial and regulatory assumptions with primary evidence.',
        points: [
          'Prioritize validation tasks that can materially change landed cost, compliance or supplier risk.',
          'Refresh the report when classifications, regulations, quotations or marketplace conditions change.',
        ],
        confidence: 82,
        evidenceType: 'analyst-conclusion',
      },
    ];

    // Add public articles section if available
    if (global.publicArticles.length) {
      sections.push({
        type: 'narrative',
        title: 'Recent market & industry reading',
        summary: 'Recent public records are provided as a research reading list. Their headlines are not treated as verified statistics without primary-source confirmation.',
        points: [
          `${global.publicArticles.length} unique records were retained from targeted searches.`,
          'Open the source links to evaluate methodology, publication date and primary evidence.',
        ],
        confidence: 70,
        evidenceType: 'public-market-data',
      });
    }

    // Add Porter's Five Forces for non-country reports
    if (mode !== 'country_rd') {
      sections.push({
        type: 'forces',
        title: "Porter's Five Forces",
        summary: 'Indicative competitive-force assessment; validate with product-specific market-share, buyer concentration and capacity data.',
        points: [
          'Supplier power - rises when compliant production capacity or certified inputs are concentrated.',
          'Buyer power - rises when specifications are standardized and comparable suppliers are abundant.',
          'New entrants - face compliance, working-capital, tooling and trust-building barriers.',
          'Substitutes - depend on performance, regulation and total-cost alternatives.',
          'Rivalry - should be tested through normalized quotes, service levels and differentiation evidence.',
        ],
        confidence: 62,
        evidenceType: 'strategic-framework',
      });
    }

    // Marketplace section
    const marketplaceSection = {
      title: 'Related Opportunities on Esyglob',
      summary: 'These live marketplace matches complement the global research and are not used as official trade statistics.',
      metrics: marketplaceMetrics,
      tables: [
        ...(results.products.length ? [{
          title: 'Related products',
          columns: ['product', 'category', 'price', 'moq', 'seller', 'verified', 'link', 'sellerLink'],
          rows: productRows(results),
        }] : []),
        ...(results.suppliers.length ? [{
          title: 'Related suppliers and manufacturers',
          columns: ['seller', 'type', 'country', 'verified', 'trustScore', 'rating', 'link'],
          rows: sellerRows(results),
        }] : []),
        ...(results.services.length ? [{
          title: 'Related services',
          columns: ['service', 'description', 'link'],
          rows: serviceRows(results),
        }] : []),
      ],
    };

    const marketplaceSources = [{
      name: 'EsyGlob Marketplace — related opportunities',
      type: 'marketplace',
      url: WEB_URL,
      status: 'connected',
    }];

    const knowledgeSources = knowledgeDocuments.map(document => ({
      name: document.title,
      type: 'AI knowledge database',
      status: 'connected',
      version: document.version,
    }));

    // Build final report object
    const report = {
      id: researchId,
      reportType: mode,
      query: researchQuery,
      title: `${productName || researchQuery} — Global Trade Intelligence`,
      executiveSummary: generated.summary,
      reportYear: 2026,
      productName: productName || researchQuery,
      country,
      category,
      reportVersion: REPORT_VERSION,
      kpis: [
        { label: 'Official sources', value: connectedSources, trend: 'stable', note: 'Connected datasets with returned data' },
        { label: 'HS status', value: global.hsCode || 'Unverified', trend: 'stable', note: global.hsCode ? 'User-supplied classification' : 'Needed for product-level trade' },
        { label: 'Markets compared', value: global.macroImports.length, trend: 'stable', note: 'Macro trade context' },
        { label: 'Product records', value: global.officialProductRows.length, trend: 'stable', note: 'Connected UN Comtrade rows' },
      ],
      sections,
      charts,
      tables: globalTables,
      recommendations: (generated.recommendations || []).slice(0, 4),
      risks: (generated.risks || []).slice(0, 3).map((reason, index) => ({
        label: `Research risk ${index + 1}`,
        level: 'medium',
        reason: String(reason),
      })),
      sources: [...global.sources, ...knowledgeSources, ...marketplaceSources],
      dataGaps: global.gaps,
      dataIntegrityNotes: global.gaps,
      marketplaceSection,
      model: ai?.model || process.env.OLLAMA_MODEL || 'qwen2.5:3b',
      provider: ai?.provider || 'deterministic-evidence',
      generatedBy: 'EsyGlob AI',
      platformName: 'EsyGlob',
      sourceCount: global.sources.length + knowledgeSources.length + 1,
      datasetsCollected: 4,
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
    };

    // Update title
    report.title = `${productName || researchQuery} - Global Market Intelligence`;

    // Emit section ready events
    sections.forEach((section, index) => {
      this.emit(emit, startedAt, {
        type: 'section_ready',
        index,
        progress: 82 + Math.floor(index * 11 / Math.max(1, sections.length)),
        sourceCount: report.sourceCount,
        datasetsCollected: 4,
      });
    });

    this.step(emit, startedAt, 'Evidence Review', 'Validating provenance, scope labels and data gaps', 94, 'success', report.sourceCount, 3);
    this.step(emit, startedAt, 'PDF Designer', 'Designing cover, contents, charts, tables and report pages', 96, 'running', report.sourceCount, 3);

    // ========== SAVE REPORT WITH PDF ==========
    const saved = new SavedResearchReport({
      userId,
      roleContext: roleContext(session),
      reportType: ['product_rd', 'country_rd', 'opportunity_finder'].includes(mode) ? mode : 'product_rd',
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
      console.log(`Generating PDF for report: ${saved._id}`);
      
      // Generate PDF
      const pdf = await buildMarketInsightPdf(report, {
        reportId: report.id,
        generatedAt: report.generatedAt,
        query: researchQuery,
        reportVersion: REPORT_VERSION,
      });

      console.log(`PDF generated, size: ${pdf.length || Buffer.byteLength(pdf)} bytes`);

      // Try filesystem storage first
      let storedPdf;
      try {
        storedPdf = await MarketReportStorageService.write(saved._id, pdf);
        console.log(`PDF saved to filesystem: ${saved._id}, key: ${storedPdf.storageKey}`);
      } catch (storageError) {
        console.warn(`Filesystem storage failed, using MongoDB fallback:`, storageError.message);
        // MongoDB fallback
        storedPdf = {
          storageKey: '',
          storageProvider: 'mongodb',
          fileSize: pdf.length || Buffer.byteLength(pdf),
        };
        saved.pdfData = pdf;
      }

      // Update saved report with success
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
      console.log(`Report saved successfully: ${saved._id}, pdfStatus: ${saved.pdfStatus}`);

    } catch (error) {
      console.error(`PDF generation/storage failed for report ${saved._id}:`, error.message);
      
      // Cleanup failed filesystem storage
      if (saved.storageKey) {
        await MarketReportStorageService.remove(saved.storageKey).catch(() => {});
      }
      
      // Save with failed status
      saved.pdfStatus = 'failed';
      saved.pdfError = String(error.message || error).slice(0, 500);
      saved.storageKey = '';
      saved.storageProvider = 'mongodb';
      saved.fileSize = 0;
      saved.reportData = report;
      
      await saved.save().catch((saveError) => {
        console.error('Failed to save error state:', saveError);
      });
      
      throw Object.assign(
        new Error('The market analysis completed, but the PDF report could not be prepared. Please retry.'),
        { cause: error }
      );
    }

    // Build completed report metadata
    const completedReport = reportMetadata(report, saved._id, saved);

    // Cache the result
    cache.set(cacheKey, { createdAt: Date.now(), report: completedReport });

    // Final progress
    this.step(emit, startedAt, 'Report Generator', 'Professional market intelligence PDF completed and saved', 99, 'success', report.sourceCount, 3);
    
    // Emit final report
    this.emit(emit, startedAt, {
      type: 'report',
      report: completedReport,
      progress: 100,
      sourceCount: report.sourceCount,
      datasetsCollected: 4,
    });

    console.log(`Market research completed: ${saved._id}, elapsed: ${Date.now() - startedAt}ms`);
    return completedReport;
  }
}

export default MarketResearchService;