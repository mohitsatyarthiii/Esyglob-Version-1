import { assertSafeAIOutput, FinalAnswerStreamFilter } from '../lib/ai-output-sanitizer.js';

const MODEL = 'qwen3:4b';
const BASE_URL = String(process.env.OLLAMA_BASE_URL || 'https://ai.esyglob.in').replace(/\/$/, '');
const ENABLED = process.env.OLLAMA_ENABLED !== 'false';
const KEEP_ALIVE_SETTING = process.env.OLLAMA_KEEP_ALIVE || '-1';
const KEEP_ALIVE = KEEP_ALIVE_SETTING === '-1' ? -1 : KEEP_ALIVE_SETTING;
const MAX_CONCURRENCY = Math.max(1, Number(process.env.OLLAMA_MAX_CONCURRENCY || 2));
const MAX_QUEUE = Math.max(1, Number(process.env.OLLAMA_MAX_QUEUE || 64));

const queue = [];
let active = 0;
let warmPromise;
const samples = [];
const counters = { requests: 0, successes: 0, failures: 0, cancelled: 0, retries: 0, slowRequests: 0, filteredOutput: 0, lastSuccessAt: null, lastFailureAt: null };

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

async function readStream(response, onSafeToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let content = ''; let tokens = 0; let firstTokenAt = 0;
  let sanitized = false;
  const filter = new FinalAnswerStreamFilter({
    onAnomaly(event) {
      sanitized = true;
      counters.filteredOutput += 1;
      console.warn('[AI output filter]', JSON.stringify({ code: event.code, tag: event.tag }));
    },
    onDiscard(event) {
      sanitized = true;
      counters.filteredOutput += 1;
      console.warn('[AI output filter]', JSON.stringify({ code: event.code }));
    },
  });
  const emitSafe = value => {
    if (!value) return;
    if (!firstTokenAt) firstTokenAt = Date.now();
    content += value;
    onSafeToken?.(value);
  };
  const processLine = line => {
    if (!line.trim()) return;
    const data = JSON.parse(line);
    // Ollama may return reasoning separately. It is intentionally never forwarded.
    const token = data.message?.content || data.response || '';
    if (token) emitSafe(filter.process(token));
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
  emitSafe(filter.finish());
  return { content, tokens, firstTokenAt, sanitized };
}

class OllamaRuntimeService {
  static model = MODEL;

  static async complete({ messages, stream = false, onToken, signal, timeoutMs, temperature = 0.3, topP = 0.85, repeatPenalty = 1.08, maxTokens = 520, contextSize, jsonMode = false } = {}) {
    const queuedAt = Date.now();
    return enqueue(async () => {
      counters.requests += 1;
      const startedAt = Date.now();
      let streamed = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const requestMessages = attempt === 0 ? messages : [
            { role: 'system', content: 'Return only the polished final answer. Do not describe the user request, prompt, context, instructions, planning, analysis, memory, or reasoning.' },
            ...messages,
          ];
          const response = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: requestSignal(signal, Number(timeoutMs || process.env.OLLAMA_REQUEST_TIMEOUT_MS || 90_000)),
            body: JSON.stringify({
              model: MODEL, messages: requestMessages, stream, think: false, keep_alive: KEEP_ALIVE,
              ...(jsonMode ? { format: 'json' } : {}),
              options: {
                temperature,
                top_p: topP,
                repeat_penalty: repeatPenalty,
                num_ctx: Math.max(2_048, Number(contextSize || process.env.OLLAMA_CONTEXT_SIZE || 8_192)),
                num_predict: maxTokens,
              },
            }),
          });
          if (!response.ok) {
            const providerBody = await response.text().catch(() => '');
            const providerMessage = (() => {
              try { return JSON.parse(providerBody)?.error; } catch { return providerBody.slice(0, 240); }
            })();
            throw runtimeError(`AI provider returned HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`, response.status >= 500 ? 503 : response.status);
          }
          let content; let tokens; let firstTokenAt; let outputSanitized = false;
          if (stream) {
            const result = await readStream(response, chunk => {
              streamed = true;
              onToken?.(chunk);
            });
            ({ content, tokens, firstTokenAt, sanitized: outputSanitized } = result);
          } else {
            const data = await response.json();
            content = data.message?.content || data.response || '';
            tokens = data.eval_count || 0;
            firstTokenAt = Date.now();
          }
          if (!stream) {
            const safe = assertSafeAIOutput(content);
            content = safe.text;
            outputSanitized = safe.changed;
          }
          if (!content.trim()) throw Object.assign(new Error('No safe final answer was generated'), { code: 'AI_OUTPUT_UNSAFE', statusCode: 503 });
          const completedAt = Date.now();
          counters.successes += 1;
          counters.lastSuccessAt = new Date().toISOString();
          if (completedAt - queuedAt > Number(process.env.AI_SLOW_REQUEST_MS || 10_000)) counters.slowRequests += 1;
          record({ queueMs: startedAt - queuedAt, firstTokenMs: firstTokenAt - startedAt, totalMs: completedAt - queuedAt, tokens });
          return { success: true, message: content.trim(), content: content.trim(), tokensUsed: tokens, provider: 'ollama', model: MODEL, fallback: false, outputSanitized };
        } catch (error) {
          const retryable = !streamed && attempt === 0 && (error.code === 'AI_OUTPUT_UNSAFE' || error.name === 'TimeoutError' || error.name === 'AbortError' || error.statusCode >= 500);
          if (retryable && !signal?.aborted) { counters.retries += 1; continue; }
          counters.failures += 1;
          counters.lastFailureAt = new Date().toISOString();
          if (signal?.aborted) counters.cancelled += 1;
          throw runtimeError(signal?.aborted ? 'AI request was cancelled' : `AI service unavailable: ${error.message}`, signal?.aborted ? 499 : 503, signal?.aborted ? 'AI_REQUEST_CANCELLED' : 'AI_PROVIDER_UNAVAILABLE');
        }
      }
    }, signal);
  }

  static warm() {
    if (!ENABLED) return Promise.resolve(false);
    if (active > 0 || queue.length > 0) return Promise.resolve(true);
    if (!warmPromise) warmPromise = this.complete({ messages: [{ role: 'user', content: 'Reply OK.' }], maxTokens: 2, temperature: 0, timeoutMs: Number(process.env.OLLAMA_WARMUP_TIMEOUT_MS || 90_000) }).then(() => true).catch(() => false).finally(() => { warmPromise = undefined; });
    return warmPromise;
  }

  static status() {
    const totals = samples.map(item => item.totalMs);
    const totalTokens = samples.reduce((sum, item) => sum + Number(item.tokens || 0), 0);
    const generationSeconds = samples.reduce((sum, item) => sum + Math.max(0, item.totalMs - item.queueMs) / 1000, 0);
    const memory = process.memoryUsage();
    return { enabled: ENABLED, baseUrl: BASE_URL, model: MODEL, keepAlive: KEEP_ALIVE, health: counters.lastFailureAt && (!counters.lastSuccessAt || counters.lastFailureAt > counters.lastSuccessAt) ? 'degraded' : 'operational', activeSessions: active, queue: { active, pending: queue.length, maxConcurrency: MAX_CONCURRENCY, maxQueue: MAX_QUEUE }, counters: { ...counters }, throughput: { tokensPerSecond: generationSeconds ? Number((totalTokens / generationSeconds).toFixed(2)) : 0, sampleCount: samples.length }, process: { rssMb: Math.round(memory.rss / 1024 / 1024), heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024) }, latency: { averageMs: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0, p95Ms: percentile(totals, .95), firstTokenP95Ms: percentile(samples.map(item => item.firstTokenMs), .95), streamingAverageMs: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0 } };
  }
}

export { BASE_URL as OLLAMA_BASE_URL, ENABLED as OLLAMA_ENABLED, MODEL as OLLAMA_MODEL };
export default OllamaRuntimeService;
