import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketInsightHtml } from '../src/lib/market-insight-html.js';
import TradeIntentService from '../src/services/trade-intent.service.js';
import { normalizeMarketInsightV3 } from '../src/services/market-insight-report-v3.service.js';

test('extracts product, countries, direction and intent from representative trade queries', () => {
  const bilateral = TradeIntentService.parse({ query: 'Rice from Africa to India' });
  assert.equal(bilateral.product, 'Rice');
  assert.deepEqual(bilateral.originCountries, ['Africa']);
  assert.deepEqual(bilateral.destinationCountries, ['India']);
  assert.equal(bilateral.flow, 'bilateral');

  const exports = TradeIntentService.parse({ query: 'Steel exports from China' });
  assert.equal(exports.product, 'Steel');
  assert.deepEqual(exports.originCountries, ['China']);
  assert.ok(exports.intents.includes('export'));

  const market = TradeIntentService.parse({ query: 'Cotton market in Europe' });
  assert.equal(market.product, 'Cotton');
  assert.deepEqual(market.countries, ['Europe']);

  const suppliers = TradeIntentService.parse({ query: 'Copper suppliers in India' });
  assert.equal(suppliers.product, 'Copper');
  assert.deepEqual(suppliers.countries, ['India']);
  assert.ok(suppliers.intents.includes('supplier_discovery'));
});

test('creates the same canonical key for equivalent normalized trade queries', () => {
  const first = TradeIntentService.parse({ query: 'Steel exports from China' });
  const second = TradeIntentService.parse({ query: '  steel   export from china ' });
  assert.equal(first.queryKey, second.queryKey);
});

test('renders a complete, safe report HTML source with tables, charts and references', () => {
  const html = buildMarketInsightHtml({
    title: 'Rice <Market> Intelligence',
    subtitle: 'Africa to India',
    generatedFor: 'Procurement & Trade',
    generatedAt: '2026-07-31T00:00:00.000Z',
    reportVersion: '5.0',
    productName: 'Rice',
    country: 'India',
    sections: [{
      title: 'Import Analysis',
      paragraphs: ['Verified observations are normalized before analysis.'],
      insights: ['Validate HS classification.'],
      tables: [{ title: 'Trade observations', columns: ['Market', 'Value'], rows: [['India', 100]], source: 'Official source' }],
      charts: [{ title: 'Market comparison', data: [{ label: 'India', value: 100 }], source: 'Official source' }],
    }],
    references: [{ name: 'UN Comtrade', url: 'https://comtradeplus.un.org/' }],
    methodology: 'Parallel retrieval and source-aware validation.',
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Rice &lt;Market&gt; Intelligence/);
  assert.doesNotMatch(html, /Rice <Market>/);
  assert.match(html, /<table>/);
  assert.match(html, /Market comparison/);
  assert.match(html, /UN Comtrade/);
});

test('renders v2 SWOT, PESTLE and risk datasets as backend presentation components', () => {
  const html = buildMarketInsightHtml({
    title: 'Structured Market Report', generatedAt: '2026-08-03T00:00:00.000Z',
    sections: [
      { title: 'SWOT Analysis', paragraphs: ['Decision framework.'], tables: [{ title: 'SWOT decision matrix', columns: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'], rows: [['Scale', 'Concentration', 'Aftermarket', 'Volatility']] }] },
      { title: 'PESTLE Analysis', paragraphs: ['External environment.'], tables: [{ title: 'PESTLE priority matrix', columns: ['Factor', 'Impact', 'Priority', 'Response'], rows: [['Legal', 'Certification exposure', 'High', 'Validate scope']] }] },
      { title: 'Risk Assessment', paragraphs: ['Priority risks.'], charts: [{ type: 'risk', title: 'Risk priority heatmap', data: [{ label: 'Compliance', value: 80, likelihood: 'High', impact: 'High' }, { label: 'Freight', value: 55, likelihood: 'Medium', impact: 'Medium' }] }] },
    ],
    methodology: 'Structured analyst synthesis.',
  });
  assert.match(html, /class="swot-grid"/);
  assert.match(html, /class="pestle-grid"/);
  assert.match(html, /class="risk-grid"/);
});

test('renders Market Insights v3 as exactly five executive pages', () => {
  const report = normalizeMarketInsightV3({
    title: 'Industrial Valves — India', executiveSummary: 'A concise decision assessment.', recommendedAction: 'Validate demand through a distributor pilot.', confidenceScore: 72, opportunityScore: 78,
    snapshot: { marketMaturity: 65, demandLevel: 80, supplyAvailability: 70, competitionLevel: 75, importDependence: 55, exportPotential: 70, logisticsComplexity: 50, regulatoryComplexity: 60 },
    keyInsights: [{ topic: 'Demand', finding: 'Replacement demand is resilient.', businessImplication: 'Prioritize maintenance-intensive sectors.' }],
    rankings: { producers: [{ country: 'China', score: 82, rationale: 'Scale' }], importers: [{ country: 'India', score: 74, rationale: 'Industrial demand' }], exporters: [] },
    opportunities: [{ title: 'Aftermarket', detail: 'Recurring replacement demand.', score: 82 }],
    risks: [{ title: 'Qualification', detail: 'Approval cycles delay entry.', severity: 'High', score: 75 }],
    recommendations: [{ priority: 'Immediate', action: 'Start certification mapping', rationale: 'Prevents entry delay', timeline: '30 days' }],
    conclusion: 'Proceed with a controlled pilot after compliance validation.',
  }, { query: 'Industrial valves in India', productName: 'Industrial valves', country: 'India' });
  report.reportVersion = '7.0';
  const html = buildMarketInsightHtml(report);
  assert.equal((html.match(/<section class="page(?: |")/g) || []).length, 5);
  assert.match(html, /Executive Market Intelligence/);
  assert.match(html, /Overall opportunity/);
  assert.doesNotMatch(html, /Report roadmap/);
});
