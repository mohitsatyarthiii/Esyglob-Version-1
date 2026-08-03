import OllamaRuntimeService from './ollama-runtime.service.js';

export const MARKET_INSIGHT_REPORT_VERSION = '7.0';
export const MARKET_INSIGHT_V3_SECTIONS = [
  'Executive Summary',
  'Key Market Analysis',
  'Opportunities & Risks',
  'Strategic Recommendations',
  'Executive Conclusion',
];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const array = (value, limit = 10) => (Array.isArray(value) ? value : []).filter(Boolean).slice(0, limit);
const score = (value, fallback = 50) => Math.max(0, Math.min(100, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback)));
const comparativeBasis = 'AI-generated comparative analysis — not verified market statistics';

function parseJson(value) {
  const raw = String(value || '').replace(/```(?:json)?|```/gi, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\u00a0/g, ' ').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function parseLineReport(value) {
  const result = { insights: [], countries: [], opportunities: [], risks: [], actions: [] };
  const snapshot = {};
  const scalar = { TITLE: 'title', SUBTITLE: 'subtitle', SUMMARY: 'summary', ACTION: 'action', CONFIDENCE: 'confidenceScore', OPPORTUNITY_SCORE: 'opportunityScore', CONCLUSION: 'conclusion' };
  for (const rawLine of String(value || '').split(/\r?\n/)) {
    const line = clean(rawLine.replace(/^[-*]\s*/, ''));
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toUpperCase().replace(/\s+/g, '_');
    const body = line.slice(separator + 1).trim();
    if (scalar[key]) { result[scalar[key]] = body; continue; }
    const parts = body.split(/\s*\|\|\s*/).map(clean);
    if (key === 'SNAPSHOT') {
      body.split(';').forEach(pair => { const [name, value] = pair.split('=').map(clean); if (name) snapshot[name] = Number(value); });
    } else if (key === 'INSIGHT') result.insights.push({ topic: parts[0], finding: parts[1], impact: parts[2] });
    else if (key === 'COUNTRY') result.countries.push({ name: parts[0], role: parts[1], score: Number(parts[2]), why: parts[3] });
    else if (key === 'OPPORTUNITY_ITEM') result.opportunities.push({ name: parts[0], why: parts[1], score: Number(parts[2]) });
    else if (key === 'RISK') result.risks.push({ name: parts[0], why: parts[1], severity: parts[2], score: Number(parts[3]), mitigation: parts[4] });
    else if (key === 'RECOMMENDATION') result.actions.push({ priority: parts[0], action: parts[1], why: parts[2], timeline: parts[3] });
  }
  result.snapshot = {
    marketMaturity: snapshot.maturity, demandLevel: snapshot.demand, supplyAvailability: snapshot.supply,
    competitionLevel: snapshot.competition, importDependence: snapshot.imports, exportPotential: snapshot.exports,
    logisticsComplexity: snapshot.logistics, regulatoryComplexity: snapshot.regulation,
  };
  return clean(result.summary) && result.insights.length >= 3 ? result : null;
}

function normalizeItems(value, fields, limit) {
  return array(value, limit).map(item => Object.fromEntries(fields.map(field => [field, clean(item?.[field])])));
}

function countryRows(rankings = {}) {
  return [
    ...array(rankings.producers, 5).map(item => ({ ...item, role: 'Producer' })),
    ...array(rankings.importers, 5).map(item => ({ ...item, role: 'Importer' })),
    ...array(rankings.exporters, 5).map(item => ({ ...item, role: 'Exporter' })),
  ].map(item => [item.role, clean(item.country), score(item.score), clean(item.rationale)]);
}

function snapshotMetrics(snapshot = {}, confidenceScore, opportunityScore) {
  const definitions = [
    ['Market maturity', snapshot.marketMaturity], ['Demand level', snapshot.demandLevel],
    ['Supply availability', snapshot.supplyAvailability], ['Competition level', snapshot.competitionLevel],
    ['Import dependence', snapshot.importDependence], ['Export potential', snapshot.exportPotential],
    ['Logistics complexity', snapshot.logisticsComplexity], ['Regulatory complexity', snapshot.regulatoryComplexity],
  ];
  return [
    { label: 'Opportunity score', value: `${opportunityScore}/100`, score: opportunityScore, note: comparativeBasis },
    { label: 'Executive confidence', value: `${confidenceScore}/100`, score: confidenceScore, note: 'Confidence in the qualitative assessment' },
    ...definitions.map(([label, value]) => ({ label, value: `${score(value)}/100`, score: score(value), note: comparativeBasis })),
  ];
}

export function buildMarketInsightV3Prompt({ query, productName, country, company = '', intent, evidence = null }) {
  const evidenceText = evidence ? JSON.stringify(evidence).slice(0, 8_000) : 'No live evidence supplied.';
  return `You are the Senior International Trade Market Intelligence Analyst at EsyGlob. Prepare a commissioned executive decision report.

PRODUCT OR INDUSTRY: ${productName || query}
TARGET MARKET: ${country || 'Global'}
COMPANY: ${company || 'Not provided'}
REQUEST: ${query}
INTENT: ${intent || 'market intelligence'}
SUPPLIED EVIDENCE: ${evidenceText}

Return only the structured line protocol below. Do not return JSON or markdown. Use plain ASCII punctuation. Do not greet, ask questions, discuss reasoning, mention models or prompts, or write conversationally. Optimize for decision value, not length. Avoid filler, repetition, textbook explanations and obvious advice. Never fabricate official figures, tariffs, prices, market shares or legal requirements. Use qualitative findings and estimated comparative scores from 0-100 when verified figures are unavailable.

The report must fit a premium 3-5 page executive PDF. Keep the summary to 90-120 words. Provide exactly 6 insights, 5 country comparisons, 4 opportunities, 4 risks and 5 actions. Keep every item concise and commercially specific. Use plain ASCII punctuation and compact lines without markdown.

Return exactly these lines. Repeat INSIGHT 6 times, COUNTRY 5 times, OPPORTUNITY_ITEM 4 times, RISK 4 times and RECOMMENDATION 5 times:
TITLE: specific report title
SUBTITLE: decision scope
SUMMARY: complete 90-120 word assessment on one line
ACTION: one decisive recommendation
CONFIDENCE: 0-100
OPPORTUNITY_SCORE: 0-100
SNAPSHOT: maturity=0;demand=0;supply=0;competition=0;imports=0;exports=0;logistics=0;regulation=0
INSIGHT: topic || finding || business impact
COUNTRY: country || Producer or Importer or Exporter || score || rationale
OPPORTUNITY_ITEM: name || commercial value || score
RISK: name || exposure || Low or Medium or High || score || mitigation
RECOMMENDATION: Immediate or High or Medium || action || rationale || timeline
CONCLUSION: 60-90 word executive conclusion
END`;
}

export function normalizeMarketInsightV3(rawValue, { query, productName, country, company = '' }) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const subject = clean(productName || query || 'Selected market');
  const market = clean(country || 'Global');
  const confidenceScore = score(raw.confidenceScore, 60);
  const opportunityScore = score(raw.opportunityScore, 60);
  const keyInsights = array(raw.keyInsights || raw.insights, 8).map(item => ({ topic: clean(item.topic), finding: clean(item.finding), businessImplication: clean(item.businessImplication || item.impact) })).filter(item => item.topic);
  const opportunities = array(raw.opportunities, 5).map(item => ({ title: clean(item.title || item.name), detail: clean(item.detail || item.why), score: score(item.score) })).filter(item => item.title);
  const risks = array(raw.risks, 5).map(item => ({ title: clean(item.title || item.name), detail: clean(item.detail || item.why), severity: clean(item.severity || 'Medium'), score: score(item.score), mitigation: clean(item.mitigation) })).filter(item => item.title);
  const recommendations = array(raw.recommendations || raw.actions, 6).map(item => ({ action: clean(item.action), rationale: clean(item.rationale || item.why), priority: clean(item.priority), timeline: clean(item.timeline) })).filter(item => item.action);
  const certifications = normalizeItems(raw.certifications, ['requirement', 'purpose', 'status'], 7).filter(item => item.requirement);
  const tradeRoutes = normalizeItems(raw.tradeRoutes, ['route', 'mode', 'advantage', 'constraint'], 5).filter(item => item.route);
  const metrics = snapshotMetrics(raw.snapshot, confidenceScore, opportunityScore);
  const compactRankings = array(raw.countries, 8).reduce((result, item) => { const role = clean(item.role).toLowerCase(); const key = role.startsWith('produc') ? 'producers' : role.startsWith('export') ? 'exporters' : 'importers'; result[key].push({ country: item.name, score: item.score, rationale: item.why }); return result; }, { producers: [], importers: [], exporters: [] });
  const rankings = raw.rankings || compactRankings;
  const rows = countryRows(rankings);
  const countryTable = rows.length ? { title: 'Priority country comparison', columns: ['Role', 'Country', 'Comparative score', 'Commercial rationale'], rows, source: comparativeBasis } : null;
  const certificationTable = certifications.length ? { title: 'Certification readiness checklist', columns: ['Requirement', 'Purpose', 'Status'], rows: certifications.map(item => [item.requirement, item.purpose, item.status]), source: 'Verify applicability with the relevant destination authority' } : null;
  const routeTable = tradeRoutes.length ? { title: 'Trade route summary', columns: ['Route', 'Mode', 'Advantage', 'Constraint'], rows: tradeRoutes.map(item => [item.route, item.mode, item.advantage, item.constraint]), source: 'Qualitative logistics assessment; validate current schedules and costs' } : null;
  const recommendationTable = recommendations.length ? { title: 'Executive action plan', columns: ['Priority', 'Action', 'Commercial rationale', 'Timeline'], rows: recommendations.map(item => [item.priority, item.action, item.rationale, item.timeline]), source: 'EsyGlob executive analysis' } : null;
  const charts = [
    { type: 'bar', title: 'Market snapshot', data: metrics.slice(2).map(item => ({ label: item.label, value: item.score })), source: comparativeBasis },
    rows.length > 1 ? { type: 'bar', title: 'Country attractiveness comparison', data: rows.slice(0, 10).map(row => ({ label: row[1], value: row[2] })), source: comparativeBasis } : null,
    opportunities.length > 1 ? { type: 'bar', title: 'Opportunity priority', data: opportunities.map(item => ({ label: item.title, value: item.score })), source: comparativeBasis } : null,
    risks.length > 1 ? { type: 'risk', title: 'Risk distribution', data: risks.map(item => ({ label: item.title, value: item.score, likelihood: item.severity, impact: item.severity })), source: comparativeBasis } : null,
  ].filter(Boolean).slice(0, 4);
  const executiveSummary = clean(raw.executiveSummary || raw.summary) || `${subject} in ${market} requires a focused commercial validation of demand, competition, market access and execution risk before commitment.`;
  const recommendedAction = clean(raw.recommendedAction || raw.action);
  const conclusion = clean(raw.conclusion) || recommendedAction || 'Proceed only after validating buyer demand, compliance requirements and landed economics.';
  return {
    schemaVersion: 'market-insight-v3',
    title: clean(raw.title) || `${subject} Executive Market Assessment — ${market}`,
    subtitle: clean(raw.subtitle) || 'Market attractiveness, execution risk and recommended action',
    company: clean(company), productName: subject, country: market,
    executiveSummary,
    recommendedAction: recommendedAction || conclusion,
    confidenceScore, opportunityScore,
    snapshot: raw.snapshot || {}, keyMetrics: metrics,
    keyInsights, rankings, opportunities, risks, recommendations, certifications, tradeRoutes,
    sections: [
      { key: 'executive-summary', title: 'Executive Summary', paragraphs: [executiveSummary], insights: [recommendedAction].filter(Boolean), metrics: metrics.slice(0, 2) },
      { key: 'key-market-analysis', title: 'Key Market Analysis', paragraphs: keyInsights.map(item => `${item.topic}: ${item.finding} ${item.businessImplication}`), tables: [countryTable].filter(Boolean), charts: charts.slice(0, 2) },
      { key: 'opportunities-risks', title: 'Opportunities & Risks', paragraphs: [], insights: [...opportunities.map(item => `${item.title}: ${item.detail}`), ...risks.map(item => `${item.title} (${item.severity}): ${item.detail}`)], charts: charts.slice(2) },
      { key: 'strategic-recommendations', title: 'Strategic Recommendations', paragraphs: recommendations.map(item => `${item.action}: ${item.rationale}`), tables: [recommendationTable, certificationTable, routeTable].filter(Boolean) },
      { key: 'executive-conclusion', title: 'Executive Conclusion', paragraphs: [conclusion], insights: [recommendedAction].filter(Boolean) },
    ],
    tables: [], charts,
    references: array(raw.references, 12),
    verificationNotice: comparativeBasis + '. Verify critical financial, customs, certification and legal inputs before decisions.',
  };
}

export default class MarketInsightReportV3Service {
  static status() {
    return { product: 'market-insights', pipeline: 'independent-executive-v3', model: OllamaRuntimeService.model, reportVersion: MARKET_INSIGHT_REPORT_VERSION };
  }

  static async generate(input) {
    const startedAt = Date.now();
    const response = await OllamaRuntimeService.complete({
      messages: [
        { role: 'system', content: 'You are the Senior International Trade Market Intelligence Analyst at EsyGlob. Return only the requested structured line protocol. Never respond conversationally or mention models, prompts, reasoning or internal systems.' },
        { role: 'user', content: buildMarketInsightV3Prompt(input) },
      ],
      jsonMode: false, temperature: .14, topP: .84,
      maxTokens: Math.max(900, Number(process.env.MARKET_INSIGHT_V3_MAX_TOKENS || 1_200)),
      contextSize: Math.max(4_096, Number(process.env.MARKET_INSIGHT_V3_CONTEXT_SIZE || 4_096)),
      timeoutMs: Math.max(60_000, Number(process.env.MARKET_INSIGHT_V3_TIMEOUT_MS || 120_000)),
      retry: false,
    });
    const parsed = parseJson(response.message) || parseLineReport(response.message);
    if (!parsed) throw Object.assign(new Error('Market Insights returned incomplete structured data. Please retry.'), { code: 'MARKET_INSIGHT_INVALID_JSON', statusCode: 503 });
    const normalized = normalizeMarketInsightV3(parsed, input);
    if (normalized.keyInsights.length < 4 || normalized.opportunities.length < 3 || normalized.risks.length < 3 || normalized.recommendations.length < 3) {
      throw Object.assign(new Error('Market Insights did not complete the executive recommendations. Please retry.'), { code: 'MARKET_INSIGHT_INCOMPLETE_REPORT', statusCode: 503 });
    }
    return {
      report: normalized,
      runtime: { segments: 1, tokensUsed: response.tokensUsed, outputSanitized: response.outputSanitized, generationTimeMs: Date.now() - startedAt },
    };
  }
}
