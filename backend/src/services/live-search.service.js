import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600, checkperiod: 120, maxKeys: 200, useClones: false });

export default class LiveSearchService {
  static async search(query, limit = 3) {
    const key = String(query || '').trim().toLowerCase();
    if (!key || !process.env.TAVILY_API_KEY) return { results: [], available: false };
    const cached = cache.get(key);
    if (cached) return { results: cached, available: true, cached: true };
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(Number(process.env.LIVE_SEARCH_TIMEOUT_MS || 8000)),
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: key,
        search_depth: 'basic',
        max_results: Math.min(3, Math.max(1, Number(limit))),
        include_answer: false,
      }),
    });
    if (!response.ok) throw new Error(`Live search returned ${response.status}`);
    const data = await response.json();
    const results = (data.results || []).slice(0, 3).map(item => ({
      title: String(item.title || '').slice(0, 180),
      url: String(item.url || ''),
      content: String(item.content || '').slice(0, 700),
      publishedDate: item.published_date || null,
    }));
    cache.set(key, results);
    return { results, available: true, cached: false };
  }
}
