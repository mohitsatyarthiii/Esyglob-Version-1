import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketInsightPdf } from '../src/lib/market-insight-pdf.js';
import { normalizeMarketInsightV3 } from '../src/services/market-insight-report-v3.service.js';

const paragraph = 'Demand is shaped by infrastructure investment, buyer specifications, domestic conversion capacity, landed cost and regulatory access. Commercial decisions should distinguish verified product-level evidence from broad macro indicators and should test downside assumptions before capital is committed.';

test('renders a dense continuous report with validated pages, tables, charts, branding and footers', async () => {
  const report = {
    id: 'layout-validation',
    title: 'Steel Market Analysis — India',
    subtitle: 'Demand, trade structure, supply-chain risk and market-entry priorities',
    query: 'Steel Market Analysis India',
    generatedFor: 'Validation User',
    generatedAt: new Date('2026-07-26T00:00:00Z').toISOString(),
    executiveHighlights: ['Infrastructure demand supports long-term opportunity.', 'Classification and standards must be verified.', 'Entry should follow a measured commercial pilot.'],
    keyMetrics: [
      { label: 'Knowledge sources', value: 12 },
      { label: 'Trade observations', value: 24 },
      { label: 'Markets compared', value: 8 },
      { label: 'Marketplace matches', value: 40 },
    ],
    sections: Array.from({ length: 9 }, (_, index) => ({
      title: ['Executive Summary', 'Market Overview', 'Industry Analysis', 'Supply Chain & Demand', 'Import and Export Analysis', 'Pricing and Competition', 'Regulatory Environment', 'Risk and Opportunity', 'Recommendations and Outlook'][index],
      paragraphs: [paragraph, paragraph, paragraph],
      insights: ['Validate the evidence scope.', 'Normalize price and trade units.', 'Assign an owner to each material risk.'],
      ...(index === 4 ? {
        tables: [{
          title: 'Country comparison',
          columns: ['Country', 'Import value', 'Export value', 'Year'],
          rows: Array.from({ length: 18 }, (_, row) => [`Market ${row + 1}`, `$${row + 2}B`, `$${row + 1}B`, 2025]),
          source: 'Connected official trade data',
        }],
        charts: [{
          type: 'bar',
          title: 'Import market comparison',
          data: Array.from({ length: 8 }, (_, row) => ({ label: `M${row + 1}`, value: (row + 1) * 10 })),
          source: 'Connected official trade data',
        }],
      } : {}),
    })),
    references: Array.from({ length: 12 }, (_, index) => ({ name: `Evidence source ${index + 1}`, type: 'official-data' })),
  };
  const pdf = await buildMarketInsightPdf(report, { reportId: report.id });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 10_000);
  assert.ok(pdf.pageCount >= 5);
  assert.equal(pdf.validation.passed, true);
  assert.deepEqual(pdf.validation.issues, []);
  assert.ok(pdf.layoutAudit.every(page => page.blocks > 0 && page.footer && page.logo));
});

test('renders the v3 executive report as a polished five-page PDF', async () => {
  const repeated = (prefix, count) => Array.from({ length: count }, (_, index) => ({
    topic: `${prefix} ${index + 1}`, finding: 'Commercial conditions support selective entry.', businessImplication: 'Validate with priority buyers before scaling.',
  }));
  const report = normalizeMarketInsightV3({
    title: 'Industrial Valves Executive Market Assessment — India', subtitle: 'Opportunity, risk and market-entry priorities',
    executiveSummary: 'The Indian industrial valve market offers selective opportunity in maintenance-intensive and infrastructure-linked applications. Entry economics depend on technical qualification, channel capability, landed cost and dependable service. A controlled distributor-led pilot should validate buyer specifications, certification scope and replacement demand before inventory or fixed investment is expanded.',
    recommendedAction: 'Launch a 90-day distributor and buyer validation pilot before committing inventory.', confidenceScore: 74, opportunityScore: 78,
    snapshot: { marketMaturity: 68, demandLevel: 81, supplyAvailability: 72, competitionLevel: 77, importDependence: 54, exportPotential: 69, logisticsComplexity: 48, regulatoryComplexity: 61 },
    keyInsights: repeated('Insight', 8),
    rankings: { producers: repeated('Producer', 3).map((_, i) => ({ country: ['China', 'Germany', 'India'][i], score: 80 - i * 4, rationale: 'Relevant production capability.' })), importers: [{ country: 'India', score: 76, rationale: 'Industrial demand.' }], exporters: [] },
    opportunities: Array.from({ length: 5 }, (_, i) => ({ title: `Opportunity ${i + 1}`, detail: 'Specific application demand supports targeted commercial development.', score: 82 - i * 3 })),
    risks: Array.from({ length: 5 }, (_, i) => ({ title: `Risk ${i + 1}`, detail: 'Qualification, price or execution exposure requires active mitigation.', severity: i < 2 ? 'High' : 'Medium', score: 76 - i * 4 })),
    recommendations: Array.from({ length: 6 }, (_, i) => ({ priority: i < 2 ? 'Immediate' : 'High', action: `Action ${i + 1}`, rationale: 'Converts a material uncertainty into a measurable decision.', timeline: `${(i + 1) * 15} days` })),
    certifications: [{ requirement: 'Applicable product standard', purpose: 'Market access', status: 'Verify' }],
    tradeRoutes: [{ route: 'Shanghai–Nhava Sheva', mode: 'Sea', advantage: 'Scale economics', constraint: 'Longer lead time' }],
    conclusion: 'Proceed with a controlled pilot focused on technical qualification, channel execution and validated landed economics.',
  }, { query: 'Industrial valves in India', productName: 'Industrial valves', country: 'India' });
  report.id = 'v3-layout-validation'; report.reportVersion = '7.0'; report.generatedAt = new Date('2026-08-04T00:00:00Z').toISOString();
  const pdf = await buildMarketInsightPdf(report, { reportId: report.id });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal(pdf.pageCount, 5);
  assert.equal(pdf.validation.passed, true);
});
