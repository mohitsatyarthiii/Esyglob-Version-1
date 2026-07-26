import NodeCache from 'node-cache';
import { getKnowledgeDocumentModel } from '../models/KnowledgeDocument.js';
import { getKnowledgeChunkModel } from '../models/KnowledgeChunk.js';
import AIEmbeddingService from './ai-embedding.service.js';
import {
  chunkKnowledgeContent,
  cleanKnowledgeContent,
  contentHash,
  extractKeywords,
} from '../lib/knowledge-ingestion.js';
import { getAIKnowledgeConnection, getAIKnowledgeDatabaseState } from '../config/knowledge-database.js';

const retrievalCache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false, maxKeys: 500 });
const ROLE_LABELS = {
  buyer: ['All Users', 'Buyers'],
  seller: ['All Users', 'Suppliers', 'Manufacturers', 'Sellers'],
  admin: ['All Users', 'Admin'],
  general: ['All Users'],
};

function tokens(value = '') {
  return [...new Set(String(value).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])].slice(0, 24);
}

function retrievalFacets(query = '') {
  const value = String(query).toLowerCase();
  const hsCodes = [...value.matchAll(/\b(?:hs\s*)?(\d{4,10})\b/g)].map(match => match[1]);
  const genericPathTerms = new Set([
    'market', 'markets', 'insight', 'insights', 'research', 'report', 'reports',
    'industry', 'industries', 'analysis', 'trade', 'latest', 'current', 'production',
    'value', 'growth', 'data', 'business',
  ]);
  const pathTerms = tokens(value).filter(term => !genericPathTerms.has(term));
  const topicFolders = [
    [/import|export|trade flow/, 'import-export'],
    [/tariff|duty/, 'tariffs'],
    [/customs|clearance/, 'customs'],
    [/compliance|regulation|policy/, 'compliance'],
    [/logistics|shipping|freight|route/, 'logistics'],
    [/certificate|certification|standard/, 'certifications'],
    [/free trade|fta|agreement/, 'free-trade-agreements'],
    [/price|pricing|cost/, 'pricing'],
    [/competitor|competition/, 'competitors'],
    [/opportunit|investment/, 'opportunities'],
    [/risk|threat/, 'risks'],
    [/forecast|outlook|growth/, 'forecasts'],
    [/trend/, 'trends'],
  ];
  topicFolders.forEach(([pattern, folder]) => { if (pattern.test(value)) pathTerms.push(folder); });
  hsCodes.forEach(code => pathTerms.push(`hs-${code}`));
  return { hsCodes, pathTerms: [...new Set(pathTerms)].slice(0, 30) };
}

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  if (!value) return fallback;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return asArray(parsed, fallback);
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return fallback;
}

function roleFilter(role) {
  return { $in: ROLE_LABELS[role] || ROLE_LABELS.general };
}

function scoreDocument(document, queryTerms, language, intent, chunkScore = 0, facets = {}) {
  const haystack = [
    document.title,
    document.summary,
    document.overview,
    document.searchableText,
    ...(document.keywords || []),
    ...(document.intentTags || []),
    document.folderPath,
    document.documentType,
    JSON.stringify(document.metadata || {}),
  ].join(' ').toLowerCase();
  const termMatches = queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
  return Number(chunkScore || 0)
    + termMatches * 2
    + (document.intentTags?.includes(intent) ? 8 : 0)
    + (document.supportedLanguages?.includes(language) ? 3 : 0)
    + (facets.pathTerms || []).reduce((score, term) => score + (String(document.folderPath || '').toLowerCase().includes(term) ? 2 : 0), 0)
    + Number(document.priority || 0) / 10;
}

function cosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0; let normA = 0; let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += Number(a[index]) * Number(b[index]);
    normA += Number(a[index]) ** 2;
    normB += Number(b[index]) ** 2;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

async function legacyKnowledge(queryTerms, queryEmbedding, limit) {
  const collection = getAIKnowledgeConnection().db.collection('knowledges');
  const documents = await collection.find({}, {
    projection: { slug: 1, title: 1, name: 1, category: 1, summary: 1, version: 1, chunks: 1, updatedAt: 1 },
  }).toArray();
  return documents.map(document => {
    const rankedChunks = asArray(document.chunks).map((chunk, index) => {
      const content = String(chunk.content || '');
      const lower = content.toLowerCase();
      const lexicalScore = queryTerms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
      const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
      return { documentId: document._id, chunkIndex: index, content, score: lexicalScore * 2 + vectorScore * 8 };
    }).filter(chunk => chunk.score > 0).sort((a, b) => b.score - a.score);
    const title = document.title || document.name || String(document.slug || 'Knowledge source').replace(/[-_]+/g, ' ').replace(/\b\w/g, value => value.toUpperCase());
    const titleText = `${title} ${document.category || ''} ${document.slug || ''}`.toLowerCase();
    const titleMatches = queryTerms.reduce((score, term) => score + (titleText.includes(term) ? 3 : 0), 0);
    return {
      ...document,
      title,
      status: 'published',
      ingestionStatus: 'ready',
      targetRoles: ['All Users'],
      retrievedChunks: rankedChunks.slice(0, 3),
      relevanceScore: titleMatches + rankedChunks.slice(0, 3).reduce((sum, chunk) => sum + chunk.score, 0),
    };
  }).filter(document => document.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

async function vectorChunks(queryEmbedding, limit) {
  if (!queryEmbedding?.length) return [];
  const KnowledgeChunk = getKnowledgeChunkModel();
  if (!process.env.AI_KNOWLEDGE_VECTOR_INDEX) {
    const candidates = await KnowledgeChunk.find({ embedding: { $exists: true } })
      .select('+embedding documentId chunkIndex heading content language intentTags')
      .limit(Math.min(1_000, Number(process.env.AI_KNOWLEDGE_LOCAL_VECTOR_SCAN_LIMIT || 500)))
      .lean();
    return candidates.map(chunk => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  try {
    return await KnowledgeChunk.aggregate([
      {
        $vectorSearch: {
          index: process.env.AI_KNOWLEDGE_VECTOR_INDEX,
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: Math.max(50, limit * 15),
          limit,
        },
      },
      {
        $project: {
          documentId: 1,
          chunkIndex: 1,
          heading: 1,
          content: 1,
          language: 1,
          intentTags: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);
  } catch (error) {
    if (process.env.AI_DEBUG === 'true') {
      console.warn('[Knowledge retrieval] Vector index unavailable, using lexical fallback:', error.message);
    }
    return [];
  }
}

async function lexicalChunks(query, limit) {
  const KnowledgeChunk = getKnowledgeChunkModel();
  try {
    return await KnowledgeChunk.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' }, documentId: 1, chunkIndex: 1, heading: 1, content: 1, language: 1, intentTags: 1 },
    ).sort({ score: { $meta: 'textScore' } }).limit(limit).lean();
  } catch {
    const queryTerms = tokens(query);
    if (!queryTerms.length) return [];
    const expression = queryTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return KnowledgeChunk.find({ searchableText: { $regex: expression, $options: 'i' } })
      .select('documentId chunkIndex heading content language intentTags')
      .limit(limit)
      .lean();
  }
}

export default class KnowledgeBaseService {
  static async retrieve({
    query,
    rewrittenQuery,
    role = 'general',
    intent,
    language = 'en',
    limit = 4,
  }) {
    if (getAIKnowledgeDatabaseState() !== 1) return [];
    const searchQuery = String(rewrittenQuery || query || '').trim();
    const queryTerms = tokens(searchQuery);
    const facets = retrievalFacets(searchQuery);
    if (!queryTerms.length) return [];

    // Market research can require a broader evidence set than conversational
    // answers. Ranking and deduplication below still bound the final context.
    const boundedLimit = Math.min(12, Math.max(1, Number(limit)));
    const cacheKey = JSON.stringify([queryTerms, facets, role, intent, language, boundedLimit]);
    const cached = retrievalCache.get(cacheKey);
    if (cached) return cached;

    const queryEmbeddingPromise = AIEmbeddingService.embed(searchQuery);
    const lexicalPromise = lexicalChunks(searchQuery, boundedLimit * 3);
    const queryEmbedding = await queryEmbeddingPromise;
    const [semantic, lexical] = await Promise.all([
      vectorChunks(queryEmbedding, boundedLimit * 3),
      lexicalPromise,
    ]);

    const chunkMap = new Map();
    for (const chunk of [...semantic, ...lexical]) {
      const key = `${chunk.documentId}:${chunk.chunkIndex}`;
      const previous = chunkMap.get(key);
      if (!previous || Number(chunk.score || 0) > Number(previous.score || 0)) chunkMap.set(key, chunk);
    }

    const KnowledgeDocument = getKnowledgeDocumentModel();
    const chunkRows = [...chunkMap.values()];
    const documentIds = [...new Set(chunkRows.map(chunk => String(chunk.documentId)))];
    const baseMatch = {
      status: 'published',
      ingestionStatus: { $ne: 'failed' },
      targetRoles: roleFilter(role),
    };
    if (facets.pathTerms.length) {
      const folderExpression = facets.pathTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      baseMatch.$and = [{
        $or: [
          { folderPath: { $exists: false } },
          { folderPath: '' },
          { folderPath: { $regex: folderExpression, $options: 'i' } },
        ],
      }];
    }

    let documents = documentIds.length
      ? await KnowledgeDocument.find({ ...baseMatch, _id: { $in: documentIds } })
        .select('-embedding -embeddingModel -ingestionError -updatedBy')
        .lean()
      : [];

    if (!documents.length) {
      const expression = queryTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      documents = await KnowledgeDocument.find({
        ...baseMatch,
        $or: [
          { searchableText: { $regex: expression, $options: 'i' } },
          ...(intent ? [{ intentTags: intent }] : []),
        ],
      })
        .select('-embedding -embeddingModel -ingestionError -updatedBy')
        .sort({ priority: -1, lastUpdated: -1 })
        .limit(boundedLimit * 2)
        .lean();
    }

    if (!documents.length) {
      const legacy = await legacyKnowledge(queryTerms, queryEmbedding, boundedLimit);
      retrievalCache.set(cacheKey, legacy);
      return legacy;
    }

    const ranked = documents
      .map(document => {
        const matchingChunks = chunkRows
          .filter(chunk => String(chunk.documentId) === String(document._id))
          .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
          .slice(0, 2);
        const chunkScore = matchingChunks.reduce((total, chunk) => total + Number(chunk.score || 0), 0);
        return {
          ...document,
          retrievedChunks: matchingChunks,
          relevanceScore: scoreDocument(document, queryTerms, language, intent, chunkScore, facets),
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore || new Date(b.lastUpdated) - new Date(a.lastUpdated))
      .slice(0, boundedLimit);

    retrievalCache.set(cacheKey, ranked);
    return ranked;
  }

  static format(documents = []) {
    return documents.map(doc => {
      const excerpts = doc.retrievedChunks?.length
        ? doc.retrievedChunks.map(chunk => chunk.content).join('\n')
        : doc.summary || doc.overview || String(doc.content || '').slice(0, 1_600);
      return [
        `Knowledge: ${doc.title} (v${doc.version})`,
        excerpts,
        doc.steps?.length ? `Steps:\n${doc.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : '',
        doc.businessRules?.length ? `Rules:\n${doc.businessRules.map(rule => `- ${rule}`).join('\n')}` : '',
        doc.warnings?.length ? `Warnings:\n${doc.warnings.map(item => `- ${item}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n').slice(0, Number(process.env.AI_KNOWLEDGE_CONTEXT_LIMIT || 6_000));
  }

  static list(input = {}) {
    if (getAIKnowledgeDatabaseState() !== 1) {
      throw Object.assign(new Error('AI knowledge database is unavailable.'), { statusCode: 503 });
    }
    const KnowledgeDocument = getKnowledgeDocumentModel();
    const query = input.status ? { status: input.status } : {};
    return KnowledgeDocument.find(query)
      .select('-embedding -embeddingModel -ingestionError -updatedBy')
      .sort({ updatedAt: -1 })
      .limit(Math.min(100, Number(input.limit || 30)))
      .lean();
  }

  static async upsert(payload, actorId) {
    if (getAIKnowledgeDatabaseState() !== 1) {
      throw Object.assign(new Error('AI knowledge database is unavailable.'), { statusCode: 503 });
    }
    const KnowledgeDocument = getKnowledgeDocumentModel();
    const version = Math.max(1, Number(payload.version || 1));
    const slug = String(payload.slug || payload.title || '')
      .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) throw Object.assign(new Error('A valid title or slug is required.'), { statusCode: 400 });

    const normalized = {
      ...payload,
      slug,
      version,
      targetRoles: asArray(payload.targetRoles, ['All Users']),
      supportedLanguages: asArray(payload.supportedLanguages, ['en']),
      keywords: asArray(payload.keywords),
      synonyms: asArray(payload.synonyms),
      intentTags: asArray(payload.intentTags),
      searchTerms: asArray(payload.searchTerms),
      searchableText: [
        payload.title,
        payload.category,
        payload.subcategory,
        payload.summary,
        payload.overview,
        payload.content,
        ...asArray(payload.keywords),
        ...asArray(payload.synonyms),
        ...asArray(payload.intentTags),
        ...asArray(payload.searchTerms),
        payload.folderPath,
        payload.documentType,
        JSON.stringify(payload.metadata || {}),
      ].filter(Boolean).join(' ').toLowerCase(),
      lastUpdated: new Date(),
      updatedBy: actorId,
    };
    const document = await KnowledgeDocument.findOneAndUpdate(
      { slug, version },
      normalized,
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    retrievalCache.flushAll();
    return document;
  }

  static async ingest({ payload, content, source = {} }, actorId) {
    if (getAIKnowledgeDatabaseState() !== 1) {
      throw Object.assign(new Error('AI knowledge database is unavailable.'), { statusCode: 503 });
    }
    const cleaned = cleanKnowledgeContent(content, source.type);
    if (cleaned.length < 40) {
      throw Object.assign(new Error('The source did not contain enough readable content.'), { statusCode: 400 });
    }

    const KnowledgeDocument = getKnowledgeDocumentModel();
    const KnowledgeChunk = getKnowledgeChunkModel();
    const hash = contentHash(cleaned);
    const existing = await KnowledgeDocument.findOne({ contentHash: hash, status: { $ne: 'archived' } }).lean();
    if (existing && payload.force !== true && payload.force !== 'true') {
      return { document: existing, duplicate: true };
    }

    const inferredKeywords = extractKeywords(cleaned);
    const document = await this.upsert({
      ...payload,
      content: cleaned,
      summary: payload.summary || cleaned.slice(0, 420),
      keywords: [...new Set([...asArray(payload.keywords), ...inferredKeywords])],
      source,
      contentHash: hash,
      ingestionStatus: 'processing',
      status: payload.status || 'published',
    }, actorId);

    try {
      const chunks = chunkKnowledgeContent(cleaned, {
        maxLength: Number(process.env.AI_KNOWLEDGE_CHUNK_LENGTH || 1_400),
        overlap: Number(process.env.AI_KNOWLEDGE_CHUNK_OVERLAP || 180),
      });
      const embeddings = await AIEmbeddingService.embedMany(chunks.map(chunk => chunk.content));
      await KnowledgeChunk.deleteMany({ documentId: document._id });
      if (chunks.length) {
        await KnowledgeChunk.insertMany(chunks.map((chunk, index) => ({
          documentId: document._id,
          chunkIndex: index,
          heading: chunk.heading,
          content: chunk.content,
          searchableText: `${document.title} ${chunk.heading} ${chunk.content}`.toLowerCase(),
          keywords: extractKeywords(chunk.content, 12),
          language: asArray(payload.supportedLanguages, ['en'])[0],
          intentTags: asArray(payload.intentTags),
          ...(embeddings[index]?.length ? {
            embedding: embeddings[index],
            embeddingModel: AIEmbeddingService.model,
          } : {}),
          metadata: {
            sourceType: source.type,
            fileName: source.fileName,
            documentSlug: document.slug,
            folderPath: payload.folderPath,
            documentType: payload.documentType,
            ...(payload.metadata || {}),
          },
        })));
      }
      document.chunkCount = chunks.length;
      document.ingestionStatus = 'ready';
      document.ingestionError = undefined;
      await document.save();
      retrievalCache.flushAll();
      return { document, duplicate: false, embeddedChunks: embeddings.filter(Boolean).length };
    } catch (error) {
      document.ingestionStatus = 'failed';
      document.ingestionError = String(error.message || error).slice(0, 500);
      await document.save();
      throw error;
    }
  }
}
