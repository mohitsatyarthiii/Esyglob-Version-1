import crypto from 'crypto';
import GlobalTradeResearchService from './global-trade-research.service.js';
import KnowledgeBaseService from './knowledge-base.service.js';
import MarketReportStorageService from './market-report-storage.service.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { getAISearchResults } from '../lib/ai-marketplace-context.js';
import { analyzeRequest, rewriteSearchQuery } from '../lib/ai-intelligence-pipeline.js';
import { buildMarketInsightPdf } from '../lib/market-insight-pdf.js';
import { buildMarketInsightHtml } from '../lib/market-insight-html.js';
import TradeIntentService from './trade-intent.service.js';
import TradeKnowledgeService from './trade-knowledge.service.js';
import { config } from '../config/env.js';
import MarketInsightReportV3Service, { MARKET_INSIGHT_REPORT_VERSION } from './market-insight-report-v3.service.js';

const cache = new Map();
const inFlight = new Map();
const CACHE_TTL = Math.max(60_000, Number(process.env.MARKET_INSIGHT_MEMORY_TTL_MS || 15 * 60 * 1000));
const REPORT_REUSE_TTL = Math.max(60 * 60 * 1000, Number(process.env.MARKET_INSIGHT_REPORT_REUSE_TTL_MS || 8 * 24 * 60 * 60 * 1000));
const CACHE_MAX_ENTRIES = Math.max(25, Number(process.env.MARKET_INSIGHT_MEMORY_CACHE_MAX || 250));
const AI_SYNTHESIS_TIMEOUT_MS = Math.max(10_000, Number(process.env.MARKET_RESEARCH_AI_TIMEOUT_MS || 45_000));
const REPORT_VERSION = MARKET_INSIGHT_REPORT_VERSION;

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
    dataVersion: persisted.dataVersion || report.dataVersion || '',
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

function relevanceToken(value) {
  const token = clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function filterKnowledgeDocuments(documents, productName) {
  const ignored = new Set(['from', 'into', 'market', 'product', 'trade', 'industry', 'analysis', 'global']);
  const productTokens = clean(productName).split(/\s+/).map(relevanceToken).filter(token => token.length >= 3 && !ignored.has(token));
  if (!productTokens.length) return documents;
  return documents.map(document => {
    const titleTokens = new Set(clean(document.title).split(/\s+/).map(relevanceToken));
    const keywordText = [document.category, ...(asArray(document.keywords)), document.metadata?.productName, document.metadata?.hsCode].filter(Boolean).join(' ');
    const bodyText = clean(document.content || document.retrievedChunks?.map(chunk => chunk.content).join(' ') || document.summary || document.overview).toLowerCase();
    const score = productTokens.reduce((total, token) => total
      + (titleTokens.has(token) ? 6 : 0)
      + (new RegExp(`\\b${token}(?:s|es|ies)?\\b`, 'i').test(keywordText) ? 3 : 0)
      + (new RegExp(`\\b${token}(?:s|es|ies)?\\b`, 'i').test(bodyText) ? 1 : 0), 0);
    return { document, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.document);
}

function marketplaceSummary(results = {}) {
  return {
    products: asArray(results.products).length,
    suppliers: asArray(results.suppliers).length,
    categories: asArray(results.categories).length,
    services: asArray(results.services).length,
  };
}

function reportForStorage(report) {
  const stored = { ...report };
  delete stored.html;
  return stored;
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
    columns: ['Flow', 'Reporter', 'Partner', 'HS code', 'Period', 'Value', 'Net weight'],
    rows: product.map(row => [row.flow, row.reporter, row.partner, row.hsCode, row.period, fmtUsd(row.valueUsd), row.netWeightKg ? `${Math.round(row.netWeightKg).toLocaleString('en-US')} kg` : 'Not reported']),
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

function evidenceSections(global = {}, productName = '', country = '') {
  const sections = [];
  const hsRows = asArray(global.relatedHsCodes).filter(row => row.code);
  if (global.hsCode || hsRows.length) {
    sections.push({
      key: 'verified-product-classification',
      title: 'Product Classification & HS Code Analysis',
      evidenceNote: 'Classification candidates come from attributed HS classification references and require specification-level confirmation.',
      paragraphs: [
        global.hsCode
          ? `The working product classification for ${productName} is HS ${global.hsCode}. Customs treatment depends on the final code depth, product composition, processing and intended use.`
          : `No verified HS classification was available for ${productName}. Product-level customs conclusions are therefore withheld until classification is confirmed.`,
      ],
      insights: ['Confirm classification with the destination customs authority or a qualified customs broker before shipment.'],
      tables: hsRows.length ? [{
        title: 'HS classification candidates',
        columns: ['HS code', 'Description', 'Level', 'Source'],
        rows: hsRows.map(row => [row.code, row.description || 'Description unavailable', row.level || 'Not specified', row.source]),
        source: [...new Set(hsRows.map(row => row.source).filter(Boolean))].join('; '),
      }] : [],
    });
  }

  const profile = global.countryProfile;
  if (profile?.series) {
    const indicatorRows = Object.values(profile.series).filter(series => series.latest).map(series => [
      series.label,
      Number(series.latest.value).toLocaleString('en-US', { maximumFractionDigits: 2 }),
      series.latest.year,
      series.latest.status || 'Published observation',
    ]);
    sections.push({
      key: 'official-country-context',
      title: `${profile.name} — Country & Trade Context`,
      evidenceNote: 'Country indicators are official World Development Indicators and are not product-specific unless stated.',
      paragraphs: [`${profile.name} is assessed using current official macroeconomic and trade indicators. These indicators provide operating context for ${productName}, while product-level conclusions remain grounded in HS-specific observations.`],
      insights: [profile.region ? `Region: ${profile.region}.` : '', profile.currency ? `Local currency: ${profile.currency}.` : '', profile.ports?.length ? `Major logistics gateways include ${profile.ports.join(', ')}.` : ''].filter(Boolean),
      tables: indicatorRows.length ? [{ title: 'Latest official country indicators', columns: ['Indicator', 'Value', 'Year', 'Observation status'], rows: indicatorRows, source: profile.source }] : [],
    });
  }

  const historical = asArray(global.historicalTrade);
  if (historical.length) {
    const importSeries = historical.filter(row => row.flow === 'Import');
    const exportSeries = historical.filter(row => row.flow === 'Export');
    sections.push({
      key: 'verified-historical-trade',
      title: 'Historical Import & Export Performance',
      evidenceNote: `Product observations cover requested periods ${asArray(global.requestedPeriods).join('–')} where available. Missing years are not interpolated.`,
      paragraphs: [`The historical series contains ${historical.length} verified flow-period observations for ${productName}${country ? ` in ${country}` : ''}. Growth rates are calculated only when consecutive published observations are available.`],
      tables: [{
        title: 'Historical product trade',
        columns: ['Flow', 'Year', 'Trade value', 'Net weight', 'YoY growth', 'Observations'],
        rows: historical.map(row => [row.flow, row.period, fmtUsd(row.valueUsd), row.netWeightKg ? `${Math.round(row.netWeightKg).toLocaleString('en-US')} kg` : 'Not reported', row.growthPercent === null ? 'Not available' : `${row.growthPercent}%`, row.observations]),
        source: 'UN Comtrade',
      }],
      charts: [
        importSeries.length > 1 ? { type: 'line', title: 'Product import value trend', data: importSeries.map(row => ({ label: row.period, value: row.valueUsd })), source: 'UN Comtrade' } : null,
        exportSeries.length > 1 ? { type: 'line', title: 'Product export value trend', data: exportSeries.map(row => ({ label: row.period, value: row.valueUsd })), source: 'UN Comtrade' } : null,
      ].filter(Boolean),
    });
  }

  const topImporters = asArray(global.topImporters);
  const topExporters = asArray(global.topExporters);
  if (topImporters.length || topExporters.length) {
    sections.push({
      key: 'observed-global-product-markets',
      title: 'Leading Product Importers & Exporters',
      evidenceNote: 'Rankings cover the explicitly labelled monitored set of major reporting economies, not every global reporter.',
      paragraphs: [`The connected UN Comtrade sample returned ${topImporters.length} importer observations and ${topExporters.length} exporter observations for the latest requested period. Observed shares describe only the represented dataset.`],
      tables: [
        topImporters.length ? { title: 'Leading import markets in monitored set', columns: ['Rank', 'Country', 'Value', 'Net weight', 'Observed share', 'Year'], rows: topImporters.map(row => [row.rank, row.country, fmtUsd(row.valueUsd), row.netWeightKg ? `${Math.round(row.netWeightKg).toLocaleString('en-US')} kg` : 'Not reported', row.observedSharePercent === null ? 'Not available' : `${row.observedSharePercent}%`, row.period]), source: 'UN Comtrade' } : null,
        topExporters.length ? { title: 'Leading export markets in monitored set', columns: ['Rank', 'Country', 'Value', 'Net weight', 'Observed share', 'Year'], rows: topExporters.map(row => [row.rank, row.country, fmtUsd(row.valueUsd), row.netWeightKg ? `${Math.round(row.netWeightKg).toLocaleString('en-US')} kg` : 'Not reported', row.observedSharePercent === null ? 'Not available' : `${row.observedSharePercent}%`, row.period]), source: 'UN Comtrade' } : null,
      ].filter(Boolean),
      charts: [
        topImporters.length > 1 ? { type: 'bar', title: 'Observed import market comparison', data: topImporters.slice(0, 10).map(row => ({ label: row.country, value: row.valueUsd })), source: 'UN Comtrade' } : null,
        topExporters.length > 1 ? { type: 'bar', title: 'Observed export market comparison', data: topExporters.slice(0, 10).map(row => ({ label: row.country, value: row.valueUsd })), source: 'UN Comtrade' } : null,
        topImporters.length > 2 ? { type: 'pie', title: 'Observed importer share distribution', data: topImporters.slice(0, 8).map(row => ({ label: row.country, value: row.valueUsd })), source: 'UN Comtrade — observed monitored set' } : null,
      ].filter(Boolean),
    });
  }

  const importPartners = asArray(global.importPartners);
  const exportPartners = asArray(global.exportPartners);
  if (importPartners.length || exportPartners.length) {
    const partnerCoverage = importPartners[0]?.coverage || exportPartners[0]?.coverage || 'Selected major trading partners';
    sections.push({
      key: 'bilateral-partner-structure',
      title: 'Trade Partners & Bilateral Flow Structure',
      evidenceNote: `Partner rankings cover ${partnerCoverage} returned by UN Comtrade.`,
      paragraphs: [`Partner-level observations identify the trade corridors represented in the connected dataset for ${country || 'the selected reporting scope'}. The requested origin scope is ${global.originScope?.name || 'not constrained'}. They support corridor prioritization but do not replace a complete customs extract.`],
      tables: [
        importPartners.length ? { title: 'Observed import-origin partners', columns: ['Rank', 'Partner', 'Value', 'Net weight', 'Observed share', 'Year'], rows: importPartners.map(row => [row.rank, row.country, fmtUsd(row.valueUsd), row.netWeightKg ? `${Math.round(row.netWeightKg).toLocaleString('en-US')} kg` : 'Not reported', row.observedSharePercent === null ? 'Not available' : `${row.observedSharePercent}%`, row.period]), source: 'UN Comtrade' } : null,
        exportPartners.length ? { title: 'Observed export-destination partners', columns: ['Rank', 'Partner', 'Value', 'Net weight', 'Observed share', 'Year'], rows: exportPartners.map(row => [row.rank, row.country, fmtUsd(row.valueUsd), row.netWeightKg ? `${Math.round(row.netWeightKg).toLocaleString('en-US')} kg` : 'Not reported', row.observedSharePercent === null ? 'Not available' : `${row.observedSharePercent}%`, row.period]), source: 'UN Comtrade' } : null,
      ].filter(Boolean),
      charts: importPartners.length > 1 ? [{ type: 'bar', title: 'Observed import partner concentration', data: importPartners.slice(0, 10).map(row => ({ label: row.country, value: row.valueUsd })), source: 'UN Comtrade' }] : [],
    });
  }

  const articles = asArray(global.publicArticles);
  if (articles.length) {
    sections.push({
      key: 'current-market-signals',
      title: 'Current Market Signals & Related Intelligence',
      evidenceNote: 'Public articles are supporting qualitative signals; they are not used as numerical trade evidence.',
      paragraphs: [`The collection engine identified ${articles.length} recent public market signals related to ${productName}. These sources should be reviewed for developments affecting demand, policy, production, logistics or pricing.`],
      tables: [{ title: 'Recent supporting market signals', columns: ['Date', 'Title', 'Publisher domain', 'Language'], rows: articles.slice(0, 15).map(row => [row.date || 'Not reported', row.title, row.domain || 'Not reported', row.language || 'Not reported']), source: 'GDELT public news index' }],
    });
  }
  return sections;
}

function assessEvidenceQuality(global = {}, knowledgeDocuments = []) {
  const checks = [
    { key: 'classification', weight: 15, passed: Boolean(global.hsCode) },
    { key: 'historicalTrade', weight: 20, passed: asArray(global.historicalTrade).length >= 2 },
    { key: 'productTrade', weight: 15, passed: asArray(global.officialProductRows).length > 0 },
    { key: 'globalRankings', weight: 15, passed: asArray(global.topImporters).length > 0 || asArray(global.topExporters).length > 0 },
    { key: 'partnerTrade', weight: 10, passed: asArray(global.importPartners).length > 0 || asArray(global.exportPartners).length > 0 },
    { key: 'countryContext', weight: 10, passed: Boolean(global.countryProfile) || !global.targetScope?.name },
    { key: 'sourceAttribution', weight: 10, passed: asArray(global.sources).some(source => source.status === 'connected') },
    { key: 'knowledgeContext', weight: 5, passed: knowledgeDocuments.length > 0 },
  ];
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  return {
    score,
    grade: score >= 80 ? 'strong' : score >= 55 ? 'moderate' : 'limited',
    checks,
    missingEvidence: checks.filter(check => !check.passed).map(check => check.key),
    verifiedNumericalObservations: asArray(global.officialProductRows).length
      + asArray(global.historicalTrade).length
      + asArray(global.topImporters).length
      + asArray(global.topExporters).length
      + asArray(global.importPartners).length
      + asArray(global.exportPartners).length,
  };
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
${JSON.stringify({
  hsCode: global.hsCode,
  relatedHsCodes: asArray(global.relatedHsCodes).slice(0, 8),
  target: global.target?.name || global.targetScope?.name,
  originScope: global.originScope,
  countryIndicators: global.countryProfile ? Object.values(global.countryProfile.series || {}).map(series => ({ indicator: series.label, latest: series.latest })).filter(item => item.latest) : [],
  ...(macroRelevant ? { macroImports: asArray(global.macroImports).slice(0, 8), macroExports: asArray(global.macroExports).slice(0, 8) } : {}),
  historicalTrade: asArray(global.historicalTrade).slice(0, 16),
  topImporters: asArray(global.topImporters).slice(0, 10),
  topExporters: asArray(global.topExporters).slice(0, 10),
  importPartners: asArray(global.importPartners).slice(0, 10),
  exportPartners: asArray(global.exportPartners).slice(0, 10),
  productTrade: asArray(global.officialProductRows).slice(0, 16),
  gaps: global.gaps,
})}

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

export function buildDirectMarketInsightPrompt({ query, productName, country, intent }) {
  return `Create a professional qualitative B2B market insight report using your general knowledge.
QUERY: ${query}
PRODUCT: ${productName || 'Not specified'}
COUNTRY: ${country || 'Global'}
INTENT: ${intent}

Do not claim access to live statistics, documents, databases, current prices, or verified market shares. Do not invent precise figures. Clearly frame country rankings and trends as general market patterns that require current validation. Be practical, natural, and decision-oriented.

Required report sections: Executive Summary, Market Overview, Demand Trends, Supply Trends, Major Producing Countries, Major Importing Countries, Major Exporting Countries, Business Opportunities, Potential Risks, Recommendations, and Conclusion.

Strict length contract: executiveSummary must be at most 70 words. Every section must contain exactly one paragraph of at most 30 words and no more than one insight of at most 12 words. Return exactly three recommendations and exactly three risks. Keep the entire JSON compact and complete; never continue after the closing brace.

Return only valid JSON:
{
  "title":"specific professional title",
  "subtitle":"one-line scope",
  "executiveSummary":"concise executive summary",
  "executiveHighlights":["3-5 decision highlights"],
  "sections":[
    {"key":"market-overview","title":"Market Overview","paragraphs":["..."],"insights":["..."]},
    {"key":"demand-trends","title":"Demand Trends","paragraphs":["..."],"insights":["..."]},
    {"key":"supply-trends","title":"Supply Trends","paragraphs":["..."],"insights":["..."]},
    {"key":"producing-countries","title":"Major Producing Countries","paragraphs":["..."],"insights":["..."]},
    {"key":"importing-countries","title":"Major Importing Countries","paragraphs":["..."],"insights":["..."]},
    {"key":"exporting-countries","title":"Major Exporting Countries","paragraphs":["..."],"insights":["..."]},
    {"key":"opportunities","title":"Business Opportunities","paragraphs":["..."],"insights":["..."]},
    {"key":"risks","title":"Potential Risks","paragraphs":["..."],"insights":["..."]},
    {"key":"recommendations","title":"Recommendations","paragraphs":["..."],"insights":["..."]},
    {"key":"conclusion","title":"Conclusion","paragraphs":["..."],"insights":[]}
  ],
  "recommendations":["specific actions"],
  "risks":["specific risks"],
  "outlook":"qualitative outlook",
  "conclusion":"professional conclusion"
}`;
}

export default class MarketResearchService {
  static architectureStatus() {
    return {
      mode: config.marketInsightsRagEnabled ? 'executive-v3-with-evidence' : 'executive-v3-direct',
      ragEnabled: config.marketInsightsRagEnabled,
      product: 'market-insights',
      workflow: 'independent-from-chatbot',
      schema: 'market-insight-v3',
      pdfPipeline: 'backend-presentation-v3',
    };
  }

  static emit(emit, startedAt, event) {
    emit?.({ elapsedMs: Date.now() - startedAt, timestamp: new Date().toISOString(), ...event });
  }

  static step(emit, startedAt, agent, operation, progress, status = 'success', sourceCount = 0) {
    this.emit(emit, startedAt, { type: 'step', agent, operation, progress, status, sourceCount });
  }

  static async run(input, emit = () => {}) {
    const structuredIntent = TradeIntentService.parse(input);
    const operationKey = `${input.userId}:${structuredIntent.queryKey}:${REPORT_VERSION}`;
    if (!input.force && inFlight.has(operationKey)) {
      this.emit(emit, Date.now(), { type: 'step', agent: 'Research Orchestrator', operation: 'Joining an identical report already in progress', progress: 8, status: 'running' });
      return inFlight.get(operationKey);
    }
    const operation = this.execute({ ...input, structuredIntent }, emit);
    if (!input.force) inFlight.set(operationKey, operation);
    try {
      return await operation;
    } finally {
      if (inFlight.get(operationKey) === operation) inFlight.delete(operationKey);
    }
  }

  static async execute({ userId, session = {}, query, productName = '', country = '', company = '', category = '', mode = 'product_rd', force = false, structuredIntent }, emit = () => {}) {
    const startedAt = Date.now();
    const researchQuery = clean(query || [productName, category, country].filter(Boolean).join(' '));
    if (researchQuery.length < 3) throw Object.assign(new Error('Please provide a detailed research query'), { statusCode: 400 });
    const researchProduct = structuredIntent.product || productName || researchQuery;
    const researchCountry = country
      || structuredIntent.destinationCountries?.[0]
      || (structuredIntent.countries?.length === 1 ? structuredIntent.countries[0] : '');
    const queryHash = crypto.createHash('sha256').update(`${structuredIntent.queryKey}:${REPORT_VERSION}`).digest('hex');
    const cacheKey = `${userId}:${queryHash}`;
    if (!force) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
        this.emit(emit, startedAt, { type: 'report', report: cached.report, cached: true, progress: 100 });
        return cached.report;
      }
      const reusable = await SavedResearchReport.findOne({ userId, queryHash, status: 'active', pdfStatus: 'ready', createdAt: { $gte: new Date(Date.now() - REPORT_REUSE_TTL) } })
        .select('reportData dataVersion previewUrl downloadUrl pageCount fileSize generationTimeMs createdAt pdfStatus').sort({ createdAt: -1 }).lean();
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
    const ragEnabled = config.marketInsightsRagEnabled;
    const rewrittenQuery = ragEnabled ? rewriteSearchQuery({ message: researchQuery, intelligence }) : researchQuery;
    const storedTradeKnowledge = ragEnabled && !force ? await TradeKnowledgeService.findFresh(structuredIntent).catch(error => {
      console.warn('[Trade Intelligence] Structured knowledge lookup failed:', error.message);
      return null;
    }) : null;
    this.step(emit, startedAt, 'Research Orchestrator', ragEnabled ? 'Running configured evidence retrieval' : 'Preparing direct Gemma market analysis', 10, 'running');
    const [retrievedKnowledgeDocuments, collectedGlobal, marketplaceResults] = ragEnabled
      ? await Promise.all([
        KnowledgeBaseService.retrieve({ query: researchQuery, rewrittenQuery, role: 'buyer', intent: 'market_research', language: intelligence.language, limit: 12 }),
        storedTradeKnowledge
          ? Promise.resolve(storedTradeKnowledge.dataset)
          : GlobalTradeResearchService.collect({ query: researchQuery, productName: researchProduct, country: researchCountry, structuredIntent }),
        getAISearchResults({ query: researchQuery, filters: { categories: category ? [category] : [], countries: researchCountry ? [researchCountry] : [] }, userId }),
      ])
      : [[], {}, { products: [], suppliers: [], categories: [], services: [] }];
    const knowledgeDocuments = filterKnowledgeDocuments(retrievedKnowledgeDocuments, researchProduct);
    let global = collectedGlobal;
    let tradeKnowledge = storedTradeKnowledge;
    if (ragEnabled && !tradeKnowledge) {
      tradeKnowledge = await TradeKnowledgeService.store(structuredIntent, global).catch(error => {
        console.warn('[Trade Intelligence] Structured knowledge persistence failed:', error.message);
        return null;
      });
      if (tradeKnowledge?.dataset) global = tradeKnowledge.dataset;
    }
    const knowledge = knowledgeContext(knowledgeDocuments);
    const marketplace = marketplaceSummary(marketplaceResults);
    const sourceCount = knowledgeDocuments.length + asArray(global.sources).length + Object.values(marketplace).reduce((sum, value) => sum + value, 0);
    this.step(emit, startedAt, ragEnabled ? 'Evidence Ranker' : 'Report Planner', ragEnabled ? `Merged and ranked ${knowledgeDocuments.length} knowledge sources` : 'Prepared the qualitative report structure', 35, 'success', sourceCount);

    let analysis;
    let reportRuntime = {};
    try {
      this.step(emit, startedAt, 'Market Intelligence Analyst', 'Preparing the commissioned executive analysis', 48, 'running', sourceCount);
      const generated = await MarketInsightReportV3Service.generate({
        query: researchQuery,
        productName: researchProduct,
        country: researchCountry,
        company,
        intent: intelligence.intent,
        evidence: ragEnabled ? {
          knowledge,
          trade: global,
          marketplace,
        } : null,
      });
      analysis = generated.report;
      reportRuntime = generated.runtime;
    } catch (error) {
      console.error('[Market Insights] Executive v3 report generation failed:', error.message);
      throw Object.assign(new Error('The commissioned market intelligence report could not be completed. Please retry.'), { cause: error, statusCode: error.statusCode || 503, code: error.code || 'MARKET_INSIGHT_GENERATION_FAILED' });
    }
    const verifiedEvidenceSections = ragEnabled ? evidenceSections(global, researchProduct, researchCountry) : [];
    analysis.sections = [...analysis.sections, ...verifiedEvidenceSections];
    this.step(emit, startedAt, 'Quality Reviewer', 'Cross-validating claims and attaching only measured charts and tables', 72, 'success', sourceCount);

    const artifacts = ragEnabled ? knowledgeArtifacts(knowledgeDocuments) : { tables: [], charts: [] };
    const tradeTables = ragEnabled ? actualTradeTables(global, researchQuery) : [];
    const charts = ragEnabled ? actualCharts(global, marketplace, researchQuery) : [];
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
    const relevantGlobalSources = ragEnabled ? asArray(global.sources).filter(source => {
      if (source.status === 'unavailable') return false;
      if (/World Bank/i.test(source.name)) return Boolean(global.countryProfile) || /\b(global|top markets?|country comparison|compare countries|macro|worldwide)\b/i.test(researchQuery);
      if (/UN Comtrade/i.test(source.name)) return [global.officialProductRows, global.historicalTrade, global.topImporters, global.topExporters, global.importPartners, global.exportPartners].some(rows => asArray(rows).length > 0);
      if (/WTO/i.test(source.name)) return /\b(wto|tariff|trade policy|trade agreement|duty)\b/i.test(researchQuery);
      if (/WCO|HS Classification/i.test(source.name)) return Boolean(global.hsCode);
      return source.status === 'connected';
    }) : [];
    const sources = [
      ...knowledgeDocuments.map(document => ({ name: document.title, publisher: document.source?.publisher, type: 'AI knowledge database', version: document.version })),
      ...relevantGlobalSources,
    ];
    const generatedAt = new Date().toISOString();
    const evidenceQuality = ragEnabled
      ? assessEvidenceQuality(global, knowledgeDocuments)
      : { score: 0, grade: 'qualitative-model-knowledge', checks: [], missingEvidence: ['live-evidence-disabled'], verifiedNumericalObservations: 0 };
    const report = {
      id: researchId,
      reportType: ['product_rd', 'country_rd', 'opportunity_finder'].includes(mode) ? mode : 'product_rd',
      query: researchQuery,
      schemaVersion: analysis.schemaVersion,
      title: analysis.title,
      subtitle: analysis.subtitle,
      executiveSummary: analysis.executiveSummary,
      executiveHighlights: analysis.executiveHighlights,
      generatedFor: generatedFor(session),
      productName: researchProduct,
      country: researchCountry,
      category,
      reportVersion: REPORT_VERSION,
      dataVersion: ragEnabled ? tradeKnowledge?.dataVersion || global.collectionVersion || 'live-unversioned' : 'executive-v3-direct',
      structuredIntent,
      sections: analysis.sections,
      keyMetrics: [...asArray(analysis.keyMetrics), ...(ragEnabled ? [
        { label: 'Evidence quality', value: `${evidenceQuality.score}%`, note: evidenceQuality.grade },
        { label: 'Verified evidence rows', value: asArray(global.officialProductRows).length + asArray(global.historicalTrade).length + asArray(global.topImporters).length + asArray(global.topExporters).length, note: global.hsCode ? `HS ${global.hsCode}` : 'HS pending' },
        { label: 'Connected sources', value: relevantGlobalSources.length + knowledgeDocuments.length, note: 'Attributed and versioned' },
        { label: 'Historical periods', value: new Set(asArray(global.historicalTrade).map(row => row.period)).size, note: 'No interpolation' },
        { label: 'Marketplace matches', value: marketplace.products + marketplace.suppliers, note: 'Current snapshot' },
      ] : [])].slice(0, 12),
      tables: asArray(analysis.tables),
      charts: asArray(analysis.charts),
      recommendations: asArray(analysis.recommendations),
      risks: asArray(analysis.risks),
      methodology: ragEnabled
        ? 'Independent Market Insights v3 workflow: scope normalization, configured evidence collection, concise analyst synthesis, comparative scoring, cross-validation and backend executive document composition.'
        : 'Independent Market Insights v3 workflow: scope normalization, concise qualitative trade analysis, comparative scoring and backend executive document composition. Current figures require authoritative validation.',
      references: [...asArray(analysis.references), ...sources],
      sources: [...asArray(analysis.references), ...sources],
      dataGaps: asArray(global.gaps),
      evidenceQuality,
      sourceCount,
      verificationNotice: analysis.verificationNotice,
      estimatedAnalysis: analysis.estimatedAnalysis,
      runtimeMetrics: reportRuntime,
      generatedBy: 'EsyGlob Market Intelligence',
      generatedAt,
      createdAt: generatedAt,
    };
    report.html = buildMarketInsightHtml(report, {
      reportId: report.id,
      generatedAt,
      reportVersion: REPORT_VERSION,
    });

    this.step(emit, startedAt, 'Document Planner', 'Planning continuous narrative, tables and charts', 82, 'running', sourceCount);
    const saved = new SavedResearchReport({
      userId,
      roleContext: session.primaryRole === 'seller' ? 'seller' : 'buyer',
      reportType: report.reportType,
      title: report.title,
      productName: researchProduct,
      country: researchCountry,
      company,
      query: researchQuery,
      queryHash,
      reportVersion: REPORT_VERSION,
      dataVersion: report.dataVersion,
      structuredIntent,
      html: report.html,
      reportData: reportForStorage(report),
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
      saved.reportData = reportForStorage(report);
      await saved.save();
      if (ragEnabled) TradeKnowledgeService.learnRelated(structuredIntent, global);
    } catch (error) {
      await MarketReportStorageService.remove(saved.storageKey).catch(() => undefined);
      saved.pdfStatus = 'failed';
      saved.pdfError = clean(error.message).slice(0, 500);
      saved.storageKey = '';
      saved.fileSize = 0;
      saved.reportData = reportForStorage(report);
      await saved.save().catch(() => undefined);
      throw Object.assign(new Error('The analysis completed, but the validated PDF could not be produced. Please retry.'), { cause: error });
    }
    const completed = reportMetadata(report, saved._id, saved);
    cache.set(cacheKey, { createdAt: Date.now(), report: completed });
    if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    this.step(emit, startedAt, 'Complete', 'Enterprise Market Intelligence PDF completed', 100, 'success', sourceCount);
    this.emit(emit, startedAt, { type: 'report', report: completed, progress: 100 });
    return completed;
  }
}
