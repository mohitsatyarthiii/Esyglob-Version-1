import process from 'node:process';
import OllamaRuntimeService from '../src/services/ollama-runtime.service.js';

const runs = Math.max(3, Number(process.argv.find(arg => arg.startsWith('--runs='))?.split('=')[1] || 10));
const samples = [];
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

const sorted = samples.map(item => item.totalMs).sort((a, b) => a - b);
const average = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const cpu = process.cpuUsage(cpuBefore);
const report = {
  model: OllamaRuntimeService.model,
  completed: !benchmarkError && samples.length === runs,
  error: benchmarkError,
  coldResponseMs: samples[0]?.totalMs ?? null,
  warmAverageMs: average(samples.slice(1).map(item => item.totalMs)),
  averageMs: average(samples.map(item => item.totalMs)),
  p95Ms: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)] : null,
  firstTokenAverageMs: average(samples.map(item => item.firstTokenMs)),
  processMemoryDeltaMb: Math.round((process.memoryUsage().rss - memoryBefore.rss) / 1024 / 1024),
  processCpuMs: Math.round((cpu.user + cpu.system) / 1000),
  samples,
  runtime: OllamaRuntimeService.status(),
};

console.log(JSON.stringify(report, null, 2));
