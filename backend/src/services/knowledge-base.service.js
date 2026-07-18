import KnowledgeDocument from '../models/KnowledgeDocument.js';

function tokens(value = '') {
  return [...new Set(String(value).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])].slice(0, 18);
}

function roleFilter(role) {
  return { $in: [role, 'general'] };
}

export default class KnowledgeBaseService {
  static async retrieve({ query, role = 'general', intent, language = 'en', limit = 4 }) {
    const terms = tokens(query);
    if (!terms.length) return [];
    const match = {
      status: 'published',
      targetRoles: roleFilter(role),
      $or: [
        { searchableText: { $regex: terms.map(term => `(?=.*${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join(''), $options: 'i' } },
        ...(intent ? [{ intentTags: intent }] : []),
      ],
    };
    const docs = await KnowledgeDocument.find(match)
      .select('-embedding -embeddingModel')
      .sort({ priority: -1, lastUpdated: -1 })
      .limit(Math.min(8, Math.max(1, Number(limit))))
      .lean();
    return docs.sort((a, b) => {
      const aLanguage = a.supportedLanguages?.includes(language) ? 1 : 0;
      const bLanguage = b.supportedLanguages?.includes(language) ? 1 : 0;
      return bLanguage - aLanguage || (b.priority || 0) - (a.priority || 0);
    });
  }

  static format(documents = []) {
    return documents.map(doc => [
      `Knowledge: ${doc.title} (v${doc.version})`,
      doc.summary || doc.overview,
      doc.steps?.length ? `Steps:\n${doc.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : '',
      doc.businessRules?.length ? `Rules:\n${doc.businessRules.map(rule => `- ${rule}`).join('\n')}` : '',
      doc.warnings?.length ? `Warnings:\n${doc.warnings.map(item => `- ${item}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')).join('\n\n').slice(0, 5000);
  }

  static list(input = {}) {
    const query = input.status ? { status: input.status } : {};
    return KnowledgeDocument.find(query).sort({ updatedAt: -1 }).limit(Math.min(100, Number(input.limit || 30))).lean();
  }

  static upsert(payload, actorId) {
    const version = Math.max(1, Number(payload.version || 1));
    const slug = String(payload.slug || payload.title || '')
      .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) throw Object.assign(new Error('A valid title or slug is required.'), { statusCode: 400 });
    return KnowledgeDocument.findOneAndUpdate(
      { slug, version },
      {
        ...payload,
        slug,
        version,
        targetRoles: payload.targetRoles?.length ? payload.targetRoles : ['general'],
        supportedLanguages: payload.supportedLanguages?.length ? payload.supportedLanguages : ['en'],
        lastUpdated: new Date(),
        updatedBy: actorId,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
}
