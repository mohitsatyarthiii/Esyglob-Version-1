import 'dotenv/config';

const baseUrl = String(process.env.INSIGHTS_TEST_BASE_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const email = process.env.INSIGHTS_TEST_EMAIL;
const password = process.env.INSIGHTS_TEST_PASSWORD;

if (!email || !password) {
  console.error('Set INSIGHTS_TEST_EMAIL and INSIGHTS_TEST_PASSWORD before running this test.');
  process.exit(2);
}

const query = `Find the strongest EsyGlob options for TOPCon bifacial solar modules and compatible inverters for delivery to India. Compare matching products and verified sellers using available price, MOQ, seller trust, country and marketplace demand signals. Give concise procurement insights, risks and next actions, with working links to every matching product, seller, category, service and evidence source. Do not fabricate unavailable specifications, prices, companies or links.`;

const startedAt = Date.now();
const login = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error(`Login failed: HTTP ${login.status}`);
  process.exit(1);
}
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) {
  console.error('Login succeeded but no session cookie was returned.');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/market-insights/research/stream`, {
  method: 'POST',
  headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ mode: 'opportunity_finder', query, productName: 'TOPCon bifacial solar modules and inverters', country: 'India', category: 'Solar Energy Equipment' }),
});
if (!response.ok || !response.body) {
  console.error(`Research request failed: HTTP ${response.status} ${await response.text()}`);
  process.exit(1);
}

const events = [];
let firstEventMs = null;
let buffer = '';
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  const frames = buffer.split('\n\n');
  buffer = frames.pop() || '';
  for (const frame of frames) {
    const line = frame.split('\n').find(item => item.startsWith('data:'));
    if (!line) continue;
    const event = JSON.parse(line.replace(/^data:\s*/, ''));
    if (firstEventMs === null) firstEventMs = Date.now() - startedAt;
    events.push(event);
    if (event.type === 'step') console.log(`[${event.progress || 0}%] ${event.agent || 'Agent'}: ${event.operation || event.status}`);
  }
}

const report = [...events].reverse().find(event => event.type === 'report')?.report;
if (!report) {
  const apiError = events.find(event => event.type === 'error');
  console.error(`No final report returned.${apiError?.message ? ` ${apiError.message}` : ''}`);
  process.exit(1);
}

const reportText = JSON.stringify(report).toLowerCase();
const requirements = ['india', 'product', 'seller', 'price', 'moq', 'verified', 'risk'];
const covered = requirements.filter(term => reportText.includes(term));
const sources = Array.isArray(report.sources) ? report.sources : [];
const sections = Array.isArray(report.sections) ? report.sections : [];
const charts = Array.isArray(report.charts) ? report.charts : [];
const tables = Array.isArray(report.tables) ? report.tables : [];
const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
const risks = Array.isArray(report.risks) ? report.risks : [];
const gaps = Array.isArray(report.dataGaps) ? report.dataGaps : [];
const tablesWithLinks = tables.filter(table => (table.rows || []).some(row => Object.values(row).some(value => /^https?:\/\//i.test(String(value || '')))));
const badLinks = sources.filter(source => source.url && !/^https:\/\//i.test(source.url));

const scores = {
  grounding: Math.min(20, (sources.length ? 8 : 0) + (report.marketplaceSnapshot ? 8 : 0) + (badLinks.length === 0 ? 4 : 0)),
  requirementCoverage: Math.round((covered.length / requirements.length) * 20),
  depth: Math.min(20, sections.length * 4 + tables.length * 3 + tablesWithLinks.length * 2),
  decisionUsefulness: Math.min(20, recommendations.length * 5 + risks.length * 5),
  sourceDiscipline: sources.length && badLinks.length === 0 && tablesWithLinks.length >= 2 ? 15 : 5,
  responsiveness: firstEventMs !== null && firstEventMs < 3000 ? 5 : firstEventMs !== null && firstEventMs < 10000 ? 3 : 1,
};
const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
const totalMs = Date.now() - startedAt;

console.log('\n=== AI MARKET INSIGHTS API TEST ===');
console.log(`Title: ${report.title}`);
console.log(`Model: ${report.model || 'unknown'} via ${report.provider || 'unknown'}`);
console.log(`First event: ${firstEventMs} ms`);
console.log(`Total duration: ${totalMs} ms`);
console.log(`Events: ${events.length}; Sections: ${sections.length}; Charts: ${charts.length}; Tables: ${tables.length}`);
console.log(`Sources: ${sources.length}; Linked tables: ${tablesWithLinks.length}; Invalid links: ${badLinks.length}`);
console.log(`Requirement coverage: ${covered.length}/${requirements.length} (${covered.join(', ')})`);
Object.entries(scores).forEach(([name, score]) => console.log(`${name}: ${score}`));
console.log(`FINAL RATING: ${total}/100`);
console.log(`Executive summary: ${String(report.executiveSummary || '').slice(0, 700)}`);

if (total < 70) process.exitCode = 1;
