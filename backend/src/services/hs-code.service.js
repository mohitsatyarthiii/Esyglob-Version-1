import mongoose from 'mongoose';
import * as repository from '../repositories/hs-code.repository.js';

function cleanCode(value) { return String(value || '').replace(/\D/g, ''); }
function validateCode(code) {
  if (!/^\d{2,10}$/.test(code)) throw Object.assign(new Error('HS code must contain 2 to 10 digits.'), { statusCode: 400 });
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
    const result = await this.search({ query: searchText, countryCode, limit: 8 });
    return { selected: result.items[0] || null, candidates: result.items, suppliedCode: '', status: result.items.length ? 'recommended-candidates' : 'database-empty-or-no-match' };
  }
  static async getMappedCodes(ids = []) {
    const safeIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    return safeIds.length ? repository.findByIds(safeIds) : [];
  }
}
