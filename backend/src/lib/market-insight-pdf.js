import PDFDocument from 'pdfkit';

const PAGE = { left: 45, right: 550, top: 55, bottom: 780, width: 505 };
const COLORS = {
  navy: '#0f172a',
  slate: '#334155',
  muted: '#64748b',
  light: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  accent: '#2563eb',
  accentLight: '#eff6ff',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  white: '#ffffff',
};

const text = (v, fallback = 'N/A') => (v !== null && v !== undefined && v !== '') ? String(v) : fallback;

export async function buildMarketInsightPdf(report, metadata = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let pageCount = 0;
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.left, bufferPages: true });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => { const buffer = Buffer.concat(chunks); buffer.pageCount = pageCount; resolve(buffer); });
    doc.on('error', reject);

    // ─── COVER PAGE ──────────────────────────────────────────────────
    renderCoverPage(doc, report, metadata);

    // ─── EXECUTIVE SUMMARY ───────────────────────────────────────────
    doc.addPage();
    sectionTitle(doc, 'Executive Summary', '1');
    doc.moveDown(0.5);
    bodyText(doc, report.executiveSummary || report.sections?.find(s => s.type === 'executive-summary')?.content || '', { size: 10, lineGap: 4 });

    // Key metrics box
    if (report.tables?.length) {
      doc.moveDown(1);
      doc.rect(PAGE.left, doc.y, PAGE.width, 1).fill(COLORS.border);
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.navy).text('Key Market Indicators', PAGE.left);
      doc.moveDown(0.5);
      
      report.tables[0]?.rows?.slice(0, 4).forEach(row => {
        const y = doc.y;
        doc.rect(PAGE.left, y, PAGE.width, 28).fill(row[0] % 2 ? COLORS.bg : COLORS.white);
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.slate).text(String(row[1] || ''), PAGE.left + 10, y + 8, { width: 200 });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text(String(row[2] || ''), PAGE.left + 280, y + 8, { width: 200, align: 'right' });
        doc.y = y + 28;
      });
    }

    // ─── REPORT SECTIONS ────────────────────────────────────────────
    const sections = report.sections || [];
    sections.forEach((section, index) => {
      doc.addPage();
      sectionTitle(doc, section.title, String(index + 2));

      if (section.content) {
        doc.moveDown(0.5);
        bodyText(doc, section.content, { size: 9.5, lineGap: 3.5 });
      }

      if (section.points?.length) {
        doc.moveDown(0.5);
        section.points.forEach(point => {
          bulletPoint(doc, point);
        });
      }

      if (section.statistics?.length) {
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text('Key Statistics', PAGE.left);
        doc.moveDown(0.5);
        section.statistics.forEach(stat => {
          const y = doc.y;
          doc.rect(PAGE.left, y, PAGE.width, 26).fill(COLORS.accentLight);
          doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.slate).text(text(stat.label), PAGE.left + 10, y + 5, { width: 250 });
          doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.navy).text(text(stat.value), PAGE.left + 280, y + 5, { width: 200, align: 'right' });
          if (stat.source) {
            doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(`Source: ${stat.source}`, PAGE.left + 280, y + 18, { width: 200, align: 'right' });
          }
          doc.y = y + 28;
        });
      }
    });

    // ─── TRADE DATA TABLES ──────────────────────────────────────────
    if (report.tables?.length) {
      doc.addPage();
      sectionTitle(doc, 'Trade Data & Statistics', String(sections.length + 2));
      
      report.tables.forEach(table => {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy).text(text(table.title), PAGE.left);
        doc.moveDown(0.4);
        
        const colWidth = PAGE.width / (table.columns?.length || 3);
        
        // Header
        const headerY = doc.y;
        doc.rect(PAGE.left, headerY, PAGE.width, 22).fill(COLORS.navy);
        table.columns?.forEach((col, i) => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.white)
            .text(String(col), PAGE.left + i * colWidth + 5, headerY + 6, { width: colWidth - 10, align: 'center' });
        });
        doc.y = headerY + 22;

        // Rows
        (table.rows || []).slice(0, 6).forEach((row, rowIdx) => {
          const rowY = doc.y;
          doc.rect(PAGE.left, rowY, PAGE.width, 22).fill(rowIdx % 2 ? COLORS.bg : COLORS.white);
          (Array.isArray(row) ? row : table.columns.map(c => row[c])).forEach((cell, i) => {
            doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.slate)
              .text(String(cell || ''), PAGE.left + i * colWidth + 5, rowY + 5, { width: colWidth - 10, align: i === 0 ? 'left' : 'center' });
          });
          doc.y = rowY + 22;
        });
        doc.moveDown(1);
      });
    }

    // ─── REFERENCES ──────────────────────────────────────────────────
    if (report.references?.length) {
      doc.addPage();
      sectionTitle(doc, 'References & Sources', String(sections.length + 3));
      doc.moveDown(0.5);
      report.references.forEach((ref, i) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slate).text(`${i + 1}. ${text(ref)}`, PAGE.left, doc.y, { width: PAGE.width, lineGap: 3 });
        doc.moveDown(0.3);
      });
    }

    // ─── FOOTER ──────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    pageCount = range.count;
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      if (i > 0) {
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.light)
          .text('CONFIDENTIAL — Market Intelligence Report', PAGE.left, 800, { width: 300 });
        doc.text(`Page ${i + 1} of ${range.count}`, PAGE.left + 350, 800, { width: 150, align: 'right' });
      }
    }

    doc.end();
  });
}

// ─── COVER PAGE ─────────────────────────────────────────────────────
function renderCoverPage(doc, report, metadata) {
  const { left, width } = PAGE;
  
  // Background
  doc.rect(0, 0, 595.28, 841.89).fill(COLORS.navy);
  
  // Decorative elements
  doc.circle(500, 100, 160).fillOpacity(0.06).fill(COLORS.accent);
  doc.circle(90, 750, 180).fillOpacity(0.04).fill(COLORS.accent);
  doc.fillOpacity(1);

  // Category badge
  doc.rect(left, 60, 120, 28).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.white).text('MARKET RESEARCH', left + 10, 67, { width: 100 });

  // Report type
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.light).text(report.reportType?.replace('_', ' ').toUpperCase() || 'MARKET INTELLIGENCE', left, 105);

  // Title
  doc.font('Helvetica-Bold').fontSize(28).fillColor(COLORS.white)
    .text(text(report.title, 'Market Intelligence Report'), left, 200, { width: width, lineGap: 6 });

  // Executive summary preview
  doc.font('Helvetica').fontSize(10).fillColor('#94a3b8')
    .text((report.executiveSummary || '').slice(0, 350), left, 310, { width: width - 20, lineGap: 4 });

  // Metadata box
  const metaY = 520;
  doc.rect(left, metaY, width, 140).fillOpacity(0.08).fill(COLORS.white);
  doc.fillOpacity(1);

  const metaItems = [
    ['REPORT ID', metadata.reportId || report.id],
    ['DATE', new Date(report.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['RESEARCH QUERY', report.query],
    ['VERSION', report.reportVersion || '1.0'],
    ['CLASSIFICATION', 'Confidential — For Authorized Recipients Only'],
  ];

  metaItems.forEach(([label, value], i) => {
    const y = metaY + 18 + i * 26;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(label, left + 16, y, { width: 120 });
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.white).text(text(value), left + 140, y, { width: width - 160, ellipsis: true });
  });

  // Footer
  doc.font('Helvetica').fontSize(7).fillColor('#64748b')
    .text('This report contains proprietary market analysis. Do not distribute without authorization.', left, 785, { width: width, align: 'center' });
}

// ─── HELPERS ────────────────────────────────────────────────────────
function sectionTitle(doc, title, number) {
  const y = doc.y;
  doc.rect(PAGE.left, y, 30, 30).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.white).text(String(number), PAGE.left, y + 8, { width: 30, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.navy).text(title, PAGE.left + 42, y + 4, { width: PAGE.width - 42 });
  doc.moveDown(0.3);
  doc.rect(PAGE.left, doc.y, PAGE.width, 1).fill(COLORS.accent);
  doc.y += 20;
}

function bodyText(doc, content, opts = {}) {
  if (!content) return;
  doc.font('Helvetica').fontSize(opts.size || 9.5).fillColor(COLORS.slate)
    .text(content, { width: PAGE.width, lineGap: opts.lineGap || 3.5, align: 'justify' });
}

function bulletPoint(doc, point) {
  if (!point) return;
  const y = doc.y + 3;
  doc.circle(PAGE.left + 4, y + 3, 2.5).fill(COLORS.accent);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.slate)
    .text(text(point), PAGE.left + 16, doc.y, { width: PAGE.width - 16, lineGap: 2.5 });
  doc.moveDown(0.4);
}

export function sendMarketInsightPdf(res, buffer, report, disposition = 'inline') {
  const frameOrigins = [
    process.env.PUBLIC_WEB_URL,
    ...String(process.env.CORS_ORIGIN || '').split(','),
  ].map(v => String(v || '').trim().replace(/\/$/, '')).filter(v => /^https?:\/\//i.test(v));

  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${[...new Set(frameOrigins)].join(' ')}`.trim());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${(report.title || 'market-report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(buffer);
}