import PDFDocument from 'pdfkit';

const PAGE = { left: 45, right: 550, top: 55, bottom: 790, width: 505 };
const COLORS = {
  navy: '#0f172a',
  slate: '#334155',
  muted: '#64748b',
  light: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  accent: '#2563eb',
  accentLight: '#eff6ff',
  white: '#ffffff',
};

const text = (v, f = 'N/A') => (v !== null && v !== undefined && v !== '') ? String(v) : f;

function ensureSpace(doc, needed = 60) {
  if (doc.y + needed > PAGE.bottom) {
    doc.addPage();
    doc.y = PAGE.top;
  }
}

function sectionTitle(doc, title, num) {
  ensureSpace(doc, 50);
  const y = doc.y;
  doc.rect(PAGE.left, y, 28, 28).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.white)
    .text(String(num), PAGE.left, y + 7, { width: 28, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.navy)
    .text(title, PAGE.left + 40, y + 3, { width: PAGE.width - 40 });
  doc.moveDown(0.2);
  doc.rect(PAGE.left, doc.y, PAGE.width, 1).fill(COLORS.accent);
  doc.y += 18;
}

function bodyText(doc, content, size = 9.5) {
  if (!content) return;
  ensureSpace(doc, 40);
  doc.font('Helvetica').fontSize(size).fillColor(COLORS.slate)
    .text(content, { width: PAGE.width, lineGap: 3.5, align: 'justify' });
}

function bulletList(doc, items) {
  if (!items?.length) return;
  items.forEach(item => {
    if (!item) return;
    ensureSpace(doc, 30);
    const y = doc.y + 3;
    doc.circle(PAGE.left + 4, y + 3, 2.5).fill(COLORS.accent);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.slate)
      .text(text(item), PAGE.left + 16, doc.y, { width: PAGE.width - 16, lineGap: 2.5 });
    doc.moveDown(0.3);
  });
}

function statsList(doc, stats) {
  if (!stats?.length) return;
  ensureSpace(doc, stats.length * 28 + 20);
  stats.forEach(stat => {
    const y = doc.y;
    doc.rect(PAGE.left, y, PAGE.width, 26).fill(COLORS.accentLight);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.slate)
      .text(text(stat.label), PAGE.left + 10, y + 5, { width: 250 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.navy)
      .text(text(stat.value), PAGE.left + 280, y + 5, { width: 200, align: 'right' });
    if (stat.source) {
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
        .text(`Source: ${stat.source}`, PAGE.left + 280, y + 18, { width: 200, align: 'right' });
    }
    doc.y = y + 28;
  });
}

function dataTable(doc, table) {
  if (!table?.rows?.length) return;
  const cols = table.columns || [];
  const colW = PAGE.width / (cols.length || 3);
  
  ensureSpace(doc, 80);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text(text(table.title), PAGE.left);
  doc.moveDown(0.3);

  // Header
  const hy = doc.y;
  doc.rect(PAGE.left, hy, PAGE.width, 22).fill(COLORS.navy);
  cols.forEach((col, i) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.white)
      .text(String(col), PAGE.left + i * colW + 4, hy + 6, { width: colW - 8, align: i === 0 ? 'left' : 'center' });
  });
  doc.y = hy + 22;

  // Rows
  table.rows.slice(0, 8).forEach((row, ri) => {
    ensureSpace(doc, 24);
    const ry = doc.y;
    doc.rect(PAGE.left, ry, PAGE.width, 22).fill(ri % 2 ? COLORS.bg : COLORS.white);
    (Array.isArray(row) ? row : cols.map(c => row[c])).forEach((cell, i) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.slate)
        .text(String(cell || ''), PAGE.left + i * colW + 4, ry + 5, { width: colW - 8, align: i === 0 ? 'left' : 'center' });
    });
    doc.y = ry + 22;
  });
  doc.moveDown(0.5);
}

function coverPage(doc, report, metadata) {
  doc.rect(0, 0, 595.28, 841.89).fill(COLORS.navy);
  doc.circle(500, 100, 160).fillOpacity(0.06).fill(COLORS.accent);
  doc.circle(90, 750, 180).fillOpacity(0.04).fill(COLORS.accent);
  doc.fillOpacity(1);

  doc.rect(PAGE.left, 60, 110, 26).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.white).text('MARKET RESEARCH', PAGE.left + 10, 67, { width: 90 });

  doc.font('Helvetica').fontSize(8).fillColor(COLORS.light)
    .text((report.reportType || 'market_intelligence').replace('_', ' ').toUpperCase(), PAGE.left, 102);

  doc.font('Helvetica-Bold').fontSize(26).fillColor(COLORS.white)
    .text(text(report.title, 'Market Intelligence Report'), PAGE.left, 190, { width: PAGE.width, lineGap: 5 });

  doc.font('Helvetica').fontSize(9.5).fillColor('#94a3b8')
    .text((report.executiveSummary || '').slice(0, 300), PAGE.left, 300, { width: PAGE.width - 20, lineGap: 3.5 });

  const metaY = 520;
  doc.rect(PAGE.left, metaY, PAGE.width, 130).fillOpacity(0.08).fill(COLORS.white);
  doc.fillOpacity(1);

  [
    ['REPORT ID', metadata.reportId || report.id],
    ['DATE', new Date(report.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['QUERY', report.query],
    ['VERSION', report.reportVersion || '1.0'],
    ['CLASSIFICATION', 'Confidential — For Authorized Recipients Only'],
  ].forEach(([label, value], i) => {
    const y = metaY + 16 + i * 23;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#64748b').text(label, PAGE.left + 14, y, { width: 100 });
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.white).text(text(value), PAGE.left + 120, y, { width: PAGE.width - 140, ellipsis: true });
  });

  doc.font('Helvetica').fontSize(6.5).fillColor('#64748b')
    .text('This report contains proprietary market analysis. Do not distribute without authorization.', PAGE.left, 790, { width: PAGE.width, align: 'center' });
}

export async function buildMarketInsightPdf(report, metadata = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let pageCount = 0;
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.left, bufferPages: true });

    doc.on('data', c => chunks.push(c));
    doc.on('end', () => { 
      const buffer = Buffer.concat(chunks); 
      buffer.pageCount = pageCount; 
      resolve(buffer); 
    });
    doc.on('error', reject);

    // Cover page
    coverPage(doc, report, metadata);

    // Sections
    const sections = report.sections || [];
    sections.forEach((section, i) => {
      doc.addPage();
      sectionTitle(doc, section.title, String(i + 1));
      
      if (section.content) {
        bodyText(doc, section.content);
      }
      
      if (section.points?.length) {
        doc.moveDown(0.3);
        bulletList(doc, section.points);
      }
      
      if (section.statistics?.length) {
        doc.moveDown(0.3);
        statsList(doc, section.statistics);
      }
    });

    // Tables
    if (report.tables?.length) {
      doc.addPage();
      sectionTitle(doc, 'Trade Data & Statistics', String(sections.length + 1));
      report.tables.forEach(table => {
        doc.moveDown(0.3);
        dataTable(doc, table);
      });
    }

    // References
    if (report.references?.length) {
      doc.addPage();
      sectionTitle(doc, 'References & Sources', String(sections.length + 2));
      report.references.forEach((ref, i) => {
        ensureSpace(doc, 22);
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slate)
          .text(`${i + 1}. ${text(ref)}`, PAGE.left, doc.y, { width: PAGE.width, lineGap: 2.5 });
        doc.moveDown(0.2);
      });
    }

    // Footers
    const range = doc.bufferedPageRange();
    pageCount = range.count;
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.light)
        .text('CONFIDENTIAL — Market Intelligence Report', PAGE.left, 805, { width: 300 });
      doc.text(`Page ${i + 1} of ${range.count}`, PAGE.left + 350, 805, { width: 150, align: 'right' });
    }

    doc.end();
  });
}

export function sendMarketInsightPdf(res, buffer, report, disposition = 'inline') {
  const origins = [
    process.env.PUBLIC_WEB_URL,
    ...String(process.env.CORS_ORIGIN || '').split(','),
  ].map(v => String(v || '').trim().replace(/\/$/, '')).filter(v => /^https?:\/\//i.test(v));

  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${[...new Set(origins)].join(' ')}`.trim());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${(report.title || 'market-report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(buffer);
}