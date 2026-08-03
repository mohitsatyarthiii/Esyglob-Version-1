import crypto from 'node:crypto';
import AIEmbeddingService from './ai-embedding.service.js';

const localEntries = new Map();
const exactEntries = new Map();
const stats = { hits: 0, exactHits: 0, semanticHits: 0, misses: 0, writes: 0, redisErrors: 0 };
const MAX_ENTRIES = Math.max(20, Number(process.env.AI_SEMANTIC_CACHE_MAX || 200));
const THRESHOLD = Math.min(.99, Math.max(.75, Number(process.env.AI_SEMANTIC_CACHE_THRESHOLD || .92)));
const TTLS = Object.freeze({ static_faq: 86_400, stable_general: 21_600, stable_trade: 10_800 });
let redisPromise;

function isSafePublicQuery(query) {
  const text = String(query || '').trim();
  if (!text || text.length > 300) return false;
  if (/\b(my|mine|me|account|profile|order|payment|quotation|rfq|email|phone|address|company)\b/i.test(text)) return false;
  return /^(?:what|why|how|when|where|which|who|define|explain|describe|compare|overview|benefits?)\b/i.test(text);
}

function cosine(a = [], b = []) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let left = 0; let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; left += a[index] ** 2; right += b[index] ** 2;
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}

function normalizedQuery(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function exactKey(query, category) {
  return `${category}:${normalizedQuery(query)}`;
}

async function redisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!redisPromise) redisPromise = import('redis').then(async ({ createClient }) => {
    const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 1_500, reconnectStrategy: false } });
    client.on('error', () => { stats.redisErrors += 1; });
    await client.connect();
    return client;
  }).catch(() => null);
  return redisPromise;
}

function pruneLocal() {
  const now = Date.now();
  for (const [key, value] of localEntries) {
    if (value.expiresAt > now) continue;
    localEntries.delete(key);
    if (exactEntries.get(value.exactKey) === key) exactEntries.delete(value.exactKey);
  }
  while (localEntries.size > MAX_ENTRIES) {
    const oldestKey = localEntries.keys().next().value;
    const oldest = localEntries.get(oldestKey);
    localEntries.delete(oldestKey);
    if (oldest && exactEntries.get(oldest.exactKey) === oldestKey) exactEntries.delete(oldest.exactKey);
  }
}

function storeLocal(entry) {
  const key = entry.id || crypto.randomUUID();
  const resolvedExactKey = entry.exactKey || (entry.query ? exactKey(entry.query, entry.category) : '');
  const value = { ...entry, id: key, exactKey: resolvedExactKey };
  const previousId = resolvedExactKey ? exactEntries.get(resolvedExactKey) : null;
  if (previousId && previousId !== key) localEntries.delete(previousId);
  localEntries.set(key, value);
  if (resolvedExactKey) exactEntries.set(resolvedExactKey, key);
  pruneLocal();
  return value;
}

export default class AISemanticCacheService {
  static async get(query, category) {
    if (!TTLS[category] || !isSafePublicQuery(query) || process.env.AI_SEMANTIC_CACHE_ENABLED === 'false') return null;
    pruneLocal();
    const directId = exactEntries.get(exactKey(query, category));
    const direct = directId ? localEntries.get(directId) : null;
    if (direct?.expiresAt > Date.now()) {
      stats.hits += 1;
      stats.exactHits += 1;
      return { response: direct.response, similarity: 1 };
    }
    const vector = await AIEmbeddingService.embed(query);
    if (!vector) return null;
    let candidates = [...localEntries.values()].filter(item => item.category === category);
    let best = null;
    for (const candidate of candidates) {
      if (candidate.expiresAt <= Date.now()) continue;
      const score = cosine(vector, candidate.vector);
      if (score >= THRESHOLD && (!best || score > best.score)) best = { ...candidate, score };
    }
    if (best) {
      stats.hits += 1;
      stats.semanticHits += 1;
      return { response: best.response, similarity: best.score };
    }
    const redis = await redisClient();
    if (redis) {
      const rows = await redis.lRange(`esyglob:ai:semantic:${category}`, 0, MAX_ENTRIES - 1).catch(() => []);
      candidates = rows.map(row => { try { return JSON.parse(row); } catch { return null; } }).filter(Boolean);
    }
    for (const candidate of candidates) {
      if (candidate.expiresAt <= Date.now()) continue;
      const score = cosine(vector, candidate.vector);
      if (score >= THRESHOLD && (!best || score > best.score)) best = { ...candidate, score };
    }
    if (best) {
      storeLocal(best);
      stats.hits += 1;
      stats.semanticHits += 1;
      return { response: best.response, similarity: best.score };
    }
    stats.misses += 1;
    return null;
  }

  static async put(query, response, category) {
    if (!TTLS[category] || !response || !isSafePublicQuery(query) || process.env.AI_SEMANTIC_CACHE_ENABLED === 'false') return false;
    const vector = await AIEmbeddingService.embed(query);
    if (!vector) return false;
    const entry = storeLocal({ id: crypto.randomUUID(), query, category, vector, response, expiresAt: Date.now() + TTLS[category] * 1_000 });
    stats.writes += 1;
    const redis = await redisClient();
    if (redis) await redis.multi().lPush(`esyglob:ai:semantic:${category}`, JSON.stringify(entry)).lTrim(`esyglob:ai:semantic:${category}`, 0, MAX_ENTRIES - 1).expire(`esyglob:ai:semantic:${category}`, TTLS[category]).exec().catch(() => { stats.redisErrors += 1; });
    return true;
  }

  static status() {
    const total = stats.hits + stats.misses;
    return { ...stats, entries: localEntries.size, threshold: THRESHOLD, redisConfigured: Boolean(process.env.REDIS_URL), hitRatio: total ? stats.hits / total : 0 };
  }
}
