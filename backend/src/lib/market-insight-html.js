const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const asArray = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function list(items) {
  const rows = asArray(items).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  return rows ? `<ul>${rows}</ul>` : '';
}

function table(value) {
  const columns = asArray(value?.columns);
  const rows = asArray(value?.rows);
  if (!columns.length || !rows.length) return '';
  return `<figure class="table-block"><figcaption>${escapeHtml(value.title)}</figcaption>
    <table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${columns.map((_, index) => `<td>${escapeHtml(row?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${value.source ? `<small>Source: ${escapeHtml(value.source)}</small>` : ''}</figure>`;
}

function chart(value) {
  const rows = asArray(value?.data).filter(item => Number.isFinite(Number(item?.value))).slice(0, 12);
  if (!rows.length) return '';
  const max = Math.max(...rows.map(item => Math.abs(Number(item.value))), 1);
  return `<figure class="chart-block"><figcaption>${escapeHtml(value.title)}</figcaption><div class="bars">
    ${rows.map(item => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><i style="width:${Math.max(2, Math.round(Math.abs(Number(item.value)) / max * 100))}%"></i><b>${escapeHtml(Number(item.value).toLocaleString('en-US'))}</b></div>`).join('')}
    </div>${value.source ? `<small>Source: ${escapeHtml(value.source)}</small>` : ''}</figure>`;
}

function section(value, index) {
  const subsections = asArray(value.subsections).map(subsection => `<div class="subsection"><h3>${escapeHtml(subsection.title)}</h3>${asArray(subsection.paragraphs).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}${list(subsection.points)}</div>`).join('');
  return `<section id="section-${index + 1}"><header><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${escapeHtml(value.title)}</h2>${value.evidenceNote ? `<small>${escapeHtml(value.evidenceNote)}</small>` : ''}</div></header>
    ${asArray(value.paragraphs).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    ${list(value.insights || value.points)}
    ${asArray(value.metrics).length ? `<div class="metrics">${value.metrics.map(metric => `<article><small>${escapeHtml(metric.label)}</small><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.note)}</span></article>`).join('')}</div>` : ''}
    ${asArray(value.tables).map(table).join('')}${asArray(value.charts).map(chart).join('')}${subsections}</section>`;
}

export function buildMarketInsightHtml(report, metadata = {}) {
  const sections = asArray(report.sections).filter(item => clean(item?.title));
  if (!sections.some(item => /executive summary/i.test(item.title)) && clean(report.executiveSummary)) {
    sections.unshift({
      title: 'Executive Summary',
      paragraphs: [report.executiveSummary],
      insights: report.executiveHighlights,
      metrics: report.keyMetrics,
    });
  }
  const references = asArray(report.references || report.sources);
  const generatedAt = new Date(report.generatedAt || metadata.generatedAt || Date.now());
  const toc = sections.map((item, index) => `<li><a href="#section-${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(item.title)}</a></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>
    @page{size:A4;margin:18mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;color:#14213d;background:#fff;font:10.5pt/1.58 Arial,Helvetica,sans-serif}a{color:inherit;text-decoration:none}.cover{min-height:250mm;padding:35mm 12mm;background:linear-gradient(145deg,#071a33,#123b70);color:#fff;break-after:page}.brand{font-size:14pt;font-weight:800;letter-spacing:.03em}.eyebrow{margin-top:45mm;color:#8fd7ed;text-transform:uppercase;letter-spacing:.15em;font-size:8pt}.cover h1{font-size:30pt;line-height:1.08;margin:8mm 0 5mm;max-width:155mm}.cover p{font-size:13pt;color:#dbe8fa;max-width:150mm}.cover-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;margin-top:30mm;border-top:1px solid #48688f;padding-top:7mm}.cover-grid small,.metric small{display:block;color:#8ea5c8;text-transform:uppercase;letter-spacing:.08em}.toc{break-after:page}.toc h2{font-size:22pt}.toc ol{list-style:none;padding:0}.toc li{border-bottom:1px solid #d9e1ec}.toc a{display:flex;gap:8mm;padding:4mm 0}.toc span{color:#1769d2;font-weight:700}section{break-before:page}section>header{display:flex;gap:5mm;border-bottom:2px solid #1769d2;padding-bottom:4mm;margin-bottom:7mm}section>header>span{font-size:20pt;color:#1769d2;font-weight:800}h2{font-size:20pt;line-height:1.15;margin:0}h3{font-size:13pt;margin:7mm 0 2mm}p{margin:0 0 4mm;text-align:justify}ul{padding-left:6mm}li{margin-bottom:2mm}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm;margin:6mm 0}.metrics article{border:1px solid #d9e1ec;border-radius:3mm;padding:4mm;background:#f5f8fc;break-inside:avoid}.metrics strong{display:block;font-size:17pt;color:#1769d2}.metrics span{display:block;color:#6b778c}.table-block,.chart-block{margin:7mm 0;break-inside:avoid}.table-block figcaption,.chart-block figcaption{font-size:12pt;font-weight:700;margin-bottom:3mm}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.6pt}thead{display:table-header-group}tr{break-inside:avoid}th{background:#0b1f3a;color:#fff;text-align:left}th,td{padding:2.2mm;border:1px solid #d9e1ec;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#f5f8fc}figure small{display:block;color:#6b778c;margin-top:2mm}.bar-row{display:grid;grid-template-columns:34mm 1fr 25mm;align-items:center;gap:3mm;margin:2mm 0;font-size:8pt;break-inside:avoid}.bar-row i{display:block;height:4mm;background:linear-gradient(90deg,#1769d2,#13a8bd);border-radius:2mm}.bar-row b{text-align:right}.references{break-before:page}.references li{overflow-wrap:anywhere}.footer{position:fixed;bottom:-12mm;left:0;right:0;border-top:1px solid #d9e1ec;padding-top:2mm;color:#6b778c;font-size:7pt;display:flex;justify-content:space-between}.page-number:after{content:"Page " counter(page)}@media screen{body{background:#eef3f9}.report{width:210mm;margin:20px auto;background:#fff;padding:16mm;box-shadow:0 12px 40px #10233d1f}.cover{margin:-16mm -16mm 0;padding-left:28mm;padding-right:28mm}}@media(max-width:800px){.report{width:100%;margin:0;padding:20px;box-shadow:none}.cover{margin:-20px -20px 0;padding:60px 24px;min-height:auto}.cover h1{font-size:34px}.cover-grid,.metrics{grid-template-columns:1fr}section{break-before:auto;margin-top:48px}}
  </style></head><body><main class="report"><article class="cover"><div class="brand">EsyGlob Trade Intelligence</div><div class="eyebrow">Confidential market intelligence report</div><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle || report.query)}</p><div class="cover-grid"><div><small>Prepared for</small>${escapeHtml(report.generatedFor || 'EsyGlob member')}</div><div><small>Generated</small>${escapeHtml(generatedAt.toLocaleDateString('en-GB'))}</div><div><small>Product</small>${escapeHtml(report.productName || 'Not specified')}</div><div><small>Market</small>${escapeHtml(report.country || 'Global')}</div></div></article>
    <section class="toc"><h2>Contents</h2><ol>${toc}<li><a href="#references"><span>${String(sections.length + 1).padStart(2, '0')}</span>References &amp; Data Sources</a></li></ol></section>
    ${sections.map(section).join('')}
    <section class="references" id="references"><header><span>${String(sections.length + 1).padStart(2, '0')}</span><div><h2>References &amp; Data Sources</h2></div></header><ol>${references.map(reference => `<li>${escapeHtml(typeof reference === 'string' ? reference : [reference.name || reference.title, reference.publisher, reference.url].filter(Boolean).join(' — '))}</li>`).join('')}</ol><h3>Methodology</h3><p>${escapeHtml(report.methodology)}</p></section>
    <div class="footer"><span>CONFIDENTIAL • GENERATED BY ESYGLOB AI</span><span>${escapeHtml(report.reportVersion || metadata.reportVersion || '')} • <i class="page-number"></i></span></div></main></body></html>`;
}
