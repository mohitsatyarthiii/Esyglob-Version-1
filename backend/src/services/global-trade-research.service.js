import { getCountriesData } from './market-insights.service.js';
import HSCodeService from './hs-code.service.js';

const COMTRADE_REPORTERS = { IND: 699, CHN: 156, USA: 842, DEU: 276, VNM: 704, ARE: 784, TUR: 792, BGD: 50, IDN: 360, BRA: 76, JPN: 392, KOR: 410, GBR: 826, CAN: 124, AUS: 36, SAU: 682, THA: 764, MYS: 458, SGP: 702, MEX: 484, ITA: 380, FRA: 251, NLD: 528, ZAF: 710 };

function withTimeout(ms) {
  return AbortSignal.timeout(Number(ms));
}

function extractHsCode(text) {
  const explicit = String(text || '').match(/(?:HS(?:\s*code)?\s*[:#-]?\s*)(\d{4,10})/i);
  return explicit?.[1] || '';
}

async function fetchComtrade({ hsCode, reporterCode, flowCode }) {
  if (!hsCode || !reporterCode) return [];
  const period = new Date().getUTCFullYear() - 2;
  const params = new URLSearchParams({ period: String(period), reporterCode: String(reporterCode), cmdCode: hsCode.slice(0, 6), flowCode, partnerCode: '0', partner2Code: '0', customsCode: 'C00', motCode: '0', maxRecords: '500' });
  try {
    const response = await fetch(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?${params}`, { signal: withTimeout(9000) });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  } catch {
    return [];
  }
}

function buildSearchQueries(productName, country, hsCode) {
  const product = String(productName || 'requested product').trim();
  const market = String(country || 'global').trim();
  return [
    `${product} ${market} import export trade`,
    `${product} ${market} industry supply chain`,
    `${product} ${market} pricing logistics regulation`,
    ...(hsCode ? [`HS ${hsCode} ${market} tariff customs`] : []),
  ];
}

async function fetchGdelt(query) {
  try {
    const params = new URLSearchParams({ query, mode: 'artlist', maxrecords: '8', format: 'json', sort: 'datedesc' });
    const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { signal: withTimeout(8000) });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload?.articles || []).map(item => ({ title: item.title, domain: item.domain, date: item.seendate, url: item.url, language: item.language, sourceType: 'Public market/news source' })).filter(item => item.title && item.url);
  } catch { return []; }
}

function countryRows(countries, key) {
  return countries
    .filter(item => Number(item[key]?.value) > 0)
    .sort((a, b) => Number(b[key]?.value || 0) - Number(a[key]?.value || 0))
    .slice(0, 10)
    .map((item, index) => ({ rank: index + 1, country: item.name, valueUsd: Math.round(item[key].value), year: item[key].year, scope: 'All goods and services (macro indicator)', source: 'World Bank' }));
}

function comtradeRows(rows, flow) {
  return rows.slice(0, 20).map((item, index) => ({
    rank: index + 1,
    reporter: item.reporterDesc || item.reporterCode,
    partner: item.partnerDesc || 'World',
    hsCode: item.cmdCode,
    flow,
    period: item.period,
    valueUsd: item.primaryValue ?? item.netWgt ?? 'Unavailable',
    source: 'UN Comtrade',
  }));
}

export default class GlobalTradeResearchService {
  static async collect({ query, productName, country }) {
    const explicitHsCode = extractHsCode(`${query} ${productName}`);
    const hsResolution = await HSCodeService.resolveForResearch({ query, productName, explicitCode: explicitHsCode }).catch(() => ({ selected: null, candidates: [], suppliedCode: explicitHsCode, status: 'lookup-unavailable' }));
    const hsCode = hsResolution.selected?.code || hsResolution.suppliedCode || '';
    const searchQueries = buildSearchQueries(productName || query, country, hsCode);
    const countries = await getCountriesData().catch(() => []);
    const target = countries.find(item => item.name?.toLowerCase() === String(country || '').toLowerCase()) || null;
    const reporterCode = target ? COMTRADE_REPORTERS[target.code] : null;
    const [comtradeImports, comtradeExports, ...newsGroups] = await Promise.all([
      fetchComtrade({ hsCode, reporterCode, flowCode: 'M' }),
      fetchComtrade({ hsCode, reporterCode, flowCode: 'X' }),
      ...searchQueries.slice(0, 3).map(fetchGdelt),
    ]);
    const publicArticles = [...new Map(newsGroups.flat().map(item => [item.url, item])).values()].slice(0, 15);
    const officialProductRows = [...comtradeRows(comtradeImports, 'Import'), ...comtradeRows(comtradeExports, 'Export')];
    const macroImports = countryRows(countries, 'imports');
    const macroExports = countryRows(countries, 'exports');
    const sources = [
      { name: 'World Bank — World Development Indicators', type: 'official-data', url: 'https://data.worldbank.org/', status: countries.length ? 'connected' : 'unavailable' },
      { name: 'UN Comtrade', type: 'official-data', url: 'https://comtradeplus.un.org/', status: officialProductRows.length ? 'connected' : hsCode ? 'unavailable' : 'requires-hs-code' },
      { name: 'WTO Tariff & Trade Data', type: 'official-reference', url: 'https://ttd.wto.org/', status: 'reference' },
      { name: 'WTO Trade Statistics', type: 'official-reference', url: 'https://www.wto.org/english/res_e/statis_e/statis_e.htm', status: 'reference' },
      { name: 'WCO Harmonized System', type: 'official-reference', url: 'https://www.wcoomd.org/en/topics/nomenclature/overview/what-is-the-harmonized-system.aspx', status: 'reference' },
      { name: 'EsyGlob HS Classification Database', type: 'classification-database', url: `${String(process.env.PUBLIC_API_URL || 'https://api.esyglob.in/api').replace(/\/$/, '')}/hs-codes/search`, status: hsResolution.selected ? 'connected' : hsResolution.candidates.length ? 'candidates-found' : 'awaiting-dataset' },
      { name: 'GDELT public news index', type: 'public-market-data', url: 'https://www.gdeltproject.org/', status: publicArticles.length ? 'connected' : 'unavailable' },
    ];
    const gaps = [];
    if (!hsCode) gaps.push('No HS code was supplied or matched in the EsyGlob classification database, so product-level customs values and tariffs were not claimed.');
    if (hsCode && !hsResolution.selected) gaps.push(`HS ${hsCode} is user supplied but not yet verified against the EsyGlob HS dataset.`);
    if (hsCode && !officialProductRows.length) gaps.push(`No product-level UN Comtrade records were returned for HS ${hsCode}${target ? ` and ${target.name}` : ''}; verify the code, reporter and period.`);
    if (!target && country) gaps.push(`The target country “${country}” was not matched to the connected country indicator set.`);
    gaps.push('Current freight quotations, company market shares, competitor revenue and paid industry-report estimates are not available from the connected official APIs.');
    return { hsCode, hsResolution, searchQueries, countries, target, macroImports, macroExports, officialProductRows, publicArticles, sources, gaps };
  }
}
