import PDFDocument from 'pdfkit';

const A4 = { width: 595.28, height: 841.89 };
const PAGE = { left: 44, right: 551, top: 62, bottom: 775, width: 507 };
const COLORS = {
  ink: '#14213d', navy: '#0b1f3a', blue: '#1769d2', cyan: '#13a8bd',
  green: '#16835d', amber: '#b36b00', red: '#b42318', slate: '#3f4d63',
  muted: '#6b778c', line: '#d9e1ec', soft: '#f5f8fc', paleBlue: '#eaf2ff', white: '#ffffff',
};

const clean = (value, fallback = '') => String(value ?? fallback)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
const titleCase = value => clean(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const safeFilename = value => `${clean(value, 'esyglob-market-intelligence').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.pdf`;

function logo(doc, x, y, dark = false, compact = false) {
  const color = dark ? COLORS.white : COLORS.blue;
  doc.save();
  doc.roundedRect(x, y, compact ? 19 : 24, compact ? 19 : 24, compact ? 6 : 8).fill(color);
  doc.fillColor(dark ? COLORS.navy : COLORS.white).font('Helvetica-Bold').fontSize(compact ? 9 : 12)
    .text('E', x, y + (compact ? 5 : 6), { width: compact ? 19 : 24, align: 'center' });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(compact ? 8 : 11)
    .text('EsyGlob', x + (compact ? 25 : 31), y + (compact ? 5 : 6));
  doc.restore();
}

function sentences(value) {
  const input = clean(value);
  if (!input) return [];
  return input.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(item => item.trim()).filter(Boolean) || [input];
}

function createLayout(doc, compact) {
  const pages = [{ blocks: 1, headings: ['Cover'], footer: false, logo: true }];
  const bodySize = compact ? 8.35 : 8.8;
  const lineGap = compact ? 2.1 : 2.7;
  let current = 0;
  let explicitAdd = false;

  const mark = (kind, label = '') => {
    pages[current].blocks += 1;
    if (kind === 'heading') pages[current].headings.push(label);
  };
  const addPage = () => {
    current += 1;
    pages[current] = { blocks: 0, headings: [], footer: false, logo: false };
    explicitAdd = true;
    doc.addPage();
    explicitAdd = false;
    doc.y = PAGE.top;
  };
  doc.on('pageAdded', () => {
    if (explicitAdd) return;
    current += 1;
    pages[current] = { blocks: 1, headings: [], footer: false, logo: false };
    doc.y = PAGE.top;
  });
  const ensure = needed => {
    if (doc.y + needed > PAGE.bottom) addPage();
  };
  const paragraph = (value, options = {}) => {
    const parts = sentences(value);
    if (!parts.length) return;
    let buffer = '';
    for (const sentence of parts) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;
      const remaining = PAGE.bottom - doc.y;
      const height = doc.font('Helvetica').fontSize(options.size || bodySize)
        .heightOfString(candidate, { width: options.width || PAGE.width, lineGap });
      if (height <= remaining || !buffer) {
        buffer = candidate;
        if (height > remaining) {
          addPage();
          buffer = sentence;
        }
      } else {
        doc.fillColor(options.color || COLORS.slate).font('Helvetica').fontSize(options.size || bodySize)
          .text(buffer, options.x || PAGE.left, doc.y, { width: options.width || PAGE.width, lineGap, align: options.align || 'justify' });
        mark('paragraph');
        doc.moveDown(options.gap ?? .55);
        if (doc.y + 28 > PAGE.bottom) addPage();
        buffer = sentence;
      }
    }
    if (buffer) {
      doc.fillColor(options.color || COLORS.slate).font('Helvetica').fontSize(options.size || bodySize)
        .text(buffer, options.x || PAGE.left, doc.y, { width: options.width || PAGE.width, lineGap, align: options.align || 'justify' });
      mark('paragraph');
      doc.moveDown(options.gap ?? .55);
    }
  };
  const heading = (number, title, subtitle = '') => {
    ensure(88);
    const y = doc.y;
    doc.roundedRect(PAGE.left, y, 29, 29, 8).fill(COLORS.blue);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9)
      .text(String(number).padStart(2, '0'), PAGE.left, y + 9, { width: 29, align: 'center' });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(compact ? 14 : 15)
      .text(clean(title), PAGE.left + 40, y + 1, { width: PAGE.width - 40 });
    if (subtitle) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.2)
      .text(clean(subtitle), PAGE.left + 40, y + 20, { width: PAGE.width - 40 });
    doc.y = y + 39;
    doc.rect(PAGE.left, doc.y, PAGE.width, 1).fill(COLORS.line);
    doc.y += 11;
    mark('heading', title);
  };
  return { pages, get current() { return current; }, addPage, ensure, paragraph, heading, mark, bodySize, lineGap };
}

function bulletList(doc, layout, items = []) {
  for (const item of items.filter(Boolean)) {
    const value = typeof item === 'string' ? item : item.text || item.label || item.reason;
    const height = Math.max(23, doc.font('Helvetica').fontSize(layout.bodySize).heightOfString(clean(value), { width: PAGE.width - 22, lineGap: layout.lineGap }) + 7);
    layout.ensure(height);
    const y = doc.y;
    doc.circle(PAGE.left + 4, y + 5, 2.4).fill(COLORS.blue);
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(layout.bodySize)
      .text(clean(value), PAGE.left + 17, y, { width: PAGE.width - 17, lineGap: layout.lineGap });
    doc.y = y + height;
    layout.mark('bullet');
  }
  doc.moveDown(.25);
}

function metricCards(doc, layout, metrics = []) {
  const rows = metrics.filter(item => item?.label && item?.value !== undefined).slice(0, 8);
  if (!rows.length) return;
  const columns = rows.length < 3 ? rows.length : 4;
  const width = (PAGE.width - (columns - 1) * 8) / columns;
  for (let offset = 0; offset < rows.length; offset += columns) {
    layout.ensure(66);
    const y = doc.y;
    rows.slice(offset, offset + columns).forEach((item, index) => {
      const x = PAGE.left + index * (width + 8);
      doc.roundedRect(x, y, width, 57, 7).fillAndStroke(COLORS.soft, COLORS.line);
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.7)
        .text(clean(item.label).toUpperCase(), x + 9, y + 9, { width: width - 18, height: 9, ellipsis: true });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12)
        .text(clean(item.value, 'N/A'), x + 9, y + 24, { width: width - 18, height: 17, ellipsis: true });
      if (item.note) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.2)
        .text(clean(item.note), x + 9, y + 43, { width: width - 18, height: 8, ellipsis: true });
    });
    doc.y = y + 65;
    layout.mark('metrics');
  }
}

function tableRows(table) {
  const columns = (table.columns || []).map(column => typeof column === 'string' ? column : column.label || column.key);
  return {
    columns,
    rows: (table.rows || []).map(row => Array.isArray(row) ? row : columns.map(column => row[column])),
  };
}

function dataTable(doc, layout, table) {
  const { columns, rows } = tableRows(table);
  if (!columns.length || !rows.length) return;
  layout.ensure(75);
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9.3).text(clean(table.title, 'Data table'));
  if (table.subtitle) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.8).text(clean(table.subtitle));
  doc.moveDown(.35);
  const weights = columns.map((_, index) => index === 0 ? 1.45 : 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map(value => PAGE.width * value / totalWeight);
  const drawHeader = () => {
    layout.ensure(25);
    const y = doc.y;
    doc.rect(PAGE.left, y, PAGE.width, 23).fill(COLORS.navy);
    let x = PAGE.left;
    columns.forEach((column, index) => {
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(6.7)
        .text(clean(column), x + 5, y + 7, { width: widths[index] - 10, height: 10, ellipsis: true, align: index ? 'center' : 'left' });
      x += widths[index];
    });
    doc.y = y + 23;
  };
  drawHeader();
  rows.forEach((row, rowIndex) => {
    const cells = row.map(clean);
    const heights = cells.map((cell, index) => doc.font('Helvetica').fontSize(6.8)
      .heightOfString(cell, { width: widths[index] - 10, lineGap: 1 }));
    const height = Math.min(48, Math.max(22, ...heights) + 10);
    if (doc.y + height > PAGE.bottom) {
      layout.addPage();
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7)
        .text(`${clean(table.title, 'Table')} — continued`);
      doc.moveDown(.3);
      drawHeader();
    }
    const y = doc.y;
    doc.rect(PAGE.left, y, PAGE.width, height).fill(rowIndex % 2 ? COLORS.soft : COLORS.white);
    doc.rect(PAGE.left, y, PAGE.width, height).stroke(COLORS.line);
    let x = PAGE.left;
    cells.forEach((cell, index) => {
      doc.fillColor(COLORS.slate).font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8)
        .text(cell, x + 5, y + 5, { width: widths[index] - 10, height: height - 8, ellipsis: true, align: index ? 'center' : 'left' });
      x += widths[index];
    });
    doc.y = y + height;
    layout.mark('table-row');
  });
  if (table.source) doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.3)
    .text(`Source: ${clean(table.source)}`, PAGE.left, doc.y + 4, { width: PAGE.width });
  doc.y += table.source ? 17 : 9;
}

function normalizedSeries(chart) {
  const input = chart.data || chart.series || chart.values || [];
  return input.map((item, index) => ({
    label: clean(item.label || item.country || item.year || item.name || `Item ${index + 1}`),
    value: numeric(item.value ?? item.valueUsd ?? item.amount ?? item.share),
  })).filter(item => item.label && item.value !== null);
}

function chart(doc, layout, item) {
  const data = normalizedSeries(item).slice(0, 10);
  if (data.length < 2) return;
  const height = 190;
  layout.ensure(height + 40);
  const x = PAGE.left;
  const y = doc.y;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9.3).text(clean(item.title, 'Market data'));
  doc.y += 10;
  const top = doc.y;
  doc.roundedRect(x, top, PAGE.width, height, 7).fillAndStroke(COLORS.soft, COLORS.line);
  const type = item.type || 'bar';
  const max = Math.max(...data.map(point => Math.abs(point.value)), 1);
  if (type === 'pie') {
    const total = data.reduce((sum, point) => sum + Math.max(0, point.value), 0) || 1;
    const palette = [COLORS.blue, COLORS.cyan, COLORS.green, COLORS.amber, '#7c5ce7', '#ef6a8a'];
    let angle = -Math.PI / 2;
    data.slice(0, 6).forEach((point, index) => {
      const next = angle + Math.PI * 2 * Math.max(0, point.value) / total;
      doc.save().moveTo(x + 112, top + 94).lineTo(x + 112 + Math.cos(angle) * 64, top + 94 + Math.sin(angle) * 64)
        .arc(x + 112, top + 94, 64, angle * 180 / Math.PI, next * 180 / Math.PI).closePath().fill(palette[index]);
      doc.restore();
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.8)
        .text(`${point.label}  ${Math.round(point.value / total * 100)}%`, x + 205, top + 27 + index * 21, { width: 270 });
      angle = next;
    });
  } else {
    const chartX = x + 38;
    const chartY = top + 26;
    const chartW = PAGE.width - 60;
    const chartH = 118;
    doc.moveTo(chartX, chartY).lineTo(chartX, chartY + chartH).lineTo(chartX + chartW, chartY + chartH).stroke(COLORS.line);
    const step = chartW / data.length;
    if (['line', 'area'].includes(type)) {
      const points = data.map((point, index) => [chartX + step * index + step / 2, chartY + chartH - Math.max(0, point.value) / max * (chartH - 8)]);
      if (type === 'area') {
        doc.save().moveTo(points[0][0], chartY + chartH);
        points.forEach(([px, py]) => doc.lineTo(px, py));
        doc.lineTo(points.at(-1)[0], chartY + chartH).closePath().fillOpacity(.13).fill(COLORS.blue).fillOpacity(1).restore();
      }
      doc.moveTo(...points[0]);
      points.slice(1).forEach(point => doc.lineTo(...point));
      doc.lineWidth(2).stroke(COLORS.blue).lineWidth(1);
      points.forEach(point => doc.circle(...point, 2.7).fill(COLORS.blue));
    } else {
      data.forEach((point, index) => {
        const barH = Math.max(2, Math.abs(point.value) / max * (chartH - 8));
        doc.roundedRect(chartX + index * step + step * .19, chartY + chartH - barH, step * .62, barH, 2).fill(index % 2 ? COLORS.cyan : COLORS.blue);
      });
    }
    data.forEach((point, index) => doc.fillColor(COLORS.muted).font('Helvetica').fontSize(5.8)
      .text(point.label, chartX + index * step, chartY + chartH + 7, { width: step, height: 20, ellipsis: true, align: 'center' }));
  }
  doc.y = top + height + 7;
  if (item.source) doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.3).text(`Source: ${clean(item.source)}`);
  doc.y += 9;
  layout.mark('chart');
}

function cover(doc, report, metadata) {
  doc.rect(0, 0, A4.width, A4.height).fill(COLORS.navy);
  doc.circle(535, 90, 190).fillOpacity(.08).fill(COLORS.blue);
  doc.circle(50, 810, 155).fillOpacity(.05).fill(COLORS.cyan);
  doc.fillOpacity(1);
  logo(doc, PAGE.left, 45, true);
  doc.fillColor('#9db9e6').font('Helvetica-Bold').fontSize(7.5)
    .text('ESYGLOB MARKET INTELLIGENCE REPORT', PAGE.left, 105, { characterSpacing: 1.15 });
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(27)
    .text(clean(report.title, 'Global Market Intelligence'), PAGE.left, 145, { width: PAGE.width, lineGap: 4 });
  doc.fillColor('#b8c6dc').font('Helvetica').fontSize(10)
    .text(clean(report.subtitle || report.query), PAGE.left, 245, { width: PAGE.width, lineGap: 3 });
  const highlights = (report.executiveHighlights || report.recommendations || []).slice(0, 3);
  let y = 335;
  doc.fillColor('#8ea5c8').font('Helvetica-Bold').fontSize(7).text('EXECUTIVE HIGHLIGHTS', PAGE.left, y);
  y += 20;
  highlights.forEach((highlight, index) => {
    doc.roundedRect(PAGE.left, y, PAGE.width, 48, 7).fillOpacity(.08).fill(COLORS.white);
    doc.fillOpacity(1).circle(PAGE.left + 17, y + 16, 8).fill(COLORS.blue);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(7).text(String(index + 1), PAGE.left + 13, y + 13, { width: 8, align: 'center' });
    doc.fillColor('#dce6f5').font('Helvetica').fontSize(7.5).text(clean(highlight), PAGE.left + 34, y + 10, { width: PAGE.width - 46, height: 30, ellipsis: true, lineGap: 1.5 });
    y += 57;
  });
  const metrics = (report.keyMetrics || report.kpis || []).slice(0, 4);
  if (metrics.length) {
    y += 6;
    const width = (PAGE.width - 18) / 4;
    metrics.forEach((metric, index) => {
      const x = PAGE.left + index * (width + 6);
      doc.fillColor('#8ea5c8').font('Helvetica-Bold').fontSize(6).text(clean(metric.label).toUpperCase(), x, y, { width });
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11).text(clean(metric.value), x, y + 13, { width, height: 15, ellipsis: true });
    });
  }
  const generatedAt = new Date(report.generatedAt || Date.now());
  doc.fillColor('#8ea5c8').font('Helvetica').fontSize(7)
    .text(`Generated for  ${clean(report.generatedFor, 'EsyGlob member')}`, PAGE.left, 748)
    .text(`Prepared by  EsyGlob AI Market Intelligence`, PAGE.left, 764)
    .text(`${generatedAt.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}  •  ${clean(metadata.reportId || report.id)}`, PAGE.left, 780);
}

function contents(doc, layout, report) {
  layout.addPage();
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(20).text('Report roadmap');
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('A structured view of the evidence, analysis and decision frameworks included in this report.');
  doc.moveDown(1);
  const sections = report.sections || [];
  sections.forEach((section, index) => {
    layout.ensure(22);
    const y = doc.y;
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(7).text(String(index + 1).padStart(2, '0'), PAGE.left, y, { width: 25 });
    doc.fillColor(COLORS.slate).font('Helvetica-Bold').fontSize(8).text(clean(section.title), PAGE.left + 32, y, { width: PAGE.width - 32 });
    doc.y = y + 20;
    layout.mark('toc');
  });
  layout.ensure(105);
  doc.moveDown(.6);
  doc.roundedRect(PAGE.left, doc.y, PAGE.width, 85, 8).fillAndStroke(COLORS.paleBlue, '#cbdcf7');
  const y = doc.y + 11;
  doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(8).text('RESEARCH METHOD & EVIDENCE SCOPE', PAGE.left + 13, y);
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.3)
    .text(clean(report.methodology || 'Hybrid semantic and lexical knowledge retrieval, live trade-data collection, marketplace evidence, AI-assisted synthesis, cross-validation and source-aware editorial review.'), PAGE.left + 13, y + 17, { width: PAGE.width - 26, height: 50, lineGap: 2 });
  doc.y += 95;
  layout.mark('methodology');
  metricCards(doc, layout, report.keyMetrics || report.kpis);
}

function render(report, metadata, compact = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margins: { top: PAGE.top, bottom: A4.height - PAGE.bottom, left: PAGE.left, right: A4.width - PAGE.right }, bufferPages: true, autoFirstPage: true });
    const layout = createLayout(doc, compact);
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      buffer.pageCount = layout.pages.length;
      buffer.layoutAudit = layout.pages;
      resolve(buffer);
    });

    cover(doc, report, metadata);
    contents(doc, layout, report);
    let sectionNumber = 0;
    for (const section of report.sections || []) {
      if (!clean(section.title)) continue;
      sectionNumber += 1;
      layout.heading(sectionNumber, section.title, section.subtitle || section.evidenceNote);
      for (const paragraph of section.paragraphs || [section.narrative || section.content || section.summary]) layout.paragraph(paragraph);
      bulletList(doc, layout, section.insights || section.points || section.bullets || []);
      metricCards(doc, layout, section.metrics || section.statistics || []);
      for (const table of section.tables || []) dataTable(doc, layout, table);
      for (const item of section.charts || []) chart(doc, layout, item);
      for (const subsection of section.subsections || []) {
        layout.ensure(55);
        doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10).text(clean(subsection.title));
        doc.rect(PAGE.left, doc.y + 2, 38, 2).fill(COLORS.cyan);
        doc.y += 11;
        layout.mark('subheading', subsection.title);
        for (const paragraph of subsection.paragraphs || [subsection.content]) layout.paragraph(paragraph);
        bulletList(doc, layout, subsection.points || []);
      }
      doc.moveDown(.35);
    }
    for (const table of report.tables || []) dataTable(doc, layout, table);
    for (const item of report.charts || []) chart(doc, layout, item);
    const references = report.references || report.sources || [];
    if (references.length) {
      layout.heading(sectionNumber + 1, 'References & Evidence Register', 'Sources are listed for traceability; material decisions should verify publication dates and definitions.');
      references.forEach((reference, index) => {
        const label = typeof reference === 'string' ? reference : [reference.name || reference.title, reference.publisher, reference.url].filter(Boolean).join(' — ');
        layout.paragraph(`${index + 1}. ${label}`, { size: 7.5, align: 'left', gap: .25 });
      });
    }

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const previousBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      if (index > 0) {
        logo(doc, PAGE.left, 24, false, true);
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.3)
          .text(clean(report.title), PAGE.left + 85, 30, { width: PAGE.width - 85, align: 'right', height: 9, ellipsis: true });
        doc.moveTo(PAGE.left, 48).lineTo(PAGE.right, 48).stroke(COLORS.line);
      }
      doc.moveTo(PAGE.left, 791).lineTo(PAGE.right, 791).stroke(index ? COLORS.line : '#39506f');
      doc.fillColor(index ? COLORS.muted : '#8ea5c8').font('Helvetica').fontSize(6.2);
      doc.text('CONFIDENTIAL • GENERATED BY ESYGLOB AI', PAGE.left, 800, { width: 245, lineBreak: false });
      doc.text(new Date(report.generatedAt || Date.now()).toLocaleString('en-GB'), PAGE.left + 190, 800, { width: 200, align: 'center', lineBreak: false });
      doc.text(`Page ${index + 1} of ${range.count}`, PAGE.left + 390, 800, { width: 117, align: 'right', lineBreak: false });
      layout.pages[index].footer = true;
      layout.pages[index].logo = true;
      doc.page.margins.bottom = previousBottomMargin;
    }
    doc.end();
  });
}

function validate(buffer) {
  const pages = buffer.layoutAudit || [];
  const issues = [];
  if (!buffer?.length || buffer.subarray(0, 4).toString() !== '%PDF') issues.push('invalid-pdf');
  pages.forEach((page, index) => {
    if (page.blocks < 1) issues.push(`empty-page-${index + 1}`);
    if (!page.footer) issues.push(`missing-footer-${index + 1}`);
    if (!page.logo) issues.push(`missing-logo-${index + 1}`);
  });
  return { passed: issues.length === 0, issues, pageCount: pages.length };
}

export async function buildMarketInsightPdf(report, metadata = {}) {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    last = await render(report, metadata, attempt === 1);
    const audit = validate(last);
    last.validation = audit;
    if (audit.passed) return last;
  }
  throw new Error(`PDF quality validation failed: ${last?.validation?.issues?.join(', ') || 'unknown layout error'}`);
}

export function sendMarketInsightPdf(res, buffer, report, disposition = 'inline') {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename(report.title)}"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buffer);
}
