import OllamaRuntimeService from './ollama-runtime.service.js';

export const MARKET_INSIGHT_REPORT_VERSION = '6.0';

export const MARKET_INSIGHT_SECTION_TITLES = [
  'Executive Summary', 'Industry Overview', 'Market Overview', 'Demand Analysis',
  'Supply Analysis', 'Production Analysis', 'Consumption Analysis', 'Import Analysis',
  'Export Analysis', 'Trade Flow Analysis', 'Market Growth Drivers', 'Market Challenges',
  'Market Trends', 'Competitive Landscape', 'Major Producing Countries',
  'Major Importing Countries', 'Major Exporting Countries', "India's Position",
  'Competitor Analysis', 'Pricing Trends', 'Demand Forecast', 'Supply Forecast',
  'Business Opportunities', 'Risk Assessment', 'SWOT Analysis', 'PESTLE Analysis',
  'Port & Logistics Analysis', 'Trade Route Analysis', 'Import Requirements',
  'Export Requirements', 'Certification Requirements', 'Recommended HS Codes',
  'Market Entry Strategy', 'Go-To-Market Strategy', 'Buyer Recommendations',
  'Seller Recommendations', 'Manufacturer Recommendations', 'Investment Outlook',
  'Executive Recommendations', 'Conclusion',
];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const list = (value, limit = 12) => (Array.isArray(value) ? value : []).map(clean).filter(Boolean).slice(0, limit);
const score = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const estimatedSource = 'EsyGlob comparative analysis — estimated index, not an official statistic';

function parseJson(value) {
  const raw = String(value || '').replace(/```(?:json)?|```/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function rows(value, fields, limit = 12) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map(item => fields.map(field => clean(item?.[field])));
}

function rankingTable(title, values, label) {
  const data = (Array.isArray(values) ? values : []).slice(0, 10);
  if (!data.length) return null;
  return {
    title,
    columns: ['Rank', label, 'Comparative score', 'Commercial rationale'],
    rows: data.map((item, index) => [index + 1, item.country || item.name, score(item.score), item.rationale]),
    source: estimatedSource,
  };
}

function rankingChart(title, values) {
  const data = (Array.isArray(values) ? values : []).slice(0, 10)
    .map(item => ({ label: clean(item.country || item.name), value: score(item.score) })).filter(item => item.label);
  return data.length > 1 ? { type: 'bar', title, unit: 'Index / 100', data, source: estimatedSource } : null;
}

function matrixTable(title, values, columns, fields) {
  const data = rows(values, fields);
  return data.length ? { title, columns, rows: data, source: estimatedSource } : null;
}

function sectionMap(value) {
  return new Map((Array.isArray(value) ? value : []).map(item => [clean(item?.title).toLowerCase(), item]));
}

function contextualFallback(title, subject, market) {
  return `${title} for ${subject} in ${market} should be assessed through buyer requirements, supply reliability, landed cost, regulatory access and competitive intensity. Commercial decisions should validate current market evidence before capital, pricing or contractual commitments are made.`;
}

function normalizeSections(raw, subject, market) {
  const byTitle = sectionMap(raw?.sections);
  return MARKET_INSIGHT_SECTION_TITLES.map(title => {
    const item = byTitle.get(title.toLowerCase()) || {};
    const paragraphs = list(item.paragraphs, 4);
    return {
      key: slug(title),
      title,
      paragraphs: paragraphs.length ? paragraphs : [contextualFallback(title, subject, market)],
      insights: list(item.insights, 5),
      evidenceNote: clean(item.evidenceNote),
    };
  });
}

function attach(section, { tables = [], charts = [], metrics = [] }) {
  if (!section) return;
  section.tables = tables.filter(Boolean);
  section.charts = charts.filter(Boolean);
  section.metrics = metrics.filter(item => item?.label && item?.value !== undefined);
}

export function buildMarketInsightV2Prompt({ query, productName, country, intent, evidence = null }) {
  const scope = country || 'Global';
  const evidenceText = evidence ? JSON.stringify(evidence).slice(0, 22_000) : 'No live evidence supplied.';
  return `You are the Senior International Trade Market Intelligence Analyst at EsyGlob. A professional executive report has already been commissioned.

SUBJECT: ${productName || query}
MARKET: ${scope}
REQUEST: ${query}
INTENT: ${intent || 'market intelligence'}
SUPPLIED EVIDENCE: ${evidenceText}

Return only the final structured report as valid JSON. Never greet, ask questions, offer a search, mention AI, a model, a prompt, limitations, reasoning, or internal systems. Write confident, natural consulting prose. Every paragraph must add a distinct commercial insight. Avoid filler and repetition.

Use supplied evidence when present. Never fabricate official statistics, current prices, market shares, tariff rates or legal requirements. When exact current figures are unavailable, use explicitly estimated comparative indices from 0-100 and state that critical financial, customs and legal figures require validation.

The report should be comprehensive (target 2,000-4,000 words when the scope supports it). Provide 2-4 substantive paragraphs and 2-5 decision insights per section. Include every section title exactly once:
${MARKET_INSIGHT_SECTION_TITLES.join(' | ')}

Return this JSON shape:
{
  "title":"specific executive title",
  "subtitle":"scope and decision focus",
  "executiveSummary":"substantive summary",
  "executiveHighlights":["4-6 decision highlights"],
  "sections":[{"title":"exact required title","paragraphs":["analysis"],"insights":["decision insight"],"evidenceNote":"optional scope note"}],
  "indices":[{"label":"Demand|Risk|Growth|Competitiveness|Market Potential|Trade Attractiveness|Opportunity","score":0,"rationale":"brief basis"}],
  "rankings":{"producers":[{"country":"","score":0,"rationale":""}],"importers":[],"exporters":[]},
  "forecasts":[{"period":"Current|1 year|3 years|5 years","demandIndex":0,"supplyIndex":0,"growthIndex":0,"assumption":""}],
  "pricing":[{"segment":"","pricePosition":"Low|Mid|Premium","direction":"Down|Stable|Up","drivers":""}],
  "competitors":[{"type":"","strength":"","weakness":"","response":""}],
  "opportunities":[{"opportunity":"","attractiveness":0,"feasibility":0,"action":""}],
  "risks":[{"risk":"","likelihood":"Low|Medium|High","impact":"Low|Medium|High","score":0,"mitigation":""}],
  "swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},
  "pestle":[{"factor":"Political|Economic|Social|Technological|Legal|Environmental","impact":"","priority":"Low|Medium|High","response":""}],
  "ports":[{"port":"","country":"","strength":"","constraint":""}],
  "routes":[{"route":"","mode":"","advantages":"","risks":""}],
  "requirements":{"import":[],"export":[],"certifications":[],"hsCodes":[{"code":"candidate or verify","description":"","validation":""}]},
  "strategies":{"marketEntry":[],"goToMarket":[],"buyers":[],"sellers":[],"manufacturers":[],"investment":[],"executive":[]},
  "actionPlan":[{"phase":"0-30 days|31-90 days|3-12 months","action":"","owner":"","outcome":""}],
  "references":[{"name":"source or validation authority","publisher":"","url":"","note":"what to verify"}]
}`;
}

const REPORT_SEGMENTS = [
  {
    name: 'Market foundations',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(0, 5),
    artifacts: 'Also include title, subtitle, executiveSummary, executiveHighlights and indices:[{label,score,rationale}].',
    maxTokens: 900,
  },
  {
    name: 'Production and trade structure',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(5, 10),
    artifacts: 'Also include rankings:{producers:[{country,score,rationale}],importers:[],exporters:[]}.',
    maxTokens: 900,
  },
  {
    name: 'Growth and competitive landscape',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(10, 15),
    artifacts: 'Also include competitors:[{type,strength,weakness,response}].',
    maxTokens: 900,
  },
  {
    name: 'Country position and pricing',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(15, 20),
    artifacts: 'Also include pricing:[{segment,pricePosition,direction,drivers}].',
    maxTokens: 900,
  },
  {
    name: 'Forecast, opportunity and risk',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(20, 25),
    artifacts: 'Also include forecasts:[{period,demandIndex,supplyIndex,growthIndex,assumption}], opportunities:[{opportunity,attractiveness,feasibility,action}] and risks:[{risk,likelihood,impact,score,mitigation}].',
    maxTokens: 1_000,
  },
  {
    name: 'Strategic frameworks and logistics',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(25, 30),
    artifacts: 'Also include swot:{strengths:[],weaknesses:[],opportunities:[],threats:[]}, pestle:[{factor,impact,priority,response}], ports:[{port,country,strength,constraint}] and routes:[{route,mode,advantages,risks}].',
    maxTokens: 1_000,
  },
  {
    name: 'Compliance and market entry',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(30, 35),
    artifacts: 'Also include requirements:{import:[],export:[],certifications:[],hsCodes:[{code,description,validation}]} and strategies:{marketEntry:[],goToMarket:[],buyers:[]}.',
    maxTokens: 1_000,
  },
  {
    name: 'Stakeholder execution and conclusion',
    sections: MARKET_INSIGHT_SECTION_TITLES.slice(35),
    artifacts: 'Also include strategies:{sellers:[],manufacturers:[],investment:[],executive:[]}, actionPlan:[{phase,action,owner,outcome}] and references:[{name,publisher,url,note}].',
    maxTokens: 1_000,
  },
];

function segmentPrompt({ query, productName, country, intent, evidence }, segment) {
  const evidenceText = evidence ? JSON.stringify(evidence).slice(0, 8_000) : 'No live evidence supplied.';
  return `You are the Senior International Trade Market Intelligence Analyst at EsyGlob. Write segment "${segment.name}" of a commissioned executive report.
SUBJECT: ${productName || query}\nMARKET: ${country || 'Global'}\nREQUEST: ${query}\nINTENT: ${intent || 'market intelligence'}\nEVIDENCE: ${evidenceText}

Return valid JSON only. Never greet, ask questions, mention AI, models, prompts, reasoning or internal systems. Do not fabricate official statistics, current prices, tariffs or legal requirements. Use explicitly estimated 0-100 comparative indices when exact figures are unavailable. Write one substantive 25-50 word paragraph and 1-2 decision insights for every section. Avoid filler and repetition.

Required sections for this segment, exactly once: ${segment.sections.join(' | ')}
${segment.artifacts}

Return a compact JSON object. The sections field MUST be a JSON array in this form: sections:[{title,paragraphs,insights}]. Add only the additional fields requested above. Do not emit unused empty fields.
Finish the JSON object within the token budget.`;
}

function mergeSegments(parts) {
  const first = parts[0] || {};
  const merged = {
    ...first,
    sections: parts.flatMap(item => Array.isArray(item.sections) ? item.sections : []),
    executiveHighlights: parts.flatMap(item => Array.isArray(item.executiveHighlights) ? item.executiveHighlights : []),
    indices: parts.flatMap(item => Array.isArray(item.indices) ? item.indices : []),
    forecasts: parts.flatMap(item => Array.isArray(item.forecasts) ? item.forecasts : []),
    pricing: parts.flatMap(item => Array.isArray(item.pricing) ? item.pricing : []),
    competitors: parts.flatMap(item => Array.isArray(item.competitors) ? item.competitors : []),
    opportunities: parts.flatMap(item => Array.isArray(item.opportunities) ? item.opportunities : []),
    risks: parts.flatMap(item => Array.isArray(item.risks) ? item.risks : []),
    pestle: parts.flatMap(item => Array.isArray(item.pestle) ? item.pestle : []),
    ports: parts.flatMap(item => Array.isArray(item.ports) ? item.ports : []),
    routes: parts.flatMap(item => Array.isArray(item.routes) ? item.routes : []),
    actionPlan: parts.flatMap(item => Array.isArray(item.actionPlan) ? item.actionPlan : []),
    references: parts.flatMap(item => Array.isArray(item.references) ? item.references : []),
    rankings: Object.assign({}, ...parts.map(item => item.rankings || {})),
    swot: Object.assign({}, ...parts.map(item => item.swot || {})),
    requirements: Object.assign({}, ...parts.map(item => item.requirements || {})),
    strategies: Object.assign({}, ...parts.map(item => item.strategies || {})),
  };
  return merged;
}

function missingSegmentSections(value, segment) {
  const present = new Set((Array.isArray(value?.sections) ? value.sections : []).map(item => clean(item?.title).toLowerCase()));
  return segment.sections.filter(title => !present.has(title.toLowerCase()));
}

function canonicalizeSegmentSections(value, segment) {
  if (!Array.isArray(value?.sections) || value.sections.length !== segment.sections.length) return value;
  value.sections = value.sections.map((section, index) => ({ ...section, title: segment.sections[index] }));
  return value;
}

function coerceSegmentSections(value, segment) {
  if (!value || Array.isArray(value.sections)) return value;
  let entries = value.sections && typeof value.sections === 'object' ? Object.entries(value.sections) : [];
  if (!entries.length) {
    const normalizedEntries = new Map(Object.entries(value).map(([key, content]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), [key, content]]));
    entries = segment.sections.map(title => normalizedEntries.get(title.toLowerCase().replace(/[^a-z0-9]/g, ''))).filter(Boolean);
  }
  if (!entries.length) return value;
  value.sections = entries.map(([title, section]) => {
    if (typeof section === 'string') return { title, paragraphs: [section], insights: [] };
    return { ...(section || {}), title: clean(section?.title || title) };
  });
  return value;
}

export function normalizeMarketInsightV2(rawValue, { query, productName, country }) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const subject = clean(productName || query || 'the selected product');
  const market = clean(country || 'the global market');
  const sections = normalizeSections(raw, subject, market);
  const find = title => sections.find(item => item.title === title);
  const indices = (Array.isArray(raw.indices) ? raw.indices : []).slice(0, 8).map(item => ({
    label: clean(item.label), value: `${score(item.score)}/100`, score: score(item.score), note: clean(item.rationale),
  })).filter(item => item.label);
  const rankings = raw.rankings || {};
  const producerTable = rankingTable('Major producing country comparison', rankings.producers, 'Country');
  const importerTable = rankingTable('Major importing country comparison', rankings.importers, 'Country');
  const exporterTable = rankingTable('Major exporting country comparison', rankings.exporters, 'Country');
  attach(find('Major Producing Countries'), { tables: [producerTable], charts: [rankingChart('Producer competitiveness ranking', rankings.producers)] });
  attach(find('Major Importing Countries'), { tables: [importerTable], charts: [rankingChart('Import market attractiveness ranking', rankings.importers)] });
  attach(find('Major Exporting Countries'), { tables: [exporterTable], charts: [rankingChart('Exporter competitiveness ranking', rankings.exporters)] });

  const forecastRows = (Array.isArray(raw.forecasts) ? raw.forecasts : []).slice(0, 8);
  const forecastTable = forecastRows.length ? {
    title: 'Comparative demand and supply outlook', columns: ['Period', 'Demand index', 'Supply index', 'Growth index', 'Key assumption'],
    rows: forecastRows.map(item => [item.period, score(item.demandIndex), score(item.supplyIndex), score(item.growthIndex), item.assumption]), source: estimatedSource,
  } : null;
  const demandChart = forecastRows.length > 1 ? { type: 'line', title: 'Demand outlook index', data: forecastRows.map(item => ({ label: item.period, value: score(item.demandIndex) })), source: estimatedSource } : null;
  const supplyChart = forecastRows.length > 1 ? { type: 'area', title: 'Supply outlook index', data: forecastRows.map(item => ({ label: item.period, value: score(item.supplyIndex) })), source: estimatedSource } : null;
  attach(find('Demand Forecast'), { tables: [forecastTable], charts: [demandChart] });
  attach(find('Supply Forecast'), { tables: [forecastTable], charts: [supplyChart] });

  attach(find('Pricing Trends'), { tables: [matrixTable('Pricing position comparison', raw.pricing, ['Segment', 'Position', 'Direction', 'Primary drivers'], ['segment', 'pricePosition', 'direction', 'drivers'])] });
  attach(find('Competitor Analysis'), { tables: [matrixTable('Competitor response matrix', raw.competitors, ['Competitor type', 'Strength', 'Weakness', 'Recommended response'], ['type', 'strength', 'weakness', 'response'])] });
  attach(find('Business Opportunities'), { tables: [matrixTable('Opportunity prioritization matrix', raw.opportunities, ['Opportunity', 'Attractiveness', 'Feasibility', 'First action'], ['opportunity', 'attractiveness', 'feasibility', 'action'])], charts: [(Array.isArray(raw.opportunities) && raw.opportunities.length > 1) ? { type: 'bar', title: 'Opportunity attractiveness index', data: raw.opportunities.slice(0, 10).map(item => ({ label: item.opportunity, value: score(item.attractiveness) })), source: estimatedSource } : null] });
  attach(find('Risk Assessment'), { tables: [matrixTable('Risk and mitigation matrix', raw.risks, ['Risk', 'Likelihood', 'Impact', 'Risk score', 'Mitigation'], ['risk', 'likelihood', 'impact', 'score', 'mitigation'])], charts: [(Array.isArray(raw.risks) && raw.risks.length > 1) ? { type: 'risk', title: 'Risk priority heatmap', data: raw.risks.slice(0, 10).map(item => ({ label: item.risk, value: score(item.score), likelihood: item.likelihood, impact: item.impact })), source: estimatedSource } : null] });

  const swot = raw.swot || {};
  const swotColumns = [list(swot.strengths), list(swot.weaknesses), list(swot.opportunities), list(swot.threats)];
  const swotLength = Math.max(...swotColumns.map(items => items.length));
  attach(find('SWOT Analysis'), { tables: swotLength ? [{ title: 'SWOT decision matrix', columns: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'], rows: Array.from({ length: swotLength }, (_, index) => swotColumns.map(items => items[index] || '')), source: 'EsyGlob analyst synthesis' }] : [] });
  attach(find('PESTLE Analysis'), { tables: [matrixTable('PESTLE priority matrix', raw.pestle, ['Factor', 'Business impact', 'Priority', 'Recommended response'], ['factor', 'impact', 'priority', 'response'])] });
  attach(find('Port & Logistics Analysis'), { tables: [matrixTable('Port comparison', raw.ports, ['Port', 'Country', 'Strength', 'Constraint'], ['port', 'country', 'strength', 'constraint'])] });
  attach(find('Trade Route Analysis'), { tables: [matrixTable('Trade route summary', raw.routes, ['Route', 'Mode', 'Advantages', 'Risks'], ['route', 'mode', 'advantages', 'risks'])] });

  const requirements = raw.requirements || {};
  const checklist = values => list(values).map((item, index) => [index + 1, item, 'Validate before transaction']);
  attach(find('Import Requirements'), { tables: [{ title: 'Import readiness checklist', columns: ['#', 'Requirement', 'Status'], rows: checklist(requirements.import), source: 'Verify with destination customs and competent authorities' }] });
  attach(find('Export Requirements'), { tables: [{ title: 'Export readiness checklist', columns: ['#', 'Requirement', 'Status'], rows: checklist(requirements.export), source: 'Verify with origin export and customs authorities' }] });
  attach(find('Certification Requirements'), { tables: [{ title: 'Certification checklist', columns: ['#', 'Certification or standard', 'Status'], rows: checklist(requirements.certifications), source: 'Verify product scope and destination-market applicability' }] });
  attach(find('Recommended HS Codes'), { tables: [matrixTable('HS classification candidates', requirements.hsCodes, ['Candidate code', 'Description', 'Validation required'], ['code', 'description', 'validation'])] });

  const strategies = raw.strategies || {};
  const strategyMap = [
    ['Market Entry Strategy', 'marketEntry'], ['Go-To-Market Strategy', 'goToMarket'], ['Buyer Recommendations', 'buyers'],
    ['Seller Recommendations', 'sellers'], ['Manufacturer Recommendations', 'manufacturers'], ['Investment Outlook', 'investment'],
    ['Executive Recommendations', 'executive'],
  ];
  strategyMap.forEach(([title, field]) => { const values = list(strategies[field]); if (values.length) find(title).insights = values; });
  attach(find('Executive Recommendations'), { tables: [matrixTable('Phased executive action plan', raw.actionPlan, ['Phase', 'Action', 'Owner', 'Expected outcome'], ['phase', 'action', 'owner', 'outcome'])] });

  const topLevelCharts = [
    indices.length > 1 ? { type: 'bar', title: 'Executive market attractiveness dashboard', data: indices.map(item => ({ label: item.label, value: item.score })), source: estimatedSource } : null,
  ].filter(Boolean);
  return {
    schemaVersion: 'market-insight-v2',
    title: clean(raw.title) || `${subject} Market Intelligence — ${market}`,
    subtitle: clean(raw.subtitle) || 'Executive trade, competition, risk and market-entry assessment',
    executiveSummary: clean(raw.executiveSummary) || find('Executive Summary').paragraphs.join(' '),
    executiveHighlights: list(raw.executiveHighlights, 6),
    sections,
    keyMetrics: indices,
    tables: [],
    charts: topLevelCharts,
    recommendations: list(strategies.executive, 10),
    risks: list(raw.risks?.map(item => item.risk), 10),
    references: Array.isArray(raw.references) ? raw.references.slice(0, 20) : [],
    estimatedAnalysis: true,
    verificationNotice: 'Comparative indices are EsyGlob analytical estimates, not official statistics. Verify critical financial, customs, certification and legal figures with current authoritative sources before decisions.',
  };
}

export default class MarketInsightReportV2Service {
  static status() {
    return { product: 'market-insights', pipeline: 'independent-structured-v2', model: OllamaRuntimeService.model, reportVersion: MARKET_INSIGHT_REPORT_VERSION };
  }

  static async generate(input) {
    const startedAt = Date.now();
    const responses = [];
    const parts = [];
    for (const [index, segment] of REPORT_SEGMENTS.entries()) {
      const response = await OllamaRuntimeService.complete({
        messages: [
          { role: 'system', content: 'You are the Senior International Trade Market Intelligence Analyst at EsyGlob. Return only the commissioned structured report segment as valid JSON. Never respond conversationally and never mention AI, models, prompts, reasoning or internal systems.' },
          { role: 'user', content: segmentPrompt(input, segment) },
        ],
        jsonMode: true,
        temperature: .16,
        topP: .86,
        maxTokens: Math.max(900, Number(process.env.MARKET_INSIGHT_V2_SEGMENT_MAX_TOKENS || segment.maxTokens)),
        contextSize: Math.max(4_096, Number(process.env.MARKET_INSIGHT_V2_CONTEXT_SIZE || 4_096)),
        timeoutMs: Math.max(90_000, Number(process.env.MARKET_INSIGHT_V2_SEGMENT_TIMEOUT_MS || 120_000)),
        retry: false,
      });
      responses.push(response);
      const parsed = parseJson(response.message);
      if (!parsed) throw Object.assign(new Error(`Market Insights segment ${index + 1} returned incomplete structured data. Please retry.`), { code: 'MARKET_INSIGHT_INVALID_JSON', statusCode: 503 });
      coerceSegmentSections(parsed, segment);
      canonicalizeSegmentSections(parsed, segment);
      const missing = missingSegmentSections(parsed, segment);
      if (missing.length) throw Object.assign(new Error(`Market Insights segment ${index + 1} omitted required sections: ${missing.join(', ')}`), { code: 'MARKET_INSIGHT_INCOMPLETE_SEGMENT', statusCode: 503 });
      parts.push(parsed);
    }
    return {
      report: normalizeMarketInsightV2(mergeSegments(parts), input),
      runtime: {
        segments: responses.length,
        tokensUsed: responses.reduce((sum, response) => sum + Number(response.tokensUsed || 0), 0),
        outputSanitized: responses.some(response => response.outputSanitized),
        generationTimeMs: Date.now() - startedAt,
      },
    };
  }
}
