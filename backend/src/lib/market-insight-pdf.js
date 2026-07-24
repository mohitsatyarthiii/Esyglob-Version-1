import PDFDocument from 'pdfkit';

const PAGE = { left: 48, right: 547, top: 58, bottom: 760, width: 499 };
const COLORS = {
  navy: '#102a43',
  blue: '#2563eb',
  cyan: '#0891b2',
  ink: '#172033',
  slate: '#536176',
  muted: '#7b8798',
  line: '#dce3ec',
  soft: '#f4f7fb',
  green: '#047857',
  amber: '#b45309',
  red: '#b91c1c',
  white: '#ffffff',
};

const text = (value, fallback = 'Not available') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value.label || value.name || value.title || JSON.stringify(value);
  return String(value);
};
const titleCase = value => text(value, '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const safeFilename = value => `${text(value, 'market-intelligence-report').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 90)}.pdf`;
const formatDate = value => new Date(value || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const pageNumber = doc => doc.bufferedPageRange().count;

function ensureSpace(doc, height = 90) {
  if (doc.y + height <= PAGE.bottom) return;
  doc.addPage();
  doc.y = PAGE.top;
}

function rule(doc, color = COLORS.line) {
  doc.strokeColor(color).lineWidth(1).moveTo(PAGE.left, doc.y).lineTo(PAGE.right, doc.y).stroke();
}

function sectionHeading(doc, number, heading, subtitle = '') {
  ensureSpace(doc, 82);
  doc.roundedRect(PAGE.left, doc.y, 27, 27, 6).fill(COLORS.blue);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9).text(String(number).padStart(2, '0'), PAGE.left, doc.y + 8, { width: 27, align: 'center' });
  const y = doc.y;
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(15).text(text(heading), PAGE.left + 38, y + 1, { width: 455 });
  doc.y = y + 31;
  if (subtitle) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(text(subtitle), { lineGap: 2 });
  doc.moveDown(.45);
}

function paragraph(doc, value) {
  if (!value) return;
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(9.3).text(text(value), { lineGap: 3, align: 'justify' });
  doc.moveDown(.55);
}

function bullets(doc, values = [], color = COLORS.blue) {
  values.filter(Boolean).forEach(value => {
    ensureSpace(doc, 34);
    const y = doc.y + 3;
    doc.circle(PAGE.left + 3, y + 3, 2).fill(color);
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(9).text(text(value), PAGE.left + 13, doc.y, { width: PAGE.width - 13, lineGap: 2 });
    doc.moveDown(.35);
  });
}

function kpiCards(doc, kpis = []) {
  const rows = kpis.slice(0, 8);
  if (!rows.length) return;
  const gap = 9;
  const width = (PAGE.width - gap * 3) / 4;
  rows.forEach((item, index) => {
    if (index === 4) doc.y += 68;
    const column = index % 4;
    const y = index < 4 ? doc.y : doc.y;
    const x = PAGE.left + column * (width + gap);
    doc.roundedRect(x, y, width, 58, 7).fillAndStroke(COLORS.soft, COLORS.line);
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(13).text(text(item.value, '—'), x + 9, y + 10, { width: width - 18 });
    doc.fillColor(COLORS.slate).font('Helvetica-Bold').fontSize(7.5).text(text(item.label), x + 9, y + 31, { width: width - 18 });
    if (item.note) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5).text(text(item.note), x + 9, y + 43, { width: width - 18, ellipsis: true });
  });
  doc.y += 72;
}

function barChart(doc, chart) {
  const rows = (chart?.data || []).filter(item => Number.isFinite(Number(item.value))).slice(0, 7);
  if (!rows.length) return;
  ensureSpace(doc, 185);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10.5).text(text(chart.title, 'Trend comparison'));
  doc.moveDown(.45);
  const max = Math.max(...rows.map(item => Math.abs(Number(item.value))), 1);
  rows.forEach((item, index) => {
    const y = doc.y;
    const value = Number(item.value);
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.5).text(text(item.label), PAGE.left, y + 2, { width: 104, ellipsis: true });
    doc.roundedRect(PAGE.left + 108, y, 300, 11, 3).fill('#e8edf4');
    doc.roundedRect(PAGE.left + 108, y, Math.max(4, Math.abs(value) / max * 300), 11, 3).fill(index % 2 ? COLORS.cyan : COLORS.blue);
    doc.fillColor(COLORS.slate).font('Helvetica-Bold').fontSize(7).text(text(item.valueFmt || item.displayValue || value.toLocaleString('en-US')), PAGE.left + 416, y + 2, { width: 82, align: 'right' });
    doc.y = y + 18;
  });
  doc.moveDown(.55);
}

function dataTable(doc, table) {
  const columns = (table?.columns || Object.keys(table?.rows?.[0] || {})).slice(0, 5);
  const rows = (table?.rows || []).slice(0, 10);
  if (!columns.length || !rows.length) return;
  ensureSpace(doc, 120);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10.5).text(text(table.title, 'Analysis table'));
  doc.moveDown(.45);
  const widths = columns.map(() => PAGE.width / columns.length);
  const drawRow = (row, header = false) => {
    const height = header ? 25 : 31;
    ensureSpace(doc, height + 4);
    const y = doc.y;
    doc.rect(PAGE.left, y, PAGE.width, height).fill(header ? COLORS.navy : (Math.round(y) % 2 ? COLORS.soft : COLORS.white));
    columns.forEach((column, index) => {
      const x = PAGE.left + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
      const value = header ? titleCase(column) : text(row[column], '—');
      doc.fillColor(header ? COLORS.white : COLORS.slate).font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.2 : 6.9)
        .text(value, x + 6, y + (header ? 8 : 6), { width: widths[index] - 12, height: height - 9, ellipsis: true });
    });
    doc.y = y + height + 1;
  };
  drawRow(Object.fromEntries(columns.map(column => [column, column])), true);
  rows.forEach(row => drawRow(row));
  doc.moveDown(.65);
}

function coverPage(doc, report, metadata) {
  doc.rect(0, 0, 595.28, 841.89).fill(COLORS.navy);
  doc.circle(520, 90, 120).fillOpacity(.12).fill(COLORS.cyan);
  doc.circle(80, 770, 145).fillOpacity(.08).fill(COLORS.blue);
  doc.fillOpacity(1);
  doc.roundedRect(PAGE.left, 55, 36, 36, 9).fill(COLORS.blue);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(19).text('E', PAGE.left + 8, 63, { width: 20, align: 'center' });
  doc.fontSize(10).text('ESYGLOB MARKET INTELLIGENCE', PAGE.left + 48, 61);
  doc.fillColor('#9cc7ff').font('Helvetica').fontSize(8).text('AI-assisted, evidence-first business research', PAGE.left + 48, 77);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(29).text(text(report.title, 'Market Intelligence Report'), PAGE.left, 225, { width: PAGE.width, lineGap: 4 });
  doc.moveDown(.7).fillColor('#bdd1e8').font('Helvetica').fontSize(11).text(text(report.executiveSummary, 'Professional market intelligence prepared for informed sourcing and trade decisions.'), { width: 445, lineGap: 4 });
  doc.roundedRect(PAGE.left, 560, PAGE.width, 120, 10).fillOpacity(.12).fill(COLORS.white);
  doc.fillOpacity(1);
  const metaRows = [
    ['Report ID', metadata.reportId],
    ['Generated', formatDate(metadata.generatedAt)],
    ['Search query', report.query || metadata.query],
    ['Report version', metadata.reportVersion || '1.0'],
    ['Generated by', 'EsyGlob AI Market Intelligence'],
  ];
  metaRows.forEach(([label, value], index) => {
    const y = 578 + index * 19;
    doc.fillColor('#91acc8').font('Helvetica-Bold').fontSize(7.5).text(label.toUpperCase(), PAGE.left + 16, y, { width: 100 });
    doc.fillColor(COLORS.white).font('Helvetica').fontSize(8.5).text(text(value), PAGE.left + 125, y, { width: 345, ellipsis: true });
  });
  doc.fillColor('#8fa8c1').font('Helvetica').fontSize(7.5).text('Confidential business research • Verify material commercial and regulatory decisions with primary sources.', PAGE.left, 775, { width: PAGE.width, align: 'center' });
}

export async function buildMarketInsightPdf(report, metadata = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.left,
      bufferPages: true,
      info: {
        Title: text(report.title, 'EsyGlob Market Intelligence Report'),
        Author: 'EsyGlob AI Market Intelligence',
        Subject: text(report.query, 'Market research'),
        Keywords: 'market intelligence, B2B, trade, sourcing, EsyGlob',
      },
    });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    coverPage(doc, report, metadata);
    const sections = Array.isArray(report.sections) ? report.sections : [];
    const includeToc = sections.length >= 5;
    const tocEntries = [];
    if (includeToc) {
      doc.addPage();
      doc.y = PAGE.top;
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(22).text('Table of Contents');
      doc.moveDown(.4).fillColor(COLORS.muted).font('Helvetica').fontSize(9).text('Research sections and supporting analysis');
      doc.moveDown(1.2);
      sections.forEach((section, index) => {
        const y = doc.y;
        doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(8).text(String(index + 1).padStart(2, '0'), PAGE.left, y, { width: 25 });
        doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(text(section.title), PAGE.left + 32, y, { width: 400, ellipsis: true });
        doc.strokeColor('#cbd5e1').dash(1, { space: 2 }).moveTo(PAGE.left + 335, y + 8).lineTo(PAGE.left + 452, y + 8).stroke().undash();
        tocEntries.push({ y });
        doc.y = y + 24;
      });
    }

    doc.addPage();
    doc.y = PAGE.top;
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(21).text('Executive Summary');
    doc.moveDown(.65);
    doc.roundedRect(PAGE.left, doc.y, PAGE.width, 5, 2).fill(COLORS.blue);
    doc.moveDown(1);
    paragraph(doc, report.executiveSummary || report.summary);
    kpiCards(doc, report.kpis);
    if (report.dataIntegrityNotes?.length) {
      ensureSpace(doc, 85);
      doc.roundedRect(PAGE.left, doc.y, PAGE.width, 58, 7).fillAndStroke('#fff8e8', '#f1c46b');
      const y = doc.y + 10;
      doc.fillColor(COLORS.amber).font('Helvetica-Bold').fontSize(8).text('EVIDENCE & SCOPE NOTE', PAGE.left + 12, y);
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.8).text(text(report.dataIntegrityNotes[0]), PAGE.left + 12, y + 15, { width: PAGE.width - 24, height: 30, ellipsis: true });
      doc.y += 69;
    }

    const sectionPages = [];
    sections.forEach((section, index) => {
      ensureSpace(doc, 135);
      sectionPages[index] = pageNumber(doc);
      sectionHeading(doc, index + 1, section.title, section.evidenceType ? `Evidence: ${titleCase(section.evidenceType)}${section.confidence ? ` • Confidence ${section.confidence}%` : ''}` : '');
      paragraph(doc, section.summary || section.content);
      bullets(doc, section.points || section.bullets || []);
      (section.tables || []).forEach(table => dataTable(doc, table));
      (section.charts || []).forEach(chart => barChart(doc, chart));
      doc.moveDown(.7);
      rule(doc);
      doc.moveDown(.7);
    });

    (report.charts || []).forEach(chart => barChart(doc, chart));
    (report.tables || []).forEach(table => dataTable(doc, table));
    if (report.marketplaceSection) {
      sectionHeading(doc, sections.length + 1, report.marketplaceSection.title, 'Live EsyGlob marketplace context');
      paragraph(doc, report.marketplaceSection.summary);
      kpiCards(doc, Object.entries(report.marketplaceSection.metrics || {}).filter(([, value]) => ['string', 'number'].includes(typeof value)).slice(0, 8).map(([label, value]) => ({ label: titleCase(label), value })));
      (report.marketplaceSection.tables || []).forEach(table => dataTable(doc, table));
    }

    if (report.recommendations?.length || report.risks?.length) {
      ensureSpace(doc, 160);
      sectionHeading(doc, sections.length + 2, 'Recommendations & Risk Controls');
      doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(10).text('Recommended actions');
      doc.moveDown(.35);
      bullets(doc, report.recommendations || [], COLORS.green);
      doc.moveDown(.55).fillColor(COLORS.red).font('Helvetica-Bold').fontSize(10).text('Risk factors');
      doc.moveDown(.35);
      bullets(doc, (report.risks || []).map(item => item.reason || item.label || item), COLORS.red);
    }

    if (report.sources?.length) {
      ensureSpace(doc, 130);
      sectionHeading(doc, sections.length + 3, 'Sources & Methodology');
      paragraph(doc, 'Sources are listed for traceability. Publication dates, definitions and methodology should be reviewed before material decisions.');
      report.sources.slice(0, 18).forEach((source, index) => {
        ensureSpace(doc, 32);
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8).text(`${index + 1}. ${text(source.name || source.title, 'Research source')}`, { continued: false });
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text([source.type, source.status, source.url].filter(Boolean).join(' • '), { width: PAGE.width, ellipsis: true });
        doc.moveDown(.3);
      });
    }

    if (includeToc) {
      doc.switchToPage(1);
      tocEntries.forEach((entry, index) => {
        doc.fillColor(COLORS.slate).font('Helvetica-Bold').fontSize(8).text(String(sectionPages[index] || 3), PAGE.left + 459, entry.y, { width: 38, align: 'right' });
      });
    }

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      if (index > 0) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text('ESYGLOB MARKET INTELLIGENCE', PAGE.left, 27);
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(text(metadata.reportId), PAGE.left, 802, { width: 360 });
        doc.text(`Page ${index + 1} of ${range.count}`, 430, 802, { width: 117, align: 'right' });
      }
    }
    doc.end();
  });
}

export function sendMarketInsightPdf(res, buffer, report, disposition = 'inline') {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename(report.title)}"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(buffer);
}
