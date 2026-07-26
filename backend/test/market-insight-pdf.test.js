import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMarketInsightPdf } from '../src/lib/market-insight-pdf.js';

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
