import { performance } from 'node:perf_hooks';
import AIChatService from '../src/services/ai-chat.service.js';
import AIIntentRouterService from '../src/services/ai-intent-router.service.js';
import AIService from '../src/lib/ai-service.js';
import KnowledgeBaseService from '../src/services/knowledge-base.service.js';
import { config } from '../src/config/env.js';

const prompts = [
  'Explain FOB briefly.',
  'What does MOQ mean for buyers?',
  'How should I compare supplier quotations?',
  'What documents are commonly used in international shipping?',
  'What is the EsyGlob refund policy?',
  'How does seller verification work on EsyGlob?',
  'How do I send a product enquiry on EsyGlob?',
  'What information belongs in an RFQ?',
  'How can a supplier improve quotation quality?',
  'Explain pre-shipment inspection.',
  'Find verified steel suppliers.',
  'Show packaging products with low MOQ.',
  'Compare manufacturers for industrial valves.',
  'Show my current orders.',
  'Track my quotation status.',
  'What are the latest customs tariff changes today?',
  'Who are you?',
  'Explain a letter of credit.',
  'What should buyers verify before paying?',
  'How can I contact EsyGlob support?',
];

const samples = [];
let documentRetrievalCalls = 0;
const originalRetrieve = KnowledgeBaseService.retrieve;
KnowledgeBaseService.retrieve = async (...args) => {
  documentRetrievalCalls += 1;
  return originalRetrieve.apply(KnowledgeBaseService, args);
};

try {
  for (let index = 0; index < 100; index += 1) {
    const message = prompts[index % prompts.length];
    const startedAt = performance.now();
    const route = AIIntentRouterService.route(message);
    const requiresLivePlatformData = ['database_first'].includes(route.handling) || /\bmy\b/i.test(message);
    let promptCharacters = 0;
    if (!requiresLivePlatformData && route.handling !== 'live_retrieval') {
      const context = await AIChatService.buildPlatformContext(message, 'buyer', '000000000000000000000001', { messages: [], context: {} });
      const systemPrompt = AIService.buildMarketplaceSystemPrompt('buyer', context.text, context.snapshot.intelligence);
      promptCharacters = systemPrompt.length;
    }
    samples.push({ route: route.handling, requiresLivePlatformData, elapsedMs: performance.now() - startedAt, promptCharacters });
  }
} finally {
  KnowledgeBaseService.retrieve = originalRetrieve;
}

const values = samples.map(sample => sample.elapsedMs).sort((left, right) => left - right);
const average = values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = fraction => values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
const routeCounts = samples.reduce((counts, sample) => ({ ...counts, [sample.route]: (counts[sample.route] || 0) + 1 }), {});
const promptSamples = samples.filter(sample => sample.promptCharacters);

console.log(JSON.stringify({
  requests: samples.length,
  architecture: config.aiRagEnabled ? 'rag-enabled-comparison' : 'gemma-first',
  documentRetrievalCalls,
  databaseRequiredRequests: samples.filter(sample => sample.requiresLivePlatformData).length,
  directOrGuideRequests: samples.filter(sample => !sample.requiresLivePlatformData).length,
  routingAndContextLatencyMs: {
    average: Number(average.toFixed(3)),
    p50: Number(percentile(.5).toFixed(3)),
    p95: Number(percentile(.95).toFixed(3)),
    p99: Number(percentile(.99).toFixed(3)),
  },
  averagePromptCharacters: promptSamples.length
    ? Math.round(promptSamples.reduce((sum, sample) => sum + sample.promptCharacters, 0) / promptSamples.length)
    : 0,
  routeCounts,
}, null, 2));
