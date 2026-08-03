const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const asArray = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;

function list(items) {
  const rows = asArray(items).map(item => `<li>${escapeHtml(typeof item === 'string' ? item : item.text || item.label || item.reason)}</li>`).join('');
  return rows ? `<ul>${rows}</ul>` : '';
}

function table(value) {
  const columns = asArray(value?.columns);
  const rows = asArray(value?.rows);
  if (!columns.length || !rows.length) return '';
  if (/SWOT decision matrix/i.test(value.title)) {
    return `<figure class="table-block matrix-block"><figcaption>${escapeHtml(value.title)}</figcaption><div class="swot-grid">${columns.map((column, index) => `<article class="swot-${index + 1}"><h3>${escapeHtml(column)}</h3>${list(rows.map(row => row?.[index]).filter(Boolean))}</article>`).join('')}</div>${value.source ? `<small>Source / basis: ${escapeHtml(value.source)}</small>` : ''}</figure>`;
  }
  if (/PESTLE priority matrix/i.test(value.title)) {
    return `<figure class="table-block matrix-block"><figcaption>${escapeHtml(value.title)}</figcaption><div class="pestle-grid">${rows.map(row => `<article><strong>${escapeHtml(row?.[0])}</strong><span class="priority">${escapeHtml(row?.[2])}</span><p>${escapeHtml(row?.[1])}</p><small>${escapeHtml(row?.[3])}</small></article>`).join('')}</div>${value.source ? `<small>Source / basis: ${escapeHtml(value.source)}</small>` : ''}</figure>`;
  }
  return `<figure class="table-block"><figcaption>${escapeHtml(value.title)}</figcaption>
    ${value.subtitle ? `<p class="caption-note">${escapeHtml(value.subtitle)}</p>` : ''}
    <table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${columns.map((_, index) => `<td>${escapeHtml(row?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${value.source ? `<small>Source / basis: ${escapeHtml(value.source)}</small>` : ''}</figure>`;
}

function chartSeries(value) {
  return asArray(value?.data).map((item, index) => ({
    label: clean(item?.label || item?.name || `Item ${index + 1}`),
    value: numeric(item?.value),
    likelihood: clean(item?.likelihood), impact: clean(item?.impact),
  })).filter(item => item.label && item.value !== null).slice(0, 12);
}

function svgTrend(rows, area = false) {
  if (!rows.length) return '';
  const width = 720; const height = 220; const pad = 28;
  const max = Math.max(...rows.map(item => Math.abs(item.value)), 1);
  const points = rows.map((item, index) => `${pad + index * (width - pad * 2) / (rows.length - 1)},${height - pad - Math.max(0, item.value) / max * (height - pad * 2)}`).join(' ');
  const areaShape = area ? `<polygon points="${pad},${height - pad} ${points} ${width - pad},${height - pad}" fill="#1769d21b"/>` : '';
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend chart">${areaShape}<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#d9e1ec"/><polyline points="${points}" fill="none" stroke="#1769d2" stroke-width="5" stroke-linejoin="round"/>${rows.map((item, index) => { const [x, y] = points.split(' ')[index].split(','); return `<circle cx="${x}" cy="${y}" r="6" fill="#13a8bd"/><text x="${x}" y="${height - 6}" text-anchor="middle">${escapeHtml(item.label)}</text>`; }).join('')}</svg>`;
}

function chart(value) {
  const rows = chartSeries(value);
  if (!rows.length) return '';
  const max = Math.max(...rows.map(item => Math.abs(item.value)), 1);
  let body;
  if (value.type === 'pie') {
    const total = rows.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
    const palette = ['#1769d2', '#13a8bd', '#16835d', '#d58b16', '#7357d9', '#d94f70'];
    let cursor = 0;
    const gradient = rows.slice(0, 6).map((item, index) => { const start = cursor; cursor += Math.max(0, item.value) / total * 100; return `${palette[index]} ${start.toFixed(1)}% ${cursor.toFixed(1)}%`; }).join(',');
    body = `<div class="pie-layout"><div class="pie" style="background:conic-gradient(${gradient})"></div><div class="legend">${rows.slice(0, 6).map((item, index) => `<span><i style="background:${palette[index]}"></i>${escapeHtml(item.label)} <b>${Math.round(item.value / total * 100)}%</b></span>`).join('')}</div></div>`;
  } else if ((value.type === 'line' || value.type === 'area') && rows.length > 1) {
    body = svgTrend(rows, value.type === 'area');
  } else if (value.type === 'risk') {
    body = `<div class="risk-grid">${rows.map(item => `<article class="risk risk-${Math.ceil(item.value / 34)}"><strong>${escapeHtml(item.label)}</strong><span>${item.value}/100</span><small>${escapeHtml(item.likelihood)} likelihood · ${escapeHtml(item.impact)} impact</small></article>`).join('')}</div>`;
  } else {
    body = `<div class="bars">${rows.map(item => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><i><em style="width:${Math.max(2, Math.round(Math.abs(item.value) / max * 100))}%"></em></i><b>${escapeHtml(item.value)}${value.unit ? ` ${escapeHtml(value.unit)}` : ''}</b></div>`).join('')}</div>`;
  }
  return `<figure class="chart-block"><figcaption>${escapeHtml(value.title)}</figcaption>${body}${value.source ? `<small>Source / basis: ${escapeHtml(value.source)}</small>` : ''}</figure>`;
}

function metrics(values) {
  const data = asArray(values).filter(item => item?.label && item?.value !== undefined).slice(0, 12);
  return data.length ? `<div class="metrics">${data.map(item => `<article><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.note)}</span></article>`).join('')}</div>` : '';
}

function section(value, index) {
  const subsections = asArray(value.subsections).map(item => `<div class="subsection"><h3>${escapeHtml(item.title)}</h3>${asArray(item.paragraphs).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}${list(item.points)}</div>`).join('');
  return `<section id="section-${index + 1}"><header><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${escapeHtml(value.title)}</h2>${value.evidenceNote ? `<small>${escapeHtml(value.evidenceNote)}</small>` : ''}</div></header>
    ${asArray(value.paragraphs).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}${list(value.insights || value.points)}${metrics(value.metrics)}
    ${asArray(value.tables).map(table).join('')}${asArray(value.charts).map(chart).join('')}${subsections}</section>`;
}

export function buildMarketInsightHtml(report, metadata = {}) {
  const sections = asArray(report.sections).filter(item => clean(item?.title));
  const references = asArray(report.references || report.sources);
  const generatedAt = new Date(report.generatedAt || metadata.generatedAt || Date.now());
  const toc = sections.map((item, index) => `<li><a href="#section-${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span>${escapeHtml(item.title)}</a></li>`).join('');
  const highlights = asArray(report.executiveHighlights).slice(0, 6);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title)}</title><style>
    @page{size:A4;margin:17mm 15mm 18mm}*{box-sizing:border-box}body{margin:0;color:#14213d;background:#fff;font:9.5pt/1.52 Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:inherit;text-decoration:none}.cover{min-height:260mm;padding:28mm 14mm;background:linear-gradient(145deg,#071a33,#123b70);color:#fff;break-after:page}.brand{font-size:14pt;font-weight:800;letter-spacing:.04em}.eyebrow{margin-top:30mm;color:#8fd7ed;text-transform:uppercase;letter-spacing:.16em;font-size:7.5pt}.cover h1{font-size:29pt;line-height:1.08;margin:7mm 0 5mm;max-width:158mm}.cover>p{font-size:12pt;color:#dbe8fa;max-width:155mm}.highlights{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:16mm}.highlights div{padding:4mm;border:1px solid #ffffff24;border-radius:3mm;background:#ffffff0b;font-size:8.5pt}.cover-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;margin-top:15mm;border-top:1px solid #48688f;padding-top:7mm}.cover-grid small,.metric small{display:block;color:#8ea5c8;text-transform:uppercase;letter-spacing:.08em}.toc{break-after:page}.toc h2{font-size:22pt}.toc ol{columns:2;column-gap:10mm;list-style:none;padding:0}.toc li{break-inside:avoid;border-bottom:1px solid #e2e8f0}.toc a{display:flex;gap:4mm;padding:2.5mm 0;font-size:8.2pt}.toc span{color:#1769d2;font-weight:700}.notice{margin:7mm 0;padding:4mm;border-left:3px solid #d58b16;background:#fff8e8;color:#5e4a22}.dashboard{break-after:page}.dashboard h2{font-size:20pt}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:5mm 0}.metrics article{border:1px solid #d9e1ec;border-radius:3mm;padding:4mm;background:#f5f8fc;break-inside:avoid}.metrics strong{display:block;font-size:16pt;color:#1769d2}.metrics span{display:block;color:#6b778c;font-size:7.2pt}section{margin:8mm 0 10mm;break-inside:auto}section>header{display:flex;gap:4mm;border-bottom:1.5px solid #1769d2;padding-bottom:3mm;margin-bottom:5mm;break-after:avoid}section>header>span{font-size:17pt;color:#1769d2;font-weight:800}h2{font-size:17pt;line-height:1.15;margin:0}h3{font-size:12pt;margin:6mm 0 2mm}p{margin:0 0 3mm;text-align:justify;orphans:3;widows:3}ul{padding-left:6mm;columns:2;column-gap:8mm}li{margin-bottom:1.5mm;break-inside:avoid}.table-block,.chart-block{margin:6mm 0;break-inside:avoid}.table-block figcaption,.chart-block figcaption{font-size:11pt;font-weight:700;margin-bottom:2mm}.caption-note{color:#6b778c;font-size:7.5pt}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7pt}thead{display:table-header-group}tr{break-inside:avoid}th{background:#0b1f3a;color:#fff;text-align:left}th,td{padding:1.8mm;border:1px solid #d9e1ec;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#f5f8fc}figure>small{display:block;color:#6b778c;margin-top:2mm}.bar-row{display:grid;grid-template-columns:35mm 1fr 28mm;align-items:center;gap:3mm;margin:2mm 0;font-size:7.5pt}.bar-row i{height:4mm;background:#e5edf7;border-radius:2mm;overflow:hidden}.bar-row em{display:block;height:100%;background:linear-gradient(90deg,#1769d2,#13a8bd);border-radius:2mm}.bar-row b{text-align:right}.pie-layout{display:grid;grid-template-columns:55mm 1fr;gap:10mm;align-items:center}.pie{width:48mm;height:48mm;border-radius:50%;box-shadow:inset 0 0 0 9mm #fff}.legend{display:grid;gap:2mm}.legend span{display:grid;grid-template-columns:4mm 1fr auto;gap:2mm}.legend i{width:3mm;height:3mm;border-radius:50%}.chart-block svg{width:100%;height:auto}.chart-block svg text{font:18px Arial;fill:#6b778c}.risk-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:2mm}.risk{display:grid;grid-template-columns:1fr auto;padding:3mm;border-radius:2mm}.risk small{grid-column:1/-1}.risk-1{background:#eaf8f1}.risk-2{background:#fff5d9}.risk-3{background:#fde8e7}.references{break-before:page}.references li{overflow-wrap:anywhere}.footer{position:fixed;bottom:-11mm;left:0;right:0;border-top:1px solid #d9e1ec;padding-top:2mm;color:#6b778c;font-size:6.5pt;display:flex;justify-content:space-between}.page-number:after{content:"Page " counter(page)}@media screen{body{background:#eef3f9}.report{width:210mm;margin:20px auto;background:#fff;padding:15mm;box-shadow:0 12px 40px #10233d1f}.cover{margin:-15mm -15mm 0;padding-left:28mm;padding-right:28mm}}@media(max-width:800px){.report{width:100%;margin:0;padding:20px;box-shadow:none}.cover{margin:-20px -20px 0;padding:60px 24px;min-height:auto}.cover h1{font-size:34px}.cover-grid,.highlights,.metrics,.risk-grid{grid-template-columns:1fr}.toc ol,ul{columns:1}.pie-layout{grid-template-columns:1fr}.pie{margin:auto}section{margin-top:40px}}
    .swot-grid,.pestle-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm}.swot-grid article,.pestle-grid article{padding:4mm;border:1px solid #d9e1ec;border-radius:3mm;break-inside:avoid}.swot-grid h3{margin:0 0 2mm}.swot-grid ul{columns:1;margin:0}.swot-1{background:#eaf8f1}.swot-2{background:#fff7e7}.swot-3{background:#eaf2ff}.swot-4{background:#fdebea}.pestle-grid article{display:grid;grid-template-columns:1fr auto;background:#f5f8fc}.pestle-grid p,.pestle-grid small{grid-column:1/-1}.priority{color:#1769d2;font-weight:700}@media(max-width:800px){.swot-grid,.pestle-grid{grid-template-columns:1fr}}
  </style></head><body><main class="report"><article class="cover"><div class="brand">EsyGlob Market Intelligence</div><div class="eyebrow">Confidential executive intelligence report</div><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle || report.query)}</p>${highlights.length ? `<div class="highlights">${highlights.map(item => `<div>${escapeHtml(item)}</div>`).join('')}</div>` : ''}<div class="cover-grid"><div><small>Prepared for</small>${escapeHtml(report.generatedFor || 'EsyGlob member')}</div><div><small>Generated</small>${escapeHtml(generatedAt.toLocaleDateString('en-GB'))}</div><div><small>Product / industry</small>${escapeHtml(report.productName || 'Not specified')}</div><div><small>Market</small>${escapeHtml(report.country || 'Global')}</div></div></article>
    <section class="toc"><h2>Contents</h2><ol>${toc}<li><a href="#references"><span>${String(sections.length + 1).padStart(2, '0')}</span>References &amp; Methodology</a></li></ol>${report.verificationNotice ? `<div class="notice"><strong>Decision-use notice</strong><br>${escapeHtml(report.verificationNotice)}</div>` : ''}</section>
    <section class="dashboard"><h2>Executive Intelligence Dashboard</h2>${metrics(report.keyMetrics)}${asArray(report.charts).map(chart).join('')}</section>
    ${sections.map(section).join('')}${asArray(report.tables).map(table).join('')}
    <section class="references" id="references"><header><span>${String(sections.length + 1).padStart(2, '0')}</span><div><h2>References &amp; Methodology</h2></div></header>${references.length ? `<ol>${references.map(reference => `<li>${escapeHtml(typeof reference === 'string' ? reference : [reference.name || reference.title, reference.publisher, reference.url, reference.note].filter(Boolean).join(' — '))}</li>`).join('')}</ol>` : '<p>No live source evidence was supplied for this qualitative report. Validate current figures with the relevant official authorities and commercial data providers.</p>'}<h3>Methodology</h3><p>${escapeHtml(report.methodology)}</p></section>
    <div class="footer"><span>CONFIDENTIAL · ESYGLOB MARKET INTELLIGENCE</span><span>${escapeHtml(report.reportVersion || metadata.reportVersion || '')} · <i class="page-number"></i></span></div></main></body></html>`;
}
