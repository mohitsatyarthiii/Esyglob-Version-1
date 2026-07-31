import crypto from 'node:crypto';

const COUNTRY_ALIASES = new Map(Object.entries({
  africa: 'Africa', india: 'India', china: 'China', europe: 'Europe', usa: 'United States',
  'united states': 'United States', america: 'United States', germany: 'Germany', france: 'France',
  italy: 'Italy', spain: 'Spain', uk: 'United Kingdom', 'united kingdom': 'United Kingdom',
  uae: 'United Arab Emirates', 'united arab emirates': 'United Arab Emirates', vietnam: 'Vietnam',
  bangladesh: 'Bangladesh', indonesia: 'Indonesia', brazil: 'Brazil', japan: 'Japan',
  korea: 'South Korea', 'south korea': 'South Korea', canada: 'Canada', australia: 'Australia',
  turkey: 'Turkey', turkiye: 'Turkey', thailand: 'Thailand', malaysia: 'Malaysia',
  singapore: 'Singapore', mexico: 'Mexico', netherlands: 'Netherlands', 'south africa': 'South Africa',
  nigeria: 'Nigeria', kenya: 'Kenya', egypt: 'Egypt', saudi: 'Saudi Arabia',
  'saudi arabia': 'Saudi Arabia', russia: 'Russia', pakistan: 'Pakistan', sri: 'Sri Lanka',
  'sri lanka': 'Sri Lanka', indonesia: 'Indonesia', philippines: 'Philippines', global: 'Global',
  worldwide: 'Global', asia: 'Asia', 'southeast asia': 'Southeast Asia', 'middle east': 'Middle East',
}));

const NOISE = /\b(?:market|markets|analysis|report|reports|insight|insights|intelligence|trade|trading|industry|industries|opportunity|opportunities|trend|trends|outlook|data|statistics|suppliers?|manufacturers?|buyers?|sellers?|imports?|exports?|from|to|into|in|for|of|the|a|an)\b/gi;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];

function findCountries(query) {
  const lower = ` ${query.toLowerCase()} `;
  return unique([...COUNTRY_ALIASES.entries()]
    .filter(([alias]) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([, name]) => name));
}

function directionalCountries(query) {
  const fromTo = query.match(/\bfrom\s+([\p{L} .'-]{2,40}?)\s+to\s+([\p{L} .'-]{2,40})(?:$|\s+(?:market|trade|import|export|supplier|report))/iu);
  if (fromTo) {
    const origin = findCountries(fromTo[1])[0];
    const destination = findCountries(fromTo[2])[0];
    return { originCountries: origin ? [origin] : [], destinationCountries: destination ? [destination] : [] };
  }
  const from = query.match(/\b(?:exports?|suppliers?|manufacturers?)\s+from\s+([\p{L} .'-]{2,40})/iu);
  const into = query.match(/\b(?:imports?|exports?)\s+(?:to|into)\s+([\p{L} .'-]{2,40})/iu);
  return {
    originCountries: from ? findCountries(from[1]).slice(0, 1) : [],
    destinationCountries: into ? findCountries(into[1]).slice(0, 1) : [],
  };
}

function inferTradeIntent(query) {
  const intents = [];
  if (/\bimport|buy|buyer|source|sourcing\b/i.test(query)) intents.push('import');
  if (/\bexport|sell|seller\b/i.test(query)) intents.push('export');
  if (/\bsupplier|manufacturer|factory\b/i.test(query)) intents.push('supplier_discovery');
  if (/\btariff|duty|customs|compliance|regulation\b/i.test(query)) intents.push('market_access');
  if (/\bprice|pricing|cost|market size|growth|trend|outlook\b/i.test(query)) intents.push('market_analysis');
  return intents.length ? unique(intents) : ['market_analysis'];
}

function productFromQuery(query, countries, suppliedProduct) {
  if (clean(suppliedProduct) && clean(suppliedProduct).toLowerCase() !== query.toLowerCase()) return clean(suppliedProduct);
  let product = query;
  for (const country of countries) {
    product = product.replace(new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), ' ');
  }
  for (const alias of [...COUNTRY_ALIASES.keys()].sort((a, b) => b.length - a.length)) {
    product = product.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), ' ');
  }
  product = product.replace(/\bHS(?:\s*code)?\s*[:#-]?\s*\d{4,10}\b/ig, ' ').replace(NOISE, ' ');
  return clean(product.replace(/[^\p{L}\p{N}&+./ -]/gu, ' ')) || clean(suppliedProduct) || query;
}

export default class TradeIntentService {
  static parse({ query, productName = '', country = '', category = '', mode = 'product_rd' }) {
    const rawQuery = clean(query || [productName, country, category].filter(Boolean).join(' '));
    const countries = unique([...findCountries(rawQuery), ...findCountries(country)]);
    const directional = directionalCountries(rawQuery);
    const hsCode = rawQuery.match(/\b(?:HS(?:\s*code)?\s*[:#-]?\s*)?(\d{4,10})\b/i)?.[1] || '';
    const intents = inferTradeIntent(rawQuery);
    const product = productFromQuery(rawQuery, countries, productName);
    const originCountries = directional.originCountries;
    const destinationCountries = directional.destinationCountries.length
      ? directional.destinationCountries
      : country ? findCountries(country).slice(0, 1) : [];
    const flow = originCountries.length && destinationCountries.length
      ? 'bilateral'
      : intents.includes('import') ? 'import'
        : intents.includes('export') ? 'export' : 'market';
    const canonical = {
      product: product.toLowerCase(),
      category: clean(category).toLowerCase(),
      countries: [...countries].sort(),
      originCountries: [...originCountries].sort(),
      destinationCountries: [...destinationCountries].sort(),
      intents: [...intents].sort(),
      flow,
      hsCode,
      mode,
    };
    return {
      rawQuery,
      product,
      category: clean(category),
      countries,
      originCountries,
      destinationCountries,
      intents,
      primaryIntent: intents[0],
      flow,
      hsCode,
      mode,
      canonicalQuery: JSON.stringify(canonical),
      queryKey: crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
    };
  }
}
