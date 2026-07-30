const MAX_KEYWORDS = 12;

export const VISION_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: 'string' },
    category: { type: 'string' },
    subcategory: { type: 'string' },
    industry: { type: 'string' },
    material: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    alternateKeywords: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['productName', 'category', 'subcategory', 'industry', 'material', 'keywords', 'alternateKeywords', 'confidence'],
  additionalProperties: false,
};

function cleanText(value, maxLength = 120) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cleanKeywords(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanText(item, 80).toLowerCase())
    .filter((item) => item.length > 1))]
    .slice(0, MAX_KEYWORDS);
}

export function normalizeVisionAnalysis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const confidence = Number(source.confidence);
  return {
    productName: cleanText(source.productName),
    category: cleanText(source.category),
    subcategory: cleanText(source.subcategory),
    industry: cleanText(source.industry),
    material: cleanText(source.material),
    keywords: cleanKeywords(source.keywords),
    alternateKeywords: cleanKeywords(source.alternateKeywords),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
  };
}

export function parseVisionAnalysis(content) {
  if (!content) return normalizeVisionAnalysis(null);
  if (typeof content === 'object') return normalizeVisionAnalysis(content);
  const text = String(content).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) return normalizeVisionAnalysis(null);
  try {
    return normalizeVisionAnalysis(JSON.parse(text.slice(firstBrace, lastBrace + 1)));
  } catch {
    return normalizeVisionAnalysis(null);
  }
}

function unique(values, limit = 24) {
  return [...new Set(values.map((value) => cleanText(value).toLowerCase()).filter(Boolean))].slice(0, limit);
}

export function buildVisualSearchProfile(analysis, userQuery = '') {
  const normalized = normalizeVisionAnalysis(analysis);
  const userTerms = cleanText(userQuery, 240)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1);
  const identityTokens = [normalized.productName, normalized.subcategory, normalized.material]
    .flatMap((value) => cleanText(value).toLowerCase().split(/\s+/))
    .filter((term) => term.length > 2);
  const identityTerms = unique([
    normalized.productName,
    normalized.subcategory,
    normalized.material,
    ...identityTokens,
    ...normalized.keywords,
    ...userTerms,
  ], 18);
  const broadTerms = unique([
    normalized.productName,
    normalized.category,
    normalized.subcategory,
    normalized.industry,
    normalized.material,
    ...normalized.keywords,
    ...normalized.alternateKeywords,
    ...userTerms,
  ], 28);
  return {
    analysis: normalized,
    userQuery: cleanText(userQuery, 240),
    identityTerms,
    broadTerms,
    categoryTerms: unique([normalized.category, normalized.subcategory, normalized.industry, ...normalized.keywords], 14),
    searchText: unique([normalized.productName, ...identityTerms, ...broadTerms], 32).join(' '),
  };
}

function tokens(value) {
  const serialized = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value || '');
  return serialized.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter((token) => token.length > 1);
}

function phraseMatch(value, phrase) {
  const haystack = ` ${tokens(value).join(' ')} `;
  const needle = tokens(phrase).join(' ');
  return needle ? haystack.includes(` ${needle} `) : false;
}

function tokenScore(value, terms, weight) {
  const haystack = new Set(tokens(value));
  return unique(terms, 32).reduce((score, term) => {
    const termTokens = tokens(term);
    if (!termTokens.length) return score;
    const matched = termTokens.filter((token) => haystack.has(token)).length;
    return score + (matched / termTokens.length) * weight;
  }, 0);
}

export function productVisualRelevance(product, profileOrTerms) {
  const profile = Array.isArray(profileOrTerms)
    ? buildVisualSearchProfile({ keywords: profileOrTerms, confidence: 1 })
    : profileOrTerms;
  const analysis = profile.analysis;
  let identityScore = 0;
  let broadScore = 0;

  if (analysis.productName && phraseMatch(product.name, analysis.productName)) identityScore += 48;
  if (analysis.subcategory && phraseMatch(product.subcategory, analysis.subcategory)) broadScore += 24;
  if (analysis.category && phraseMatch(product.category, analysis.category)) broadScore += 18;
  if (analysis.material && phraseMatch([
    product.name, product.tags, product.description, product.specifications, product.productAttributes,
  ], analysis.material)) broadScore += 18;

  identityScore += tokenScore(product.name, profile.identityTerms, 13);
  broadScore += tokenScore(product.subcategory, profile.broadTerms, 10);
  broadScore += tokenScore(product.category, profile.broadTerms, 8);
  broadScore += tokenScore(product.tags, profile.broadTerms, 7);
  broadScore += tokenScore([product.specifications, product.productAttributes, product.productType], profile.broadTerms, 5);
  broadScore += tokenScore(product.description, profile.broadTerms, 2.5);
  broadScore += Math.min(4, Number(product.atlasSearchScore || product.textSearchScore || 0));
  const identityConfidence = 0.35 + (analysis.confidence * 0.65);
  const score = identityScore * identityConfidence + broadScore;
  if (score <= 0) return 0;

  const sellerTieBreak = product.sellerId?.isVerified ? 0.8 : 0;
  const qualityTieBreak = Math.min(1.5, Number(product.averageRating || 0) * 0.2)
    + Math.min(0.8, Math.log10(Number(product.totalOrders || 0) + 1) * 0.2);
  return Math.round((score + sellerTieBreak + qualityTieBreak) * 100) / 100;
}

export function rankProductsByVisualRelevance(products, profileOrTerms, limit = products.length) {
  const ranked = products
    .map((product) => ({ ...product, visualRelevanceScore: productVisualRelevance(product, profileOrTerms) }))
    .filter((product) => product.visualRelevanceScore > 0)
    .sort((left, right) => right.visualRelevanceScore - left.visualRelevanceScore);
  if (!ranked.length) return [];

  // Remove incidental one-token matches relative to the strongest catalog fit.
  // A small absolute floor still allows broad category fallbacks when no exact
  // product-name match exists.
  const relevanceFloor = Math.max(5, ranked[0].visualRelevanceScore * 0.08);
  return ranked
    .filter((product) => product.visualRelevanceScore >= relevanceFloor)
    .slice(0, limit);
}
