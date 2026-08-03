import crypto from 'node:crypto';

const EMBEDDING_MODEL = 'local-hash-v1';
const embeddingCache = new Map();
const EMBEDDING_CACHE_TTL = Number(process.env.AI_EMBEDDING_CACHE_TTL_MS || 60 * 60 * 1000);
const EMBEDDING_CACHE_MAX = Number(process.env.AI_EMBEDDING_CACHE_MAX || 1_000);
// Stable local vectors keep retrieval independent from a second inference model.
const LOCAL_DIMENSIONS = Number(process.env.AI_LOCAL_EMBEDDING_DIMENSIONS || 768);

function localEmbedding(text) {
  const vector = new Array(LOCAL_DIMENSIONS).fill(0);
  const terms = String(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) || [];
  for (const term of terms) {
    const digest = crypto.createHash('sha256').update(term).digest();
    for (let offset = 0; offset < 4; offset += 1) {
      const index = digest.readUInt16BE(offset * 2) % LOCAL_DIMENSIONS;
      vector[index] += digest[offset + 8] % 2 ? 1 : -1;
    }
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map(value => value / magnitude);
}

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
    if (!text || process.env.AI_EMBEDDINGS_ENABLED === 'false') return null;
    const key = cacheKey(text);
    const cached = getCached(key);
    if (cached) return cached;
    const embedding = localEmbedding(text.slice(0, 8_000));
    setCached(key, embedding);
    return embedding;
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
