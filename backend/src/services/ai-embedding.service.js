import crypto from 'node:crypto';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ai.esyglob.in';
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || 'nomic-embed-text';
let disabledUntil = 0;
const embeddingCache = new Map();
const EMBEDDING_CACHE_TTL = Number(process.env.AI_EMBEDDING_CACHE_TTL_MS || 60 * 60 * 1000);
const EMBEDDING_CACHE_MAX = Number(process.env.AI_EMBEDDING_CACHE_MAX || 1_000);

function cacheKey(text) {
  return crypto.createHash('sha256').update(`${EMBEDDING_MODEL}:${text}`).digest('hex');
}

function getCached(key) {
  const entry = embeddingCache.get(key);
  if (!entry || Date.now() - entry.createdAt > EMBEDDING_CACHE_TTL) {
    embeddingCache.delete(key);
    return null;
  }
  return entry.embedding;
}

function setCached(key, embedding) {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) embeddingCache.delete(embeddingCache.keys().next().value);
  embeddingCache.set(key, { embedding, createdAt: Date.now() });
}

export default class AIEmbeddingService {
  static get model() {
    return EMBEDDING_MODEL;
  }

  static async embed(input) {
    const text = String(input || '').trim();
    if (!text || process.env.AI_EMBEDDINGS_ENABLED === 'false' || Date.now() < disabledUntil) return null;
    const key = cacheKey(text);
    const cached = getCached(key);
    if (cached) return cached;

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(Number(process.env.AI_EMBEDDING_TIMEOUT_MS || 5_000)),
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8_000) }),
      });
      if (!response.ok) {
        disabledUntil = Date.now() + Number(process.env.AI_EMBEDDING_RETRY_DELAY_MS || 60_000);
        return null;
      }
      const data = await response.json();
      const embedding = data.embeddings?.[0] || data.embedding;
      if (!Array.isArray(embedding) || !embedding.length) return null;
      const normalized = embedding.map(Number);
      setCached(key, normalized);
      return normalized;
    } catch (error) {
      disabledUntil = Date.now() + Number(process.env.AI_EMBEDDING_RETRY_DELAY_MS || 60_000);
      if (process.env.AI_DEBUG === 'true') {
        console.warn('[AI embeddings] Provider unavailable:', error.message);
      }
      return null;
    }
  }

  static async embedMany(values, concurrency = 3) {
    const queue = [...values];
    const output = new Array(queue.length);
    let cursor = 0;
    const workers = Array.from(
      { length: Math.max(1, Math.min(concurrency, queue.length)) },
      async () => {
        while (cursor < queue.length) {
          const index = cursor;
          cursor += 1;
          output[index] = await this.embed(queue[index]);
        }
      },
    );
    await Promise.all(workers);
    return output;
  }
}
