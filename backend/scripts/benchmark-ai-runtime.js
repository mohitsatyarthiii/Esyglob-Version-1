import process from 'node:process';
import OllamaRuntimeService from '../src/services/ollama-runtime.service.js';

const runs = Math.max(3, Number(process.argv.find(arg => arg.startsWith('--runs='))?.split('=')[1] || process.env.npm_config_runs || 10));
const samples = [];

await OllamaRuntimeService.validateModel({ force: true });

const memoryBefore = process.memoryUsage();
const cpuBefore = process.cpuUsage();

let benchmarkError = null;
for (let index = 0; index < runs; index += 1) {
  try {
    const startedAt = performance.now();
    let firstTokenAt = 0;
    const result = await OllamaRuntimeService.complete({
      messages: [{ role: 'system', content: 'Answer concisely without hidden reasoning.' }, { role: 'user', content: index ? 'In one sentence, define MOQ.' : 'Reply with READY.' }],
      stream: true,
      maxTokens: 80,
      onToken() { if (!firstTokenAt) firstTokenAt = performance.now(); },
    });
    samples.push({ totalMs: Math.round(performance.now() - startedAt), firstTokenMs: Math.round(firstTokenAt - startedAt), tokens: result.tokensUsed });
  } catch (error) {
    benchmarkError = { code: error.code, message: error.message };
    break;
  }
}

const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const percentile = (values, value) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] : null;
};
const totalTimes = samples.map(item => item.totalMs);
const firstTokenTimes = samples.map(item => item.firstTokenMs);
const cpu = process.cpuUsage(cpuBefore);
const report = {
  model: OllamaRuntimeService.model,
  completed: !benchmarkError && samples.length === runs,
  error: benchmarkError,
  firstRequestMs: samples[0]?.totalMs ?? null,
  warmAverageMs: average(samples.slice(1).map(item => item.totalMs)),
  averageMs: average(totalTimes),
  p50Ms: percentile(totalTimes, .5),
  p95Ms: percentile(totalTimes, .95),
  p99Ms: percentile(totalTimes, .99),
  firstTokenAverageMs: average(firstTokenTimes),
  firstTokenP50Ms: percentile(firstTokenTimes, .5),
  firstTokenP95Ms: percentile(firstTokenTimes, .95),
  firstTokenP99Ms: percentile(firstTokenTimes, .99),
  firstMeaningfulSentenceAverageMs: average(firstTokenTimes),
  tokenThroughputPerSecond: (() => {
    const seconds = samples.reduce((sum, item) => sum + item.totalMs, 0) / 1000;
    return seconds ? Number((samples.reduce((sum, item) => sum + Number(item.tokens || 0), 0) / seconds).toFixed(2)) : null;
  })(),
  processMemoryDeltaMb: Math.round((process.memoryUsage().rss - memoryBefore.rss) / 1024 / 1024),
  processCpuMs: Math.round((cpu.user + cpu.system) / 1000),
  samples,
  runtime: OllamaRuntimeService.status(),
};

console.log(JSON.stringify(report, null, 2));
