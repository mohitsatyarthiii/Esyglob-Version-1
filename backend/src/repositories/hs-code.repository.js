import HSCode from '../models/HSCode.js';

const SAFE_FIELDS = '-embedding -embeddingModel -embeddingVersion';

export function findByCode(code) {
  return HSCode.findOne({ code, status: { $in: ['active', 'deprecated'] } }).select(SAFE_FIELDS).populate('parentHsCode', 'code officialDescription').populate('childHsCodes', 'code officialDescription').populate('relatedHsCodes', 'code officialDescription').lean();
}

export async function search({ query, countryCode, limit = 15, skip = 0 }) {
  const text = String(query || '').trim();
  const digits = text.replace(/\D/g, '');
  const filter = { status: 'active' };
  if (countryCode) filter.$or = [{ 'countrySpecificExtensions.countryCode': countryCode.toUpperCase() }, { countrySpecificExtensions: { $size: 0 } }];
  let searchFilter = filter;
  let projection = {};
  if (digits.length >= 2 && /^\d+$/.test(text.replace(/[.\s-]/g, ''))) searchFilter = { ...filter, code: { $regex: `^${digits}` } };
  else if (text) { searchFilter = { ...filter, $text: { $search: text } }; projection = { score: { $meta: 'textScore' } }; }
  const sort = projection.score ? { score: { $meta: 'textScore' }, code: 1 } : { code: 1 };
  try {
    return await HSCode.find(searchFilter, projection).select(SAFE_FIELDS).sort(sort).skip(skip).limit(limit).lean();
  } catch (error) {
    if (!text || !/text index|required for a \$text query/i.test(String(error?.message || ''))) throw error;
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = { $regex: escaped, $options: 'i' };
    const fallbackFilter = { status: 'active', $and: [
      ...(countryCode ? [{ $or: [{ 'countrySpecificExtensions.countryCode': countryCode.toUpperCase() }, { countrySpecificExtensions: { $size: 0 } }] }] : []),
      { $or: [{ code: match }, { officialDescription: match }, { searchableText: match }, { keywords: match }, { synonyms: match }, { commonProductNames: match }, { searchTerms: match }] },
    ] };
    return HSCode.find(fallbackFilter).select(SAFE_FIELDS).sort({ code: 1 }).skip(skip).limit(limit).lean();
  }
}

export function findByIds(ids) { return HSCode.find({ _id: { $in: ids }, status: 'active' }).select(SAFE_FIELDS).lean(); }
export function countSearch(query = {}) { return HSCode.countDocuments(query); }

export async function semanticSearch(embedding, { limit = 10, countryCode } = {}) {
  if (!Array.isArray(embedding) || !embedding.length) return [];
  const filter = { status: 'active', ...(countryCode ? { $or: [{ 'countrySpecificExtensions.countryCode': countryCode.toUpperCase() }, { countrySpecificExtensions: { $size: 0 } }] } : {}) };
  return HSCode.aggregate([
    { $vectorSearch: { index: process.env.HS_CODE_VECTOR_INDEX || 'hs_code_embedding', path: 'embedding', queryVector: embedding.map(Number), numCandidates: Math.max(100, limit * 10), limit, filter } },
    { $project: { embedding: 0, embeddingModel: 0, embeddingVersion: 0, score: { $meta: 'vectorSearchScore' } } },
  ]);
}
