import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import MarketInsightsRepository from '../repositories/market-insights.repository.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { getAISearchResults, getSearchTerms } from '../lib/ai-marketplace-context.js';
import { getCountriesData } from './market-insights.service.js';

const cache = new Map();
const CACHE_TTL = Number(process.env.MARKET_RESEARCH_CACHE_TTL_MS || 15 * 60 * 1000);
const WEB_URL = String(process.env.PUBLIC_WEB_URL || 'https://esyglob.in').replace(/\/$/, '');

function absolute(path) {
  return path ? `${WEB_URL}${path.startsWith('/') ? path : `/${path}`}` : '';
}

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
    seller: seller.companyName || seller.businessName || seller.userId?.fullName || 'Seller',
    type: seller.companyType || 'supplier',
    country: seller.address?.country || 'Not specified',
    verified: seller.isVerified ? 'Yes' : 'No',
    trustScore: seller.trustScore ?? 'N/A',
    rating: seller.rating ?? 'N/A',
    link: absolute(`/manufacturers/${seller._id}`),
  }));
}

function categoryRows(results) {
  return (results.categories || []).map(category => ({
    category: category.name,
    link: absolute(`/categories/${encodeURIComponent(category.slug || category.name || '')}`),
  }));
}

function serviceRows(results) {
  return (results.services || []).map(service => ({
    service: service.title,
    description: service.description || '',
    link: absolute(`/services/${service.key}`),
  }));
}

function sourceRecords(results, includeWorldBank) {
  const records = [
    { name: 'EsyGlob Marketplace', type: 'internal', url: WEB_URL },
    ...productRows(results).map(item => ({ name: `Product: ${item.product}`, type: 'product', url: item.link })),
    ...sellerRows(results).map(item => ({ name: `Seller: ${item.seller}`, type: 'seller', url: item.link })),
    ...categoryRows(results).map(item => ({ name: `Category: ${item.category}`, type: 'category', url: item.link })),
    ...serviceRows(results).map(item => ({ name: `Service: ${item.service}`, type: 'service', url: item.link })),
  ];
  if (includeWorldBank) records.push({ name: 'World Bank Open Data', type: 'official', url: 'https://data.worldbank.org/' });
  return records;
}

function fallbackAnalysis(query, metrics, results) {
  const productCount = results.products?.length || 0;
  const sellerCount = results.suppliers?.length || 0;
  return {
    executiveSummary: `EsyGlob found ${productCount} matching products and ${sellerCount} matching sellers for “${query}”. Review verified sellers, MOQ, pricing and delivery terms through the linked records before purchasing.`,
    insights: [
      `${metrics.verifiedSupplierCount || 0} matched suppliers are verified in the current marketplace dataset.`,
      metrics.averagePrice != null ? `The listed-product average price signal is ${Math.round(metrics.averagePrice)}; compare currency and unit before using it.` : 'Comparable listed pricing is limited; request quotations from matched sellers.',
      `${metrics.rfqCount || 0} relevant active RFQ signals were found.`,
    ],
    recommendations: ['Open the best matching products and compare MOQ and seller verification.', 'Request current quotations and confirm specifications directly with sellers.'],
    risks: ['Marketplace prices and availability can change; reconfirm before ordering.'],
  };
}

class MarketResearchService {
  static emit(emit, startedAt, event) {
    emit({ elapsedMs: Date.now() - startedAt, timestamp: new Date().toISOString(), ...event });
  }

  static async run({ userId, session, query, productName = '', country = '', category = '', mode = 'product_rd' }, emit) {
    const startedAt = Date.now();
    const researchQuery = String(query || [productName, category, country].filter(Boolean).join(' ')).trim();
    if (researchQuery.length < 2) throw Object.assign(new Error('Research request is required'), { statusCode: 400 });
    const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ userId: String(userId), researchQuery, mode, country, category })).digest('hex');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL) {
      this.emit(emit, startedAt, { type: 'research_started', researchId: cached.report.id, cached: true });
      cached.report.sections?.forEach((section, index) => this.emit(emit, startedAt, { type: 'section', index, section, progress: 90 }));
      this.emit(emit, startedAt, { type: 'report', report: cached.report, progress: 100 });
      return cached.report;
    }

    const researchId = `research-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    this.emit(emit, startedAt, { type: 'research_started', researchId, query: researchQuery, model: process.env.OLLAMA_MODEL || 'qwen2.5:3b', progress: 2 });
    this.emit(emit, startedAt, { type: 'step', agent: 'Marketplace Search', operation: 'Finding matching products, sellers and services', status: 'running', progress: 12, sourceCount: 1, datasetsCollected: 0 });

    const terms = getSearchTerms(researchQuery, { keywords: [productName, category].filter(Boolean), countries: country ? [country] : [] });
    const filters = { keywords: terms, categories: category ? [category] : [], countries: country ? [country] : [] };
    const countryPromise = country ? getCountriesData().catch(() => []) : Promise.resolve([]);
    const [results, metrics, countries] = await Promise.all([
      getAISearchResults({ query: researchQuery, filters, userId }),
      MarketInsightsRepository.getMarketplaceData(productName || researchQuery, category, country),
      countryPromise,
    ]);
    const selectedCountry = countries.find(item => item.name?.toLowerCase() === country.toLowerCase());
    const counts = { products: results.products.length, sellers: results.suppliers.length, categories: results.categories.length, services: results.services.length };
    this.emit(emit, startedAt, { type: 'step', agent: 'Marketplace Search', operation: 'Relevant platform data and links collected', status: 'success', progress: 48, sourceCount: 1 + Object.values(counts).reduce((sum, value) => sum + value, 0), datasetsCollected: 1, counts });
    this.emit(emit, startedAt, { type: 'step', agent: 'EsyAI Insights', operation: 'Writing concise product insights', status: 'running', progress: 58, sourceCount: 1, datasetsCollected: selectedCountry ? 2 : 1 });

    const evidence = {
      request: researchQuery,
      counts,
      metrics,
      products: productRows(results).slice(0, 6).map(({ link, sellerLink, ...item }) => item),
      sellers: sellerRows(results).slice(0, 5).map(({ link, ...item }) => item),
      countryIndicator: selectedCountry || null,
    };
    const prompt = `Using only this evidence, return concise JSON: {"executiveSummary":"max 30 words","insights":["max 12 words"],"recommendations":["max 12 words"],"risks":["max 12 words"]}. Use 3 insights, 2 recommendations and 1 risk. Never invent facts or links. Evidence: ${JSON.stringify(evidence).slice(0, 1800)}`;
    let result = null;
    let generated = null;
    try {
      result = await AIChatService.callOllama(prompt, [], 'You are a concise B2B marketplace analyst. Output a small valid JSON object only.', { maxTokens: 180, temperature: 0.1, timeoutMs: 45000, jsonMode: true });
      generated = extractJson(result.message);
    } catch {
      // Retrieval remains useful even if the local model is temporarily unavailable.
    }
    generated ||= fallbackAnalysis(researchQuery, metrics, results);

    const insights = Array.isArray(generated.insights) ? generated.insights.slice(0, 4) : [];
    const sections = [{ type: 'opportunities', title: 'Product insights', summary: '', points: insights, confidence: 85 }];
    const products = productRows(results);
    const sellers = sellerRows(results);
    const tables = [
      ...(products.length ? [{ title: 'Matching products', columns: ['product', 'category', 'price', 'moq', 'seller', 'verified', 'link', 'sellerLink'], rows: products }] : []),
      ...(sellers.length ? [{ title: 'Matching sellers', columns: ['seller', 'type', 'country', 'verified', 'trustScore', 'rating', 'link'], rows: sellers }] : []),
      ...(results.categories.length ? [{ title: 'Related categories', columns: ['category', 'link'], rows: categoryRows(results) }] : []),
      ...(results.services.length ? [{ title: 'Relevant services', columns: ['service', 'description', 'link'], rows: serviceRows(results) }] : []),
    ];
    const sources = sourceRecords(results, Boolean(selectedCountry));
    const report = {
      id: researchId, reportType: mode, query: researchQuery, title: `Insights for ${productName || category || researchQuery}`,
      executiveSummary: generated.executiveSummary || fallbackAnalysis(researchQuery, metrics, results).executiveSummary,
      kpis: [
        { label: 'Products', value: counts.products, trend: 'stable', note: 'Matching live listings' },
        { label: 'Sellers', value: counts.sellers, trend: 'stable', note: 'Matching platform profiles' },
        { label: 'Verified', value: metrics.verifiedSupplierCount || 0, trend: 'stable', note: 'Verified matched suppliers' },
        { label: 'Active RFQs', value: metrics.rfqCount || 0, trend: 'stable', note: 'Current demand signal' },
      ],
      sections, charts: [], tables,
      recommendations: (generated.recommendations || []).slice(0, 3),
      risks: (generated.risks || []).slice(0, 2).map((risk, index) => ({ label: `Check ${index + 1}`, level: 'medium', reason: String(risk) })),
      sources, dataGaps: [], marketplaceSnapshot: metrics,
      model: result?.model || process.env.OLLAMA_MODEL || 'qwen2.5:3b', provider: result?.provider || 'ollama',
      sourceCount: sources.length, datasetsCollected: selectedCountry ? 2 : 1, createdAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    };

    sections.forEach((section, index) => this.emit(emit, startedAt, { type: 'section', section, index, progress: 82, sourceCount: sources.length, datasetsCollected: report.datasetsCollected }));
    const saved = await SavedResearchReport.create({ userId, roleContext: roleContext(session), reportType: ['product_rd', 'country_rd', 'opportunity_finder'].includes(mode) ? mode : 'product_rd', title: report.title, productName, country, query: researchQuery, reportData: report });
    report.savedReportId = String(saved._id);
    cache.set(cacheKey, { createdAt: Date.now(), report });
    this.emit(emit, startedAt, { type: 'step', agent: 'Result Builder', operation: 'Insights and verified platform links ready', status: 'success', progress: 98, sourceCount: sources.length, datasetsCollected: report.datasetsCollected });
    this.emit(emit, startedAt, { type: 'report', report, progress: 100, sourceCount: sources.length, datasetsCollected: report.datasetsCollected });
    return report;
  }
}

export default MarketResearchService;
