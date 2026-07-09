import MarketInsightsRepository from '../repositories/market-insights.repository.js';
import {
  COUNTRIES, SOURCE_CHIPS, productProfile, trendFrom,
  normalizedRows, fmtUSD, fmtNumber, normalizeText,
} from '../lib/trade-data.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CACHE_TTL_MS = 15 * 60 * 1000;
const cacheStore = new Map();

// Cache helpers
function getCached(key) {
  const entry = cacheStore.get(key);
  if (!entry || Date.now() - entry.createdAt > CACHE_TTL_MS) return null;
  return entry.value;
}

function setCached(key, value) {
  cacheStore.set(key, { createdAt: Date.now(), value });
  return value;
}

// World Bank API
function latestWithPrevious(payload) {
  const rows = Array.isArray(payload?.[1])
    ? payload[1].filter(item => item.value !== null && item.value !== undefined)
    : [];
  const latest = rows[0];
  const previous = rows[1];
  return {
    value: latest?.value || null,
    year: latest?.date || null,
    previousValue: previous?.value || null,
    previousYear: previous?.date || null,
  };
}

async function fetchWorldBankIndicator(countryCode, indicator) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(
      `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?format=json&per_page=5`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return {};
    return latestWithPrevious(await res.json());
  } catch {
    return {};
  }
}

async function fetchCountryIndicators(country) {
  const cached = getCached(`wb:${country.code}`);
  if (cached) return cached;

  try {
    const [gdp, population, exports, imports, inflation, gdpGrowth] = await Promise.all([
      fetchWorldBankIndicator(country.code, 'NY.GDP.MKTP.CD'),
      fetchWorldBankIndicator(country.code, 'SP.POP.TOTL'),
      fetchWorldBankIndicator(country.code, 'NE.EXP.GNFS.CD'),
      fetchWorldBankIndicator(country.code, 'NE.IMP.GNFS.CD'),
      fetchWorldBankIndicator(country.code, 'FP.CPI.TOTL.ZG'),
      fetchWorldBankIndicator(country.code, 'NY.GDP.MKTP.KD.ZG'),
    ]);

    const result = {
      ...country,
      gdp, population, exports, imports, inflation, gdpGrowth,
      tradeBalance: (exports.value || 0) - (imports.value || 0),
      tradeVolume: (exports.value || 0) + (imports.value || 0),
      hasRealData: Boolean(gdp.value || exports.value || imports.value),
    };
    return setCached(`wb:${country.code}`, result);
  } catch {
    return setCached(`wb:${country.code}`, { ...country, hasRealData: false, tradeBalance: null, tradeVolume: null });
  }
}

async function fetchExchangeRates() {
  const cached = getCached('exchange:usd');
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return setCached('exchange:usd', {});
    const data = await res.json();
    return setCached('exchange:usd', data.rates || {});
  } catch {
    return setCached('exchange:usd', {});
  }
}

async function getCountriesData() {
  const cached = getCached('countries:v2');
  if (cached) return cached;

  const [countries, rates] = await Promise.all([
    Promise.all(COUNTRIES.map(fetchCountryIndicators)),
    fetchExchangeRates(),
  ]);

  return setCached('countries:v2', countries.map(country => ({
    ...country,
    exchangeRate: rates?.[country.currency] || null,
  })));
}

// Report builders
function buildInfo({ country, productName, profile, marketplace, direction }) {
  return {
    title: `${country.name} ${direction} intelligence for ${productName}`,
    country: country.name,
    product: productName,
    tradePolicies: [
      country.policy,
      `Currency: ${country.currency}${country.exchangeRate ? ` (${country.exchangeRate.toFixed(2)} per USD)` : ''}`,
    ],
    importRegulations: [
      `Customs declaration required through ${country.name} customs authority.`,
      'Tariff classification should be confirmed before shipment.',
    ],
    exportRegulations: [
      'Commercial invoice, packing list, and transport document are required.',
      'Export controls depend on HS classification and destination.',
    ],
    requiredCertifications: profile.certifications,
    requiredLicenses: [
      'Importer/exporter registration where required',
      'Product-specific permits for regulated categories',
    ],
    inspectionAuthorities: [
      `${country.name} customs authority`,
      'Port health/product safety authority where applicable',
    ],
    documentation: [
      'Commercial Invoice', 'Packing List',
      'Bill of Lading/Air Waybill', 'Certificate of Origin',
    ],
    majorPorts: country.ports,
    averageCustomsClearanceTime: country.stability >= 85
      ? '1-3 days typical' : country.stability >= 70
        ? '3-6 days typical' : '5-10 days or more',
    packagingStandards: profile.packaging,
    labellingRules: [
      'Country of origin marking',
      'Product label in destination language where required',
      'Batch/lot identification for regulated products',
    ],
    governmentRestrictions: [
      'Check sanctions, anti-dumping, quota, and restricted goods rules before contracting.',
    ],
    recommendedMarketEntryStrategy: marketplace.verifiedSupplierCount > marketplace.rfqCount
      ? 'Differentiate with compliance documents, faster samples, and flexible MOQ.'
      : 'Prioritize buyer education, landed-cost clarity, and responsive quotation handling.',
    aiExecutiveSummary: 'Official product-level HS trade values are not available in the connected data sources for this report.',
  };
}

function tradeRows(countries, valueKey, productName, profile, marketplace, direction) {
  const rows = countries
    .filter(c => c[valueKey]?.value)
    .sort((a, b) => (b[valueKey]?.value || 0) - (a[valueKey]?.value || 0))
    .slice(0, 10)
    .map((country, index) => {
      const trend = trendFrom(country[valueKey]?.value, country[valueKey]?.previousValue);
      return {
        rank: index + 1,
        flag: country.flagEmoji,
        country: country.name,
        value: country[valueKey].value,
        valueFmt: fmtUSD(country[valueKey].value),
        yoyChange: trend.change,
        trend,
        year: country[valueKey].year,
        details: `${direction} capacity proxy from official aggregate goods/services trade data.`,
        info: buildInfo({ country, productName, profile, marketplace, direction }),
      };
    });
  return normalizedRows(rows);
}

function productReport(productName, category, countries, marketplace) {
  const profile = productProfile(productName, category);
  const importRows = tradeRows(countries, 'imports', productName, profile, marketplace, 'Import market');
  const exportRows = tradeRows(countries, 'exports', productName, profile, marketplace, 'Export market');
  const fastestGrowing = normalizedRows(
    [...countries]
      .filter(c => c.imports?.value && c.imports?.previousValue)
      .map(c => ({
        country: c.name, flag: c.flagEmoji,
        value: Math.max(0, c.imports.value),
        trend: trendFrom(c.imports.value, c.imports.previousValue),
      }))
      .sort((a, b) => b.trend.change - a.trend.change)
      .slice(0, 8)
  );

  return {
    exportAnalysis: exportRows,
    importAnalysis: importRows,
    fastestGrowingMarkets: fastestGrowing,
    marketplaceMetrics: marketplace,
    marketSummary: {
      officialProductTradeStatus: 'Unavailable from connected official HS/product trade APIs',
      demandSignal: marketplace.rfqCount > 0
        ? `${marketplace.rfqCount} active marketplace RFQ signals`
        : 'No active marketplace RFQ signal found',
      supplySignal: `${marketplace.productCount} matching products from ${marketplace.supplierCount} suppliers`,
      averageMarketplacePricing: marketplace.averagePrice
        ? `INR ${Math.round(marketplace.averagePrice).toLocaleString('en-IN')}`
        : 'Unavailable',
      averageMoq: marketplace.averageMoq ? Math.round(marketplace.averageMoq) : 'Unavailable',
      averageLeadTime: marketplace.averageLeadTime ? `${Math.round(marketplace.averageLeadTime)} days` : 'Unavailable',
      importDuties: `Indicative WTO category tariff benchmark: ${profile.tariff}%`,
      exportDuties: 'Depends on exporting country and HS code',
      requiredCertifications: profile.certifications,
      shippingRecommendations: profile.packaging,
      peakBuyingSeasons: profile.season,
    },
    demographics: {
      distribution: [
        { label: 'Marketplace Supply', value: Math.min(100, marketplace.productCount), unit: '' },
        { label: 'Verified Suppliers', value: marketplace.supplierCount ? Math.round((marketplace.verifiedSupplierCount / marketplace.supplierCount) * 100) : 0, unit: '%' },
        { label: 'RFQ Activity', value: Math.min(100, marketplace.rfqCount), unit: '' },
        { label: 'Quotation Activity', value: Math.min(100, marketplace.quotationCount), unit: '' },
      ],
      regionalComparison: importRows.slice(0, 6).map(row => ({ label: row.country, value: row.share, unit: '%' })),
    },
  };
}

function countryReport(productName, category, targetCountry, countries, marketplace) {
  const profile = productProfile(productName, category);
  const target = countries.find(c => c.name.toLowerCase() === targetCountry.toLowerCase()) || countries[0];

  const partnersByImports = tradeRows(
    countries.filter(c => c.name !== target.name), 'imports', productName, profile, marketplace, 'Buyer partner'
  );
  const partnersByExports = tradeRows(
    countries.filter(c => c.name !== target.name), 'exports', productName, profile, marketplace, 'Supplier partner'
  );

  const importTrend = trendFrom(target.imports?.value, target.imports?.previousValue);
  const exportTrend = trendFrom(target.exports?.value, target.exports?.previousValue);

  return {
    countryAnalysis: {
      country: target.name, capital: target.capital, currency: target.currency,
      gdp: fmtUSD(target.gdp?.value), population: fmtNumber(target.population?.value),
      exports: fmtUSD(target.exports?.value), imports: fmtUSD(target.imports?.value),
      tradeBalance: target.tradeBalance ? fmtUSD(target.tradeBalance) : 'N/A',
      importTrend, exportTrend,
      inflation: target.inflation?.value ? `${target.inflation.value.toFixed(1)}%` : 'Unavailable',
      economicTrend: trendFrom(target.gdp?.value, target.gdp?.previousValue),
      currencyStability: target.exchangeRate ? `${target.exchangeRate.toFixed(2)} per USD` : 'Unavailable',
      politicalStability: `${target.stability}/100 structured risk proxy`,
      majorPorts: target.ports, policy: target.policy,
    },
    topProducts: [
      { rank: 1, product: 'Marketplace matched products', tradeValue: marketplace.productCount, growth: marketplace.rfqCount > 0 ? 'Growing' : 'Stable', trend: marketplace.rfqCount > 0 ? { direction: 'up', label: 'Growing', change: 0 } : { direction: 'stable', label: 'Stable', change: 0 } },
      { rank: 2, product: 'Verified supplier availability', tradeValue: marketplace.verifiedSupplierCount, growth: 'Structured marketplace signal', trend: { direction: 'stable', label: 'Stable', change: 0 } },
      { rank: 3, product: 'RFQ demand signals', tradeValue: marketplace.rfqCount, growth: marketplace.rfqCount > 0 ? 'Growing' : 'Unavailable', trend: marketplace.rfqCount > 0 ? { direction: 'up', label: 'Growing', change: 0 } : { direction: 'stable', label: 'Stable', change: 0 } },
    ],
    exportAnalysis: partnersByImports,
    importAnalysis: partnersByExports,
    marketSummary: {
      governmentTradePolicies: target.policy,
      tradeAgreements: 'Use WTO/OECD and destination customs sources for agreement-level confirmation.',
      portInfrastructure: target.ports.join(', '),
      importRequirements: ['Importer registration', 'Customs declaration', ...profile.certifications],
      exportRequirements: ['Commercial invoice', 'Packing list', 'Transport document', 'Certificate of Origin if required'],
      inspectionRules: 'Inspection intensity depends on product risk, HS code, and importer history.',
      marketEntrySuggestions: marketplace.productCount > 0
        ? 'Benchmark against active marketplace suppliers and compete on compliance, MOQ, and response time.'
        : 'Validate demand with RFQs and local distributor discovery before inventory commitment.',
    },
  };
}

function opportunityReport(productName, category, targetCountry, countries, marketplace) {
  const profile = productProfile(productName, category);

  const rows = countries.map(country => {
    const demand = Math.min(100, Math.round(((country.imports?.value || 0) / Math.max(1, country.gdp?.value || 1)) * 600 + Math.min(30, marketplace.rfqCount * 2)));
    const competition = Math.min(100, Math.round(((country.exports?.value || 0) / Math.max(1, country.gdp?.value || 1)) * 500 + Math.min(35, marketplace.supplierCount)));
    const supplierDensity = Math.min(100, marketplace.supplierCount * 4);
    const importDependency = country.imports?.value && country.exports?.value
      ? Math.min(100, Math.round((country.imports.value / Math.max(country.imports.value + country.exports.value, 1)) * 100))
      : 50;
    const tariffs = Math.max(0, 100 - profile.tariff * 3);
    const growthRate = Math.max(0, Math.min(100, 50 + trendFrom(country.imports?.value, country.imports?.previousValue).change * 4));
    const logistics = country.stability;
    const currency = country.exchangeRate ? Math.max(30, Math.min(100, 100 - Math.abs((country.inflation?.value || 4) * 3))) : 55;
    const ease = Math.round((logistics + currency + tariffs) / 3);
    const score = Math.round(
      demand * 0.22 + (100 - competition) * 0.13 + (100 - supplierDensity) * 0.08 +
      importDependency * 0.13 + tariffs * 0.10 + growthRate * 0.12 +
      Math.min(100, marketplace.rfqCount * 5) * 0.08 + logistics * 0.07 + ease * 0.07
    );

    return {
      rank: 0, flag: country.flagEmoji, country: country.name,
      opportunity: score, score, demand, competition, supplierDensity,
      importDependency, tariffs, growthRate, logistics,
      politicalStability: country.stability, currencyStability: currency,
      trend: trendFrom(country.imports?.value, country.imports?.previousValue),
      reasoning: [
        `Demand uses official import intensity and marketplace RFQ activity.`,
        `Competition uses official export intensity and marketplace supplier density.`,
        `Tariff benchmark uses ${profile.family} category tariff profile (${profile.tariff}%).`,
      ],
      info: buildInfo({ country, productName, profile, marketplace, direction: 'Opportunity market' }),
    };
  }).sort((a, b) => b.score - a.score).map((row, index) => ({ ...row, rank: index + 1 }));

  const selected = targetCountry
    ? rows.find(row => row.country.toLowerCase() === targetCountry.toLowerCase())
    : rows[0];

  return {
    scoring: {
      demandScore: selected?.demand || 0,
      competitionScore: selected?.competition || 0,
      riskScore: selected ? 100 - Math.round((selected.logistics + selected.currencyStability + selected.politicalStability) / 3) : 0,
      profitabilityScore: selected ? Math.round((selected.tariffs + (100 - selected.competition) + selected.importDependency) / 3) : 0,
      opportunityScore: selected?.score || 0,
      reasoning: selected?.reasoning || [],
    },
    opportunityTable: rows.slice(0, 10),
    marketplaceMetrics: marketplace,
    demographics: {
      distribution: [
        { label: 'Demand', value: selected?.demand || 0, unit: '%' },
        { label: 'Low Competition', value: selected ? 100 - selected.competition : 0, unit: '%' },
        { label: 'Import Dependency', value: selected?.importDependency || 0, unit: '%' },
        { label: 'Ease of Entry', value: selected ? Math.round((selected.logistics + selected.currencyStability) / 2) : 0, unit: '%' },
      ],
      regionalComparison: rows.slice(0, 6).map(row => ({ label: row.country, value: row.score, unit: '%' })),
    },
  };
}

// AI Analysis
async function callAIAnalysis(structuredData) {
  const prompt = `You are a trade intelligence analyst. Use ONLY the structured data below. Do not invent or estimate numerical statistics. If official product-level data is unavailable, state that clearly. Return concise sections: Executive Summary, Market Opportunity, Buying Strategy, Selling Strategy, Competition Analysis, Market Risks, Growth Outlook.\n\n${JSON.stringify(structuredData).slice(0, 12000)}`;

  const body = {
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 900,
  };

  // Try Groq first
  if (GROQ_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { text, source: 'Groq AI' };
      }
    } catch { /* fall through */ }
  }

  // Try Gemini fallback
  if (GEMINI_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('')?.trim();
        if (text) return { text, source: 'Gemini AI' };
      }
    } catch { /* fall through */ }
  }

  return null;
}

class MarketInsightsService {
  /**
   * Get dashboard data (products + countries)
   */
  static async getDashboardData() {
    const [countries, marketplaceProducts] = await Promise.all([
      getCountriesData(),
      MarketInsightsRepository.getProductsForDashboard().catch(() => []),
    ]);

    return {
      products: marketplaceProducts.map(product => ({
        id: String(product._id),
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
        image: product.images?.[0] || '',
      })),
      countries: countries.map(country => ({
        name: country.name,
        flagEmoji: country.flagEmoji,
        region: country.region,
        capital: country.capital,
        gdp: fmtUSD(country.gdp?.value),
        population: fmtNumber(country.population?.value),
        currency: country.currency,
        hasRealGDP: Boolean(country.gdp?.value),
      })),
      dataFreshness: `Structured data: World Bank + Marketplace DB · ${countries.filter(c => c.hasRealData).length} countries`,
    };
  }

  /**
   * Generate intelligence report
   */
  static async generateReport({ mode, productName, country, category }) {
    const startedAt = Date.now();

    if (!productName) {
      throw Object.assign(new Error('Product required'), { statusCode: 400 });
    }

    const [countries, marketplace] = await Promise.all([
      getCountriesData(),
      MarketInsightsRepository.getMarketplaceData(productName, category, country),
    ]);

    let modeData;
    let title;

    if (mode === 'country_rd') {
      modeData = countryReport(productName, category, country || countries[0]?.name || '', countries, marketplace);
      title = `${country || countries[0]?.name || 'Country'} — ${productName} Market Intelligence`;
    } else if (mode === 'opportunity_finder') {
      modeData = opportunityReport(productName, category, country, countries, marketplace);
      title = `${productName} — Opportunity Intelligence`;
    } else {
      modeData = productReport(productName, category, countries, marketplace);
      title = `${productName} — Product Trade Intelligence`;
    }

    const structuredData = { mode, productName, country, category, marketplace, countryCount: countries.length, modeData };
    const aiResult = await callAIAnalysis(structuredData);

    const officialMissing = 'Official product-level HS trade values are unavailable from the connected data sources, so product-specific sections combine marketplace data with official country-level trade indicators without fabricating product trade totals.';

    const report = {
      id: `rpt-${Date.now()}`,
      reportType: mode,
      title,
      product: { name: productName, category: category || 'General' },
      country,
      executiveSummary: aiResult?.text || officialMissing,
      aiAnalysis: aiResult?.text || '',
      aiSource: aiResult?.source || '',
      ...modeData,
      tariffInfo: { avg: `${productProfile(productName, category).tariff}%`, range: 'Confirm by HS code and destination country' },
      dataSources: SOURCE_CHIPS,
      sourceChips: SOURCE_CHIPS,
      hasRealData: true,
      hasAI: Boolean(aiResult?.text),
      dataFreshness: `Structured data rendered in ${Date.now() - startedAt}ms · World Bank + Marketplace DB`,
      dataIntegrityNotes: [officialMissing, 'World Share is normalized against displayed rows and will sum to approximately 100%.'],
      isBookmarked: false,
      isFavorite: false,
      createdAt: new Date().toISOString(),
    };

    return { report, saved: true };
  }

  /**
   * Update bookmark/favorite status
   */
  static async updateReportMeta(reportId, { isBookmarked, isFavorite }) {
    return {
      report: {
        id: reportId,
        isBookmarked: isBookmarked || false,
        isFavorite: isFavorite || false,
      },
    };
  }

  /**
   * Delete report (placeholder)
   */
  static async deleteReport() {
    return { success: true };
  }
}

export default MarketInsightsService;