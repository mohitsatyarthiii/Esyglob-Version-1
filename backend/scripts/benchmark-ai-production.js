import process from 'node:process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import OllamaRuntimeService from '../src/services/ollama-runtime.service.js';
import { assertSafeAIOutput } from '../src/lib/ai-output-sanitizer.js';

const prompts = [
  'What does MOQ mean in B2B purchasing?',
  'Explain FOB and CIF in two concise sentences.',
  'What should a buyer verify before selecting a supplier?',
  'List the essential details needed in an RFQ.',
  'How does trade assurance reduce procurement risk?',
  'What is a commercial invoice used for?',
  'Explain the purpose of an HS code.',
  'What affects international shipping lead time?',
  'How should a buyer compare two supplier quotations?',
  'What is the difference between a manufacturer and a trader?',
  'Give three checks for evaluating a steel pipe supplier.',
  'What documents are commonly required for customs clearance?',
  'How can a supplier improve a product listing?',
  'Explain minimum order quantity negotiation briefly.',
  'What does EXW mean for an international buyer?',
  'Why are product certifications important in B2B trade?',
  'What information should a supplier include in a quotation?',
  'How can buyers reduce sample-order risk?',
  'What is the role of inspection before shipment?',
  'Explain payment terms such as advance and letter of credit.',
];

const requestedRuns = Number(process.argv.find(value => value.startsWith('--runs='))?.split('=')[1] || 100);
const runs = Math.max(20, requestedRuns);
const concurrency = Math.max(1, Math.min(2, Number(process.argv.find(value => value.startsWith('--concurrency='))?.split('=')[1] || 2)));
const contextSize = Math.max(2_048, Number(process.argv.find(value => value.startsWith('--context='))?.split('=')[1] || 4_096));
const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
};
const average = values => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  : null;

await OllamaRuntimeService.validateModel({ force: true });
await OllamaRuntimeService.warm();

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const memoryBefore = process.memoryUsage().rss;
const cpuBefore = process.cpuUsage();
const benchmarkStartedAt = performance.now();
const samples = [];
let cursor = 0;
const workers = Array.from({ length: concurrency }, async () => {
  while (cursor < runs) {
    const index = cursor;
    cursor += 1;
    const prompt = prompts[index % prompts.length];
    const startedAt = performance.now();
    let firstVisibleAt = 0;
    let streamed = '';
    try {
      const result = await OllamaRuntimeService.complete({
        messages: [
          { role: 'system', content: 'Answer directly as a professional B2B trade assistant. Use at most two concise sentences. Return only the final answer.' },
          { role: 'user', content: prompt },
        ],
        stream: true,
        maxTokens: 48,
        contextSize,
        onToken(chunk) {
          if (!firstVisibleAt) firstVisibleAt = performance.now();
          streamed += chunk;
        },
      });
      assertSafeAIOutput(streamed);
      samples.push({
        success: true,
        promptIndex: index % prompts.length,
        firstVisibleMs: Math.round(firstVisibleAt - startedAt),
        totalMs: Math.round(performance.now() - startedAt),
        tokens: Number(result.tokensUsed || 0),
        outputCharacters: streamed.length,
      });
    } catch (error) {
      samples.push({ success: false, promptIndex: index % prompts.length, totalMs: Math.round(performance.now() - startedAt), code: error.code || 'ERROR' });
    }
  }
});
await Promise.all(workers);

const elapsedMs = Math.round(performance.now() - benchmarkStartedAt);
const cpu = process.cpuUsage(cpuBefore);
const successful = samples.filter(sample => sample.success);
const totals = successful.map(sample => sample.totalMs);
const firstVisible = successful.map(sample => sample.firstVisibleMs);
const tokens = successful.reduce((sum, sample) => sum + sample.tokens, 0);
eventLoop.disable();

const report = {
  model: OllamaRuntimeService.model,
  runs,
  concurrency,
  contextSize,
  successes: successful.length,
  failures: samples.length - successful.length,
  elapsedMs,
  requestsPerMinute: elapsedMs ? Number((successful.length * 60_000 / elapsedMs).toFixed(2)) : null,
  latency: {
    averageMs: average(totals),
    p50Ms: percentile(totals, .5),
    p90Ms: percentile(totals, .9),
    p95Ms: percentile(totals, .95),
    p99Ms: percentile(totals, .99),
  },
  firstVisible: {
    averageMs: average(firstVisible),
    p50Ms: percentile(firstVisible, .5),
    p90Ms: percentile(firstVisible, .9),
    p95Ms: percentile(firstVisible, .95),
    p99Ms: percentile(firstVisible, .99),
  },
  tokenThroughputPerSecond: elapsedMs ? Number((tokens / (elapsedMs / 1_000)).toFixed(2)) : null,
  averageTokens: successful.length ? Number((tokens / successful.length).toFixed(2)) : null,
  processCpuMs: Math.round((cpu.user + cpu.system) / 1_000),
  processMemoryDeltaMb: Math.round((process.memoryUsage().rss - memoryBefore) / 1_048_576),
  eventLoopDelayMs: {
    mean: Number((eventLoop.mean / 1_000_000).toFixed(2)),
    p95: Number((eventLoop.percentile(95) / 1_000_000).toFixed(2)),
    max: Number((eventLoop.max / 1_000_000).toFixed(2)),
  },
  runtime: OllamaRuntimeService.status(),
};

console.log(JSON.stringify(report, null, 2));
