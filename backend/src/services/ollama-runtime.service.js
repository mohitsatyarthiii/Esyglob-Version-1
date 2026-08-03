const MODEL = 'qwen3:4b';
const BASE_URL = String(process.env.OLLAMA_BASE_URL || 'https://ai.esyglob.in').replace(/\/$/, '');
const ENABLED = process.env.OLLAMA_ENABLED !== 'false';
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '24h';
const MAX_CONCURRENCY = Math.max(1, Number(process.env.OLLAMA_MAX_CONCURRENCY || 2));
const MAX_QUEUE = Math.max(1, Number(process.env.OLLAMA_MAX_QUEUE || 64));

const queue = [];
let active = 0;
let warmPromise;
const samples = [];
const counters = { requests: 0, successes: 0, failures: 0, cancelled: 0, retries: 0 };

function runtimeError(message, statusCode = 503, code = 'AI_PROVIDER_UNAVAILABLE') {
  return Object.assign(new Error(message), { statusCode, code });
}

function record(sample) {
  samples.push(sample);
  if (samples.length > 500) samples.shift();
}

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)];
}

function drain() {
  while (active < MAX_CONCURRENCY && queue.length) {
    const item = queue.shift();
    if (item.signal?.aborted) {
      counters.cancelled += 1;
      item.reject(runtimeError('AI request was cancelled', 499, 'AI_REQUEST_CANCELLED'));
      continue;
    }
    active += 1;
    item.run().then(item.resolve, item.reject).finally(() => { active -= 1; drain(); });
  }
}

function enqueue(run, signal) {
  if (!ENABLED) return Promise.reject(runtimeError('AI service is temporarily unavailable'));
  if (queue.length >= MAX_QUEUE) return Promise.reject(runtimeError('AI service is busy; please retry shortly', 503, 'AI_QUEUE_FULL'));
  return new Promise((resolve, reject) => {
    const item = { run, resolve, reject, signal };
    queue.push(item);
    signal?.addEventListener('abort', () => {
      const index = queue.indexOf(item);
      if (index >= 0) {
        queue.splice(index, 1);
        counters.cancelled += 1;
        reject(runtimeError('AI request was cancelled', 499, 'AI_REQUEST_CANCELLED'));
      }
    }, { once: true });
    drain();
  });
}

function requestSignal(external, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external && typeof AbortSignal.any === 'function' ? AbortSignal.any([external, timeout]) : timeout;
}

async function readStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let content = ''; let tokens = 0; let firstTokenAt = 0;
  let filterBuffer = ''; let hidingReasoning = false;
  const emitSafe = (value, final = false) => {
    filterBuffer += value;
    const open = '<think>'; const close = '</think>';
    while (filterBuffer) {
      const marker = hidingReasoning ? close : open;
      const index = filterBuffer.toLowerCase().indexOf(marker);
      if (index >= 0) {
        if (!hidingReasoning && index) {
          const visible = filterBuffer.slice(0, index);
          content += visible; onToken?.(visible);
        }
        filterBuffer = filterBuffer.slice(index + marker.length);
        hidingReasoning = !hidingReasoning;
        continue;
      }
      const keep = final ? 0 : Math.min(marker.length - 1, filterBuffer.length);
      const visibleLength = filterBuffer.length - keep;
      if (!hidingReasoning && visibleLength > 0) {
        const visible = filterBuffer.slice(0, visibleLength);
        content += visible; onToken?.(visible);
      }
      filterBuffer = keep ? filterBuffer.slice(-keep) : '';
      if (hidingReasoning && !final) filterBuffer = filterBuffer.slice(-keep);
      break;
    }
  };
  const processLine = line => {
    if (!line.trim()) return;
    const data = JSON.parse(line);
    // Ollama may return reasoning separately. It is intentionally never forwarded.
    const token = data.message?.content || data.response || '';
    if (token) {
      if (!firstTokenAt) firstTokenAt = Date.now();
      emitSafe(token);
    }
    if (data.eval_count) tokens = data.eval_count;
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) processLine(line);
    if (done) break;
  }
  if (buffer.trim()) processLine(buffer);
  emitSafe('', true);
  return { content, tokens, firstTokenAt };
}

class OllamaRuntimeService {
  static model = MODEL;

  static async complete({ messages, stream = false, onToken, signal, timeoutMs, temperature = 0.3, topP = 0.85, repeatPenalty = 1.08, maxTokens = 520, jsonMode = false } = {}) {
    const queuedAt = Date.now();
    return enqueue(async () => {
      counters.requests += 1;
      const startedAt = Date.now();
      let streamed = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: requestSignal(signal, Number(timeoutMs || process.env.OLLAMA_REQUEST_TIMEOUT_MS || 90_000)),
            body: JSON.stringify({
              model: MODEL, messages, stream, think: false, keep_alive: KEEP_ALIVE,
              ...(jsonMode ? { format: 'json' } : {}),
              options: {
                temperature,
                top_p: topP,
                repeat_penalty: repeatPenalty,
                num_ctx: Math.max(2_048, Number(process.env.OLLAMA_CONTEXT_SIZE || 8_192)),
                num_predict: maxTokens,
              },
            }),
          });
          if (!response.ok) throw runtimeError(`AI provider returned HTTP ${response.status}`, response.status >= 500 ? 503 : response.status);
          let content; let tokens; let firstTokenAt;
          if (stream) {
            const result = await readStream(response, token => { streamed = true; onToken?.(token); });
            ({ content, tokens, firstTokenAt } = result);
          } else {
            const data = await response.json();
            content = data.message?.content || data.response || '';
            tokens = data.eval_count || 0;
            firstTokenAt = Date.now();
          }
          const completedAt = Date.now();
          counters.successes += 1;
          record({ queueMs: startedAt - queuedAt, firstTokenMs: firstTokenAt - startedAt, totalMs: completedAt - queuedAt, tokens });
          return { success: true, message: content.trim(), content: content.trim(), tokensUsed: tokens, provider: 'ollama', model: MODEL, fallback: false };
        } catch (error) {
          const retryable = !streamed && attempt === 0 && (error.name === 'TimeoutError' || error.name === 'AbortError' || error.statusCode >= 500);
          if (retryable && !signal?.aborted) { counters.retries += 1; continue; }
          counters.failures += 1;
          if (signal?.aborted) counters.cancelled += 1;
          throw runtimeError(signal?.aborted ? 'AI request was cancelled' : `AI service unavailable: ${error.message}`, signal?.aborted ? 499 : 503, signal?.aborted ? 'AI_REQUEST_CANCELLED' : 'AI_PROVIDER_UNAVAILABLE');
        }
      }
    }, signal);
  }

  static warm() {
    if (!ENABLED) return Promise.resolve(false);
    if (!warmPromise) warmPromise = this.complete({ messages: [{ role: 'user', content: 'Reply OK.' }], maxTokens: 2, temperature: 0, timeoutMs: Number(process.env.OLLAMA_WARMUP_TIMEOUT_MS || 90_000) }).then(() => true).catch(() => false).finally(() => { warmPromise = undefined; });
    return warmPromise;
  }

  static status() {
    const totals = samples.map(item => item.totalMs);
    return { enabled: ENABLED, baseUrl: BASE_URL, model: MODEL, keepAlive: KEEP_ALIVE, queue: { active, pending: queue.length, maxConcurrency: MAX_CONCURRENCY, maxQueue: MAX_QUEUE }, counters: { ...counters }, latency: { averageMs: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0, p95Ms: percentile(totals, .95), firstTokenP95Ms: percentile(samples.map(item => item.firstTokenMs), .95) } };
  }
}

export { BASE_URL as OLLAMA_BASE_URL, ENABLED as OLLAMA_ENABLED, MODEL as OLLAMA_MODEL };
export default OllamaRuntimeService;
