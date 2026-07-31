import mongoose from 'mongoose';
import * as repository from '../repositories/hs-code.repository.js';

const COMTRADE_HS_REFERENCE_URL = 'https://comtradeapi.un.org/files/v1/app/reference/H6.json';
let officialHsReferencePromise;

function cleanCode(value) { return String(value || '').replace(/\D/g, ''); }
function validateCode(code) {
  if (!/^\d{2,10}$/.test(code)) throw Object.assign(new Error('HS code must contain 2 to 10 digits.'), { statusCode: 400 });
}

function researchCandidateScore(candidate, searchText) {
  const phrase = String(searchText || '').trim().toLowerCase();
  const tokens = [...new Set(phrase.match(/[\p{L}\p{N}]{2,}/gu) || [])];
  const description = String(candidate.officialDescription || '').toLowerCase();
  const commonNames = (candidate.commonProductNames || []).map(value => String(value).toLowerCase());
  const keywords = [...(candidate.keywords || []), ...(candidate.synonyms || []), ...(candidate.searchTerms || [])].map(value => String(value).toLowerCase());
  let score = Number(candidate.score || 0);
  if (description === phrase) score += 150;
  if (description.startsWith(`${phrase} `) || description.startsWith(`${phrase},`) || description.startsWith(`${phrase};`)) score += 100;
  if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(description)) score += 60;
  if (commonNames.includes(phrase)) score += 120;
  if (keywords.includes(phrase)) score += 70;
  score += tokens.reduce((total, token) => total
    + (description.includes(token) ? 12 : 0)
    + (commonNames.some(value => value.includes(token)) ? 10 : 0)
    + (keywords.some(value => value.includes(token)) ? 6 : 0), 0);
  const codeLength = String(candidate.code || '').length;
  if (codeLength === 4) score += 12;
  else if (codeLength === 6) score += 8;
  return score;
}

function officialReferenceCandidates(searchText) {
  if (!officialHsReferencePromise) {
    officialHsReferencePromise = fetch(COMTRADE_HS_REFERENCE_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'EsyGlob-Trade-Intelligence/2.0' },
      signal: AbortSignal.timeout(Math.max(5_000, Number(process.env.TRADE_SOURCE_TIMEOUT_MS || 12_000))),
    }).then(response => {
      if (!response.ok) throw new Error(`UN Comtrade HS reference returned HTTP ${response.status}`);
      return response.json();
    }).then(payload => Array.isArray(payload?.results) ? payload.results : []).catch(error => {
      officialHsReferencePromise = null;
      console.warn('[Trade Intelligence]', JSON.stringify({ event: 'hs_reference_unavailable', source: 'UN Comtrade HS2022 reference', error: error.message }));
      return [];
    });
  }
  const phrase = String(searchText || '').trim().toLowerCase();
  const tokens = [...new Set(phrase.match(/[\p{L}\p{N}]{2,}/gu) || [])];
  return officialHsReferencePromise.then(rows => rows.map(row => {
    const code = String(row.id || '').replace(/\D/g, '');
    const officialDescription = String(row.text || '').replace(/^\s*\w+\s*-\s*/, '').trim();
    return {
      code,
      officialDescription,
      nomenclature: 'HS',
      revision: 'HS 2022',
      level: Number(row.aggrlevel) || code.length,
      parentCode: String(row.parent || '').replace(/\D/g, ''),
      standardUnit: row.standardUnitAbbr,
      source: { name: 'UN Comtrade HS2022 Classification Reference', authority: 'United Nations Statistics Division' },
      classificationSource: 'un-comtrade-hs2022',
    };
  }).filter(candidate => candidate.code && tokens.every(token => candidate.officialDescription.toLowerCase().includes(token)))
    .map(candidate => ({ ...candidate, researchScore: researchCandidateScore(candidate, phrase) }))
    .sort((a, b) => b.researchScore - a.researchScore || a.code.length - b.code.length).slice(0, 20));
}

export default class HSCodeService {
  static async getByCode(value) {
    const code = cleanCode(value); validateCode(code);
    const item = await repository.findByCode(code);
    if (!item) throw Object.assign(new Error('HS code not found.'), { statusCode: 404 });
    return item;
  }
  static async search(input = {}) {
    const query = String(input.query || '').trim().slice(0, 160);
    const limit = Math.min(50, Math.max(1, Number(input.limit || 15)));
    const page = Math.max(1, Number(input.page || 1));
    if (!query) return { items: [], page, limit, semanticReady: true, message: 'Enter a product name, keyword or HS code.' };
    const items = await repository.search({ query, countryCode: input.countryCode, limit, skip: (page - 1) * limit });
    return { items, page, limit, semanticReady: true, embeddingField: 'embedding', query };
  }
  static async semanticSearch(embedding, options = {}) {
    if (!Array.isArray(embedding) || embedding.some(value => !Number.isFinite(Number(value)))) throw Object.assign(new Error('A numeric embedding vector is required.'), { statusCode: 400 });
    return repository.semanticSearch(embedding, { limit: Math.min(30, Number(options.limit || 10)), countryCode: options.countryCode });
  }
  static async resolveForResearch({ query, productName, explicitCode, countryCode }) {
    const code = cleanCode(explicitCode);
    if (code.length >= 2) {
      const exact = await repository.findByCode(code);
      return { selected: exact || null, candidates: exact ? [exact] : [], suppliedCode: code, status: exact ? 'verified-database-match' : 'user-supplied-unverified' };
    }
    const searchText = String(productName || query || '').trim();
    const [result, officialCandidates] = await Promise.all([
      this.search({ query: searchText, countryCode, limit: 20 }),
      officialReferenceCandidates(searchText),
    ]);
    const merged = new Map();
    for (const item of [...result.items, ...officialCandidates]) {
      const candidate = { ...item, researchScore: item.researchScore ?? researchCandidateScore(item, searchText) };
      const existing = merged.get(candidate.code);
      if (!existing || candidate.researchScore > existing.researchScore) merged.set(candidate.code, candidate);
    }
    const candidates = [...merged.values()]
      .sort((a, b) => b.researchScore - a.researchScore || String(a.code).length - String(b.code).length || String(a.code).localeCompare(String(b.code)));
    return {
      selected: candidates[0] || null,
      candidates: candidates.slice(0, 20),
      suppliedCode: '',
      status: candidates.length ? 'verified-classification-candidates' : 'database-empty-or-no-match',
      source: candidates[0]?.classificationSource === 'un-comtrade-hs2022' ? 'UN Comtrade HS2022 Classification Reference' : 'EsyGlob HS Classification Database',
    };
  }
  static async getMappedCodes(ids = []) {
    const safeIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    return safeIds.length ? repository.findByIds(safeIds) : [];
  }
}
