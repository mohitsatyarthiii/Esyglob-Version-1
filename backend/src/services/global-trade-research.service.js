import HSCodeService from './hs-code.service.js';
import { COUNTRIES } from '../lib/trade-data.js';

const REQUEST_TIMEOUT_MS = Math.max(2_000, Number(process.env.TRADE_SOURCE_TIMEOUT_MS || 12_000));
const REQUEST_RETRIES = Math.max(0, Math.min(3, Number(process.env.TRADE_SOURCE_RETRIES || 2)));
const COMTRADE_INTERVAL_MS = Math.max(900, Number(process.env.COMTRADE_REQUEST_INTERVAL_MS || 1_150));
const COMTRADE_REPORTERS = {
  // UN Comtrade uses its reporter/partner reference codes here, not ISO M49
  // for every market (notably India=699 and France=251).
  IND: 699, CHN: 156, USA: 842, DEU: 276, VNM: 704, ARE: 784, TUR: 792,
  BGD: 50, IDN: 360, BRA: 76, JPN: 392, KOR: 410, GBR: 826, CAN: 124,
  AUS: 36, SAU: 682, THA: 764, MYS: 458, SGP: 702, MEX: 484, ITA: 380,
  FRA: 251, NLD: 528, ZAF: 710, NGA: 566, EGY: 818, KEN: 404, ETH: 231,
  GHA: 288, CIV: 384, TZA: 834, MAR: 504, DZA: 12, UGA: 800, SEN: 686,
};
const REPORTER_NAMES = new Map(COUNTRIES.map(country => [COMTRADE_REPORTERS[country.code], country.name]));
for (const [code, name] of Object.entries({ NGA: 'Nigeria', EGY: 'Egypt', KEN: 'Kenya', ETH: 'Ethiopia', GHA: 'Ghana', CIV: "Cote d'Ivoire", TZA: 'Tanzania', MAR: 'Morocco', DZA: 'Algeria', UGA: 'Uganda', SEN: 'Senegal' })) {
  REPORTER_NAMES.set(COMTRADE_REPORTERS[code], name);
}
const LEADING_REPORTERS = [...new Set(Object.values(COMTRADE_REPORTERS))];
const REGION_REPORTERS = {
  europe: ['DEU', 'FRA', 'ITA', 'NLD', 'GBR', 'TUR'],
  africa: ['ZAF', 'NGA', 'EGY', 'KEN', 'ETH', 'GHA', 'CIV', 'TZA', 'MAR', 'DZA', 'UGA', 'SEN'],
  asia: ['CHN', 'IND', 'JPN', 'KOR', 'VNM', 'THA', 'MYS', 'SGP', 'IDN', 'BGD'],
  'southeast asia': ['VNM', 'THA', 'MYS', 'SGP', 'IDN'],
  'middle east': ['ARE', 'SAU', 'TUR'],
};
const COUNTRY_ALIASES = { 'united arab emirates': 'UAE', uae: 'UAE', turkiye: 'Turkey', 'south korea': 'South Korea', korea: 'South Korea' };
const WORLD_BANK_INDICATORS = {
  'NY.GDP.MKTP.CD': 'GDP (current US$)',
  'SP.POP.TOTL': 'Population',
  'NY.GDP.MKTP.KD.ZG': 'GDP growth (annual %)',
  'FP.CPI.TOTL.ZG': 'Inflation, consumer prices (annual %)',
  'NE.IMP.GNFS.CD': 'Imports of goods and services (current US$)',
  'NE.EXP.GNFS.CD': 'Exports of goods and services (current US$)',
  'TM.VAL.MRCH.CD.WT': 'Merchandise imports (current US$)',
  'TX.VAL.MRCH.CD.WT': 'Merchandise exports (current US$)',
  'NE.TRD.GNFS.ZS': 'Trade (% of GDP)',
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
const uniqueBy = (values, key) => [...new Map(values.map(value => [key(value), value])).values()];
let comtradeQueue = Promise.resolve();
let worldBankCountryCodesPromise;

function retryDelay(response, attempt) {
  const seconds = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, Math.max(500, seconds * 1_000));
  return Math.min(3_000, 300 * (2 ** attempt));
}

async function fetchJson(url, { source, timeoutMs = REQUEST_TIMEOUT_MS, retries = REQUEST_RETRIES } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'EsyGlob-Trade-Intelligence/2.0' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const error = new Error(`${source || 'Trade source'} returned HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfterMs = retryDelay(response, attempt);
        throw error;
      }
      const payload = await response.json();
      if (process.env.TRADE_INTELLIGENCE_DEBUG === 'true') {
        console.info('[Trade Intelligence]', JSON.stringify({ event: 'source_response', source, attempt: attempt + 1, durationMs: Date.now() - startedAt }));
      }
      return payload;
    } catch (error) {
      lastError = error;
      const retryable = ['AbortError', 'TimeoutError'].includes(error.name) || error.status === 429 || error.status >= 500 || error instanceof TypeError;
      if (!retryable || attempt >= retries) break;
      await delay(error.retryAfterMs || retryDelay(response, attempt));
    }
  }
  console.warn('[Trade Intelligence]', JSON.stringify({ event: 'source_unavailable', source, error: lastError?.message || 'Unknown source error' }));
  return null;
}

function scheduleComtrade(operation) {
  const scheduled = comtradeQueue.catch(() => undefined).then(async () => {
    await delay(COMTRADE_INTERVAL_MS);
    return operation();
  });
  comtradeQueue = scheduled.catch(() => undefined);
  return scheduled;
}

function extractHsCode(text) {
  return String(text || '').match(/(?:HS(?:\s*code)?\s*[:#-]?\s*)(\d{4,10})/i)?.[1] || '';
}

function resolveCountry(value) {
  const requested = clean(value).toLowerCase();
  const normalized = COUNTRY_ALIASES[requested]?.toLowerCase() || requested;
  return COUNTRIES.find(country => [country.name, country.code, country.flag].some(item => String(item).toLowerCase() === normalized)) || null;
}

function reporterScope(value, target) {
  if (target && COMTRADE_REPORTERS[target.code]) return { name: target.name, reporterCodes: [COMTRADE_REPORTERS[target.code]], type: 'country' };
  const region = REGION_REPORTERS[clean(value).toLowerCase()] || [];
  return { name: clean(value), reporterCodes: region.map(code => COMTRADE_REPORTERS[code]).filter(Boolean), type: region.length ? 'region-sample' : 'unresolved' };
}

function periods(count = 6) {
  const latestCompleteYear = new Date().getUTCFullYear() - 1;
  return Array.from({ length: count }, (_, index) => latestCompleteYear - count + index + 1);
}

async function fetchComtradePeriod({ hsCode, reporterCodes, partnerCodes = [0], flowCode, year }) {
  if (!hsCode || !reporterCodes?.length) return [];
  const params = new URLSearchParams({
    // The public preview provider accepts exactly one period per request.
    period: String(year),
    reporterCode: reporterCodes.join(','),
    cmdCode: hsCode.slice(0, 6),
    flowCode,
    partnerCode: partnerCodes.join(','),
    partner2Code: '0',
    customsCode: 'C00',
    motCode: '0',
    maxRecords: '500',
  });
  const payload = await scheduleComtrade(() => fetchJson(
    `https://comtradeapi.un.org/public/v1/preview/C/A/HS?${params}`,
    { source: `UN Comtrade ${flowCode}` },
  ));
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchComtradeHistory(options) {
  const groups = await Promise.all(options.years.map(year => fetchComtradePeriod({ ...options, year })));
  return groups.flat();
}

async function fetchLatestComtrade(options) {
  for (const year of [...options.years].sort((a, b) => b - a)) {
    const rows = await fetchComtradePeriod({ ...options, year });
    if (rows.length) return rows;
  }
  return [];
}

function normalizeComtrade(rows, flow) {
  const normalized = rows.map(item => {
    const reporterCode = Number(item.reporterCode ?? item.reporterCodeM49);
    const partnerCode = Number(item.partnerCode ?? item.partnerCodeM49);
    return {
      reporterCode: Number.isFinite(reporterCode) ? reporterCode : null,
      reporter: clean(item.reporterDesc) || REPORTER_NAMES.get(reporterCode) || String(reporterCode || 'Unknown'),
      partnerCode: Number.isFinite(partnerCode) ? partnerCode : null,
      partner: clean(item.partnerDesc) || REPORTER_NAMES.get(partnerCode) || (partnerCode === 0 ? 'World' : String(partnerCode || 'World')),
      hsCode: String(item.cmdCode || '').replace(/\D/g, '').slice(0, 10),
      description: clean(item.cmdDesc || item.cmdDescE),
      flow,
      period: Number(item.period) || null,
      valueUsd: numeric(item.primaryValue),
      netWeightKg: numeric(item.netWgt),
      quantity: numeric(item.qty),
      quantityUnit: clean(item.qtyUnitAbbr || item.qtyUnitCode),
      isAggregate: Boolean(item.isAggregate),
      source: 'UN Comtrade',
    };
  }).filter(item => item.hsCode && item.period && item.valueUsd !== null && item.valueUsd >= 0);
  return uniqueBy(normalized, item => `${item.reporterCode}:${item.partnerCode}:${item.hsCode}:${item.flow}:${item.period}`)
    .sort((a, b) => b.period - a.period || b.valueUsd - a.valueUsd);
}

function aggregateHistorical(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.flow}:${row.period}`;
    const existing = grouped.get(key) || { flow: row.flow, period: row.period, valueUsd: 0, netWeightKg: 0, observations: 0, source: 'UN Comtrade' };
    existing.valueUsd += row.valueUsd || 0;
    existing.netWeightKg += row.netWeightKg || 0;
    existing.observations += 1;
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((a, b) => a.period - b.period || a.flow.localeCompare(b.flow)).map((row, index, all) => {
    const previous = all.find(item => item.flow === row.flow && item.period === row.period - 1);
    return {
      ...row,
      growthPercent: previous?.valueUsd > 0 ? Number((((row.valueUsd - previous.valueUsd) / previous.valueUsd) * 100).toFixed(2)) : null,
    };
  });
}

function rankedMarkets(rows, flow, limit = 15) {
  const latest = Math.max(...rows.map(row => row.period).filter(Boolean), 0);
  const current = rows.filter(row => row.period === latest && row.flow === flow);
  const total = current.reduce((sum, row) => sum + row.valueUsd, 0);
  return current.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, limit).map((row, index) => ({
    rank: index + 1,
    country: row.reporter,
    reporterCode: row.reporterCode,
    valueUsd: row.valueUsd,
    netWeightKg: row.netWeightKg,
    period: row.period,
    observedSharePercent: total > 0 ? Number((row.valueUsd / total * 100).toFixed(2)) : null,
    coverage: 'Selected major reporting economies',
    source: 'UN Comtrade',
  }));
}

function rankedPartners(rows, flow, limit = 15, coverage = 'Selected major trading partners') {
  const latest = Math.max(...rows.map(row => row.period).filter(Boolean), 0);
  const current = rows.filter(row => row.period === latest && row.flow === flow && row.partnerCode !== 0);
  const total = current.reduce((sum, row) => sum + row.valueUsd, 0);
  return current.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, limit).map((row, index) => ({
    rank: index + 1,
    country: row.partner,
    partnerCode: row.partnerCode,
    valueUsd: row.valueUsd,
    netWeightKg: row.netWeightKg,
    period: row.period,
    observedSharePercent: total > 0 ? Number((row.valueUsd / total * 100).toFixed(2)) : null,
    coverage,
    source: 'UN Comtrade',
  }));
}

async function fetchWorldBankCountry(country) {
  if (!country?.code) return null;
  const indicatorCodes = Object.keys(WORLD_BANK_INDICATORS).join(';');
  const payload = await fetchJson(
    `https://api.worldbank.org/v2/country/${country.code}/indicator/${indicatorCodes}?source=2&format=json&mrv=10&per_page=250`,
    { source: `World Bank ${country.code}` },
  );
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const series = {};
  for (const [code, label] of Object.entries(WORLD_BANK_INDICATORS)) {
    const values = rows.filter(row => row.indicator?.id === code && numeric(row.value) !== null)
      .map(row => ({ year: Number(row.date), value: Number(row.value), status: clean(row.obs_status), source: 'World Bank' }))
      .sort((a, b) => a.year - b.year);
    series[code] = { code, label, values, latest: values.at(-1) || null };
  }
  return {
    code: country.code,
    name: country.name,
    region: country.region,
    capital: country.capital,
    currency: country.currency,
    ports: country.ports,
    series,
    source: 'World Bank — World Development Indicators',
  };
}

async function worldBankCountryCodes() {
  if (!worldBankCountryCodesPromise) {
    worldBankCountryCodesPromise = fetchJson('https://api.worldbank.org/v2/country?format=json&per_page=400', { source: 'World Bank country metadata' })
      .then(payload => new Set((Array.isArray(payload?.[1]) ? payload[1] : []).filter(row => row.region?.id && row.region.id !== 'NA').map(row => row.id)))
      .catch(() => new Set());
  }
  return worldBankCountryCodesPromise;
}

async function fetchWorldBankRanking(indicator, label) {
  const [payload, validCodes] = await Promise.all([
    fetchJson(`https://api.worldbank.org/v2/country/all/indicator/${indicator}?source=2&format=json&mrv=1&gapfill=Y&per_page=400`, { source: `World Bank ${indicator}` }),
    worldBankCountryCodes(),
  ]);
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  return rows.filter(row => validCodes.has(row.countryiso3code) && numeric(row.value) > 0)
    .map(row => ({ country: row.country?.value, countryCode: row.countryiso3code, valueUsd: Number(row.value), year: Number(row.date), indicator, scope: label, source: 'World Bank' }))
    .sort((a, b) => b.valueUsd - a.valueUsd).slice(0, 15).map((row, index) => ({ rank: index + 1, ...row }));
}

function buildSearchQueries(productName, country, hsCode) {
  const product = clean(productName || 'requested product');
  const market = clean(country || 'global');
  return [
    `${product} ${market} import export trade`,
    `${product} ${market} industry supply chain`,
    `${product} ${market} pricing logistics regulation`,
    ...(hsCode ? [`HS ${hsCode} ${market} tariff customs`] : []),
  ];
}

async function fetchGdelt(query) {
  const params = new URLSearchParams({ query, mode: 'artlist', maxrecords: '8', format: 'json', sort: 'datedesc' });
  const payload = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { source: 'GDELT' });
  return (payload?.articles || []).map(item => ({
    title: clean(item.title), domain: clean(item.domain), date: clean(item.seendate), url: clean(item.url),
    language: clean(item.language), sourceType: 'Public market/news source', source: 'GDELT',
  })).filter(item => item.title && /^https?:\/\//i.test(item.url));
}

export default class GlobalTradeResearchService {
  static async collectRelated({ productName, country, candidates = [] }) {
    const queries = [`${productName} ${country || 'global'} related products trade`, ...candidates.slice(0, 2).map(candidate => `${candidate} ${country || 'global'} import export`)];
    const groups = await Promise.all(queries.map(fetchGdelt));
    return uniqueBy(groups.flat(), item => item.url).slice(0, 20);
  }

  static async collect({ query, productName, country, structuredIntent }) {
    const startedAt = Date.now();
    const requestedCountry = country || structuredIntent?.destinationCountries?.[0] || structuredIntent?.countries?.[0] || '';
    const target = resolveCountry(requestedCountry);
    const explicitHsCode = structuredIntent?.hsCode || extractHsCode(`${query} ${productName}`);
    const [hsResolution, countryProfile, macroImports, macroExports] = await Promise.all([
      HSCodeService.resolveForResearch({ query, productName, explicitCode: explicitHsCode, countryCode: target?.code }).catch(() => ({ selected: null, candidates: [], suppliedCode: explicitHsCode, status: 'lookup-unavailable' })),
      fetchWorldBankCountry(target),
      fetchWorldBankRanking('TM.VAL.MRCH.CD.WT', 'Merchandise imports (current US$)'),
      fetchWorldBankRanking('TX.VAL.MRCH.CD.WT', 'Merchandise exports (current US$)'),
    ]);
    const hsCode = hsResolution.selected?.code || hsResolution.suppliedCode || '';
    const years = periods(Number(process.env.TRADE_HISTORY_YEARS || 6));
    const latestYears = years.slice(-3);
    const targetScope = reporterScope(requestedCountry, target);
    const targetReporter = targetScope.reporterCodes;
    const requestedOrigin = structuredIntent?.originCountries?.[0] || '';
    const originScope = reporterScope(requestedOrigin, resolveCountry(requestedOrigin));
    const selectedPartners = originScope.reporterCodes.length
      ? originScope.reporterCodes.filter(code => !targetReporter.includes(code))
      : LEADING_REPORTERS.filter(code => !targetReporter.includes(code));
    const searchQueries = buildSearchQueries(productName || query, requestedCountry, hsCode);

    const [targetImportsRaw, targetExportsRaw, globalImportsRaw, globalExportsRaw, partnerImportsRaw, partnerExportsRaw, ...newsGroups] = await Promise.all([
      fetchComtradeHistory({ hsCode, reporterCodes: targetReporter, flowCode: 'M', years }),
      fetchComtradeHistory({ hsCode, reporterCodes: targetReporter, flowCode: 'X', years }),
      fetchLatestComtrade({ hsCode, reporterCodes: LEADING_REPORTERS, flowCode: 'M', years: latestYears }),
      fetchLatestComtrade({ hsCode, reporterCodes: LEADING_REPORTERS, flowCode: 'X', years: latestYears }),
      fetchLatestComtrade({ hsCode, reporterCodes: targetReporter, partnerCodes: selectedPartners, flowCode: 'M', years: latestYears }),
      fetchLatestComtrade({ hsCode, reporterCodes: targetReporter, partnerCodes: selectedPartners, flowCode: 'X', years: latestYears }),
      ...searchQueries.slice(0, 3).map(fetchGdelt),
    ]);

    const targetImports = normalizeComtrade(targetImportsRaw, 'Import');
    const targetExports = normalizeComtrade(targetExportsRaw, 'Export');
    const globalImports = normalizeComtrade(globalImportsRaw, 'Import');
    const globalExports = normalizeComtrade(globalExportsRaw, 'Export');
    const partnerImports = normalizeComtrade(partnerImportsRaw, 'Import');
    const partnerExports = normalizeComtrade(partnerExportsRaw, 'Export');
    const officialProductRows = uniqueBy([...targetImports, ...targetExports], row => `${row.reporterCode}:${row.partnerCode}:${row.flow}:${row.period}:${row.hsCode}`);
    const historicalTrade = aggregateHistorical(officialProductRows);
    const topImporters = rankedMarkets(globalImports, 'Import');
    const topExporters = rankedMarkets(globalExports, 'Export');
    const partnerCoverage = originScope.reporterCodes.length
      ? `${originScope.name}${originScope.type === 'region-sample' ? ' — selected reporting economies' : ''}`
      : 'Selected major trading partners';
    const importPartners = rankedPartners(partnerImports, 'Import', 15, partnerCoverage);
    const exportPartners = rankedPartners(partnerExports, 'Export', 15, partnerCoverage);
    const publicArticles = uniqueBy(newsGroups.flat(), item => item.url).slice(0, 20);
    const collectedAt = new Date().toISOString();
    const comtradeConnected = officialProductRows.length + topImporters.length + topExporters.length > 0;
    const sources = [
      { name: 'World Bank — World Development Indicators', type: 'official-data', url: 'https://api.worldbank.org/v2/', status: countryProfile || macroImports.length || macroExports.length ? 'connected' : 'unavailable', retrievedAt: collectedAt, version: 'v2' },
      { name: 'UN Comtrade', type: 'official-data', url: 'https://comtradeplus.un.org/', status: comtradeConnected ? 'connected' : hsCode ? 'unavailable' : 'requires-hs-code', retrievedAt: collectedAt, version: 'public-v1-preview' },
      { name: 'WTO Timeseries API', type: 'official-data', url: 'https://apiportal.wto.org/', status: process.env.WTO_API_KEY ? 'configured-not-requested' : 'requires-api-key', retrievedAt: collectedAt },
      { name: 'WCO Harmonized System', type: 'official-reference', url: 'https://www.wcoomd.org/en/topics/nomenclature/overview/what-is-the-harmonized-system.aspx', status: 'reference', retrievedAt: collectedAt },
      { name: 'UN Comtrade HS2022 Classification Reference', type: 'official-reference', url: 'https://comtradeapi.un.org/files/v1/app/reference/H6.json', status: hsResolution.source === 'UN Comtrade HS2022 Classification Reference' ? 'connected' : 'reference', retrievedAt: collectedAt, version: 'H6/HS2022' },
      { name: 'EsyGlob HS Classification Database', type: 'classification-database', url: `${String(process.env.PUBLIC_API_URL || 'https://api.esyglob.in/api').replace(/\/$/, '')}/hs-codes/search`, status: hsResolution.source === 'EsyGlob HS Classification Database' ? 'connected' : hsResolution.candidates.some(item => item.classificationSource !== 'un-comtrade-hs2022') ? 'candidates-found' : 'awaiting-dataset', retrievedAt: collectedAt },
      { name: 'GDELT public news index', type: 'public-market-data', url: 'https://www.gdeltproject.org/', status: publicArticles.length ? 'connected' : 'unavailable', retrievedAt: collectedAt },
    ];
    const gaps = [];
    if (!hsCode) gaps.push('No HS code was supplied or matched, so product-level customs observations and tariffs are not claimed.');
    if (hsCode && !hsResolution.selected) gaps.push(`HS ${hsCode} is user supplied but not verified against the EsyGlob HS dataset.`);
    if (hsCode && !officialProductRows.length) gaps.push(`No target-market historical UN Comtrade observations were returned for HS ${hsCode}${target ? ` and ${target.name}` : ''}.`);
    if (!target && requestedCountry && targetScope.type === 'unresolved') gaps.push(`The target country or region “${requestedCountry}” was not matched to the supported reporter registry.`);
    if (targetScope.type === 'region-sample') gaps.push(`${targetScope.name} trade observations cover selected reporting economies in the region and are labelled as sampled coverage.`);
    if (originScope.type === 'region-sample') gaps.push(`${originScope.name} bilateral partner observations cover selected reporting economies in the origin region and are labelled as sampled coverage.`);
    if (!process.env.WTO_API_KEY) gaps.push('Product-level WTO tariff series require a configured WTO_API_KEY; no tariff percentage is estimated.');
    gaps.push('Market-share percentages are calculated only within explicitly labelled observed datasets and are not represented as complete global market share.');

    return {
      hsCode,
      hsResolution,
      relatedHsCodes: (hsResolution.candidates || []).map(item => ({ code: item.code, description: item.officialDescription || item.description || item.name, level: item.level, relevanceScore: item.researchScore, source: item.source?.name || 'EsyGlob HS Classification Database' })).filter(item => item.code).slice(0, 12),
      searchQueries,
      target,
      targetScope,
      originScope,
      countryProfile,
      macroImports,
      macroExports,
      officialProductRows,
      historicalTrade,
      topImporters,
      topExporters,
      importPartners,
      exportPartners,
      publicArticles,
      sources,
      gaps,
      requestedPeriods: years,
      collectedAt,
      collectionVersion: '3.0',
      collectionDurationMs: Date.now() - startedAt,
    };
  }
}
