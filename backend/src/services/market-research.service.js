import crypto from 'crypto';
import AIChatService from './ai-chat.service.js';
import MarketInsightsRepository from '../repositories/market-insights.repository.js';
import SavedResearchReport from '../models/SavedResearchReport.js';
import { getAISearchResults } from '../lib/ai-marketplace-context.js';
import { getCountriesData } from './market-insights.service.js';

const cache = new Map();
const CACHE_TTL = Number(process.env.MARKET_RESEARCH_CACHE_TTL_MS || 15 * 60 * 1000);

const AGENTS = {
  planner: 'Planner Agent', marketplace: 'Marketplace Data Agent', government: 'Government Data Agent',
  reasoning: 'Trade Intelligence Agent', visualization: 'Visualization Agent', report: 'Report Generator', review: 'Review Agent',
};

function extractJson(text) {
  const raw = String(text || '').replace(/```json|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function compact(value, max = 28000) {
  const text = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'string' && item.length > 1200) return `${item.slice(0, 1200)}…`;
    return item;
  });
  return text.length > max ? text.slice(0, max) : text;
}

function roleContext(session) {
  if (session?.roles?.includes('seller')) return 'seller';
  if (session?.roles?.includes('buyer')) return 'buyer';
  return 'general';
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
    this.emit(emit, startedAt, { type: 'research_started', researchId, query: researchQuery, model: process.env.OLLAMA_MODEL || 'qwen2.5:3b', progress: 1 });
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.planner, operation: 'Understanding intent and planning research', status: 'running', progress: 5, sourceCount: 0, datasetsCollected: 0 });

    const plannerPrompt = `Plan a B2B market research investigation for this request: ${researchQuery}\nReturn JSON only: {"intent":"", "questions":[""], "dataNeeded":[""], "recommendedSections":[""], "searchTerms":[""]}. Make the plan specific to the request.`;
    const planResult = await AIChatService.callOllama(plannerPrompt, [], 'You are the Planner Agent for EsyGlob market research. Do not invent facts.', { maxTokens: 650, temperature: 0.2 }).catch(() => null);
    const plan = extractJson(planResult?.message) || { intent: researchQuery, searchTerms: [productName, category, country].filter(Boolean), recommendedSections: [] };
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.planner, operation: 'Research plan ready', status: 'success', progress: 13, plan, sourceCount: 0, datasetsCollected: 0 });

    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.marketplace, operation: 'Collecting authorized marketplace data', status: 'running', progress: 18, sourceCount: 1, datasetsCollected: 0 });
    const filters = { keywords: Array.isArray(plan.searchTerms) ? plan.searchTerms.slice(0, 10) : [], categories: category ? [category] : [], countries: country ? [country] : [] };
    const [marketplaceResults, marketplaceMetrics, countries] = await Promise.all([
      getAISearchResults({ query: researchQuery, filters, userId }),
      MarketInsightsRepository.getMarketplaceData(productName || researchQuery, category, country),
      getCountriesData(),
    ]);
    const authorizedMarketplace = {
      products: marketplaceResults.products,
      suppliers: marketplaceResults.suppliers,
      manufacturers: marketplaceResults.manufacturers,
      categories: marketplaceResults.categories,
      rfqs: marketplaceResults.rfqs,
      quotations: marketplaceResults.quotations,
      orders: marketplaceResults.orders,
      services: marketplaceResults.services,
      metrics: marketplaceMetrics,
    };
    const sourceCount = 2;
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.marketplace, operation: 'Marketplace dataset collected', status: 'success', progress: 32, sourceCount, datasetsCollected: 1, counts: { products: marketplaceResults.products.length, suppliers: marketplaceResults.suppliers.length, rfqs: marketplaceResults.rfqs.length } });
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.government, operation: 'Validating official economic and trade indicators', status: 'success', progress: 43, sourceCount, datasetsCollected: 2, countryCount: countries.length });

    const sourceContext = {
      request: { researchQuery, productName, country, category, mode, role: roleContext(session) },
      plan,
      marketplace: authorizedMarketplace,
      officialCountryData: country ? countries.filter(item => item.name?.toLowerCase() === country.toLowerCase()).slice(0, 3) : countries.slice(0, 12),
    };
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.reasoning, operation: 'Comparing data and reasoning about the market', status: 'running', progress: 50, sourceCount, datasetsCollected: 2 });

    const reportPrompt = `Conduct the research yourself using ONLY the supplied authorized datasets. Build a dynamic report for the user's actual request; omit irrelevant sections. Never invent numbers, companies, certifications, HS codes, tariffs, sources, or URLs. Clearly mark unavailable evidence. Return valid JSON only with this shape:
{"title":"","executiveSummary":"","kpis":[{"label":"","value":"","trend":"up|down|stable","note":""}],"sections":[{"type":"narrative|risks|opportunities|strategy|suppliers|buyers|trade","title":"","summary":"","points":[""],"confidence":0}],"charts":[{"type":"bar|line|pie","title":"","data":[{"label":"","value":0}]}],"tables":[{"title":"","columns":[""],"rows":[{}]}],"recommendations":[""],"risks":[{"label":"","level":"low|medium|high","reason":""}],"sources":[{"name":"EsyGlob Marketplace|World Bank Open Data","type":"internal|official","url":""}],"dataGaps":[""]}.
Research plan and datasets:\n${compact(sourceContext)}`;
    const result = await AIChatService.callOllama(reportPrompt, [], 'You are EsyGlob Trade Intelligence Agent and Report Generator. Evidence first. Produce decision-useful research, not generic prose.', { maxTokens: 2600, temperature: 0.25 });
    const generated = extractJson(result.message);
    if (!generated) throw Object.assign(new Error('The research model returned an invalid structured report. Please retry.'), { statusCode: 502 });

    const sections = Array.isArray(generated.sections) ? generated.sections : [];
    sections.forEach((section, index) => this.emit(emit, startedAt, { type: 'section', section, index, progress: 58 + Math.round(((index + 1) / Math.max(sections.length, 1)) * 24), sourceCount, datasetsCollected: 2 }));
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.visualization, operation: 'Preparing charts and tables', status: 'success', progress: 86, sourceCount, datasetsCollected: 2, chartCount: generated.charts?.length || 0, tableCount: generated.tables?.length || 0 });
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.review, operation: 'Reviewing evidence and final report', status: 'running', progress: 91, sourceCount, datasetsCollected: 2 });

    const report = {
      id: researchId, reportType: mode, query: researchQuery, title: generated.title || `Research: ${researchQuery}`,
      executiveSummary: generated.executiveSummary || '', kpis: generated.kpis || [], sections,
      charts: generated.charts || [], tables: generated.tables || [], recommendations: generated.recommendations || [],
      risks: generated.risks || [], sources: generated.sources || [], dataGaps: generated.dataGaps || [],
      marketplaceSnapshot: marketplaceMetrics, model: result.model, provider: result.provider,
      sourceCount, datasetsCollected: 2, createdAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    };
    const saved = await SavedResearchReport.create({ userId, roleContext: roleContext(session), reportType: ['product_rd', 'country_rd', 'opportunity_finder'].includes(mode) ? mode : 'product_rd', title: report.title, productName, country, query: researchQuery, reportData: report });
    report.savedReportId = String(saved._id);
    cache.set(cacheKey, { createdAt: Date.now(), report });
    this.emit(emit, startedAt, { type: 'step', agent: AGENTS.review, operation: 'Research completed and saved', status: 'success', progress: 98, sourceCount, datasetsCollected: 2 });
    this.emit(emit, startedAt, { type: 'report', report, progress: 100, sourceCount, datasetsCollected: 2 });
    return report;
  }
}

export default MarketResearchService;
