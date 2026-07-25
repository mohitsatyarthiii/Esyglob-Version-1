const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ai.esyglob.in';
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || 'nomic-embed-text';
let disabledUntil = 0;

export default class AIEmbeddingService {
  static get model() {
    return EMBEDDING_MODEL;
  }

  static async embed(input) {
    const text = String(input || '').trim();
    if (!text || process.env.AI_EMBEDDINGS_ENABLED === 'false' || Date.now() < disabledUntil) return null;

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
      return Array.isArray(embedding) && embedding.length ? embedding.map(Number) : null;
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
