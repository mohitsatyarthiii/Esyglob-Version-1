import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRequest, buildConversationMemory } from '../src/lib/ai-intelligence-pipeline.js';
import OllamaRuntimeService from '../src/services/ollama-runtime.service.js';
import AIService from '../src/lib/ai-service.js';
import { assertSafeAIOutput, FinalAnswerStreamFilter, sanitizeAIOutput } from '../src/lib/ai-output-sanitizer.js';
import AIIntentRouterService from '../src/services/ai-intent-router.service.js';
import AISemanticCacheService from '../src/services/ai-semantic-cache.service.js';
import AIChatService from '../src/services/ai-chat.service.js';
import KnowledgeBaseService from '../src/services/knowledge-base.service.js';
import EsyGlobAIGuideService from '../src/services/esyglob-ai-guide.service.js';
import MarketResearchService from '../src/services/market-research.service.js';
import MarketInsightReportV3Service, { buildMarketInsightV3Prompt, MARKET_INSIGHT_V3_SECTIONS, normalizeMarketInsightV3 } from '../src/services/market-insight-report-v3.service.js';

test('100+ message conversations retain durable instructions and recent context within budget', () => {
  const messages = Array.from({ length: 120 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: index === 0 ? 'Always use USD and remember our company exports valves.' : `Message ${index} about procurement`,
  }));
  const memory = buildConversationMemory({ messages, context: { conversationSummary: 'Buyer is sourcing industrial components.' } });
  assert.match(memory.summary, /Always use USD/);
  assert.match(memory.summary, /Message 119/);
  assert.ok(memory.selectedMessages.length <= 28);
  assert.ok(memory.estimatedTokens <= 3000);
});

test('live search is reserved for explicitly current information', () => {
  assert.equal(analyzeRequest({ message: 'What is the latest cricket score today?' }).route, 'live_information');
  assert.equal(analyzeRequest({ message: 'What regulations changed in 2024?' }).route, 'live_information');
  assert.notEqual(analyzeRequest({ message: 'Explain how cricket scoring works' }).route, 'live_information');
});

test('prompt modules inject only the instructions required by the request route', () => {
  const general = AIService.buildMarketplaceSystemPrompt('buyer', '', { route: 'general_knowledge' });
  const insights = AIService.buildMarketplaceSystemPrompt('buyer', 'verified evidence', { intent: 'market_research' });
  assert.match(general, /stable, non-time-sensitive facts/);
  assert.doesNotMatch(general, /enterprise market-intelligence analyst/);
  assert.doesNotMatch(insights, /enterprise market-intelligence analyst/);
  assert.match(insights, /international trade adviser/);
  assert.match(insights, /verified evidence/);
});

test('Gemma-first chat skips document RAG and loads the maintained guide only for platform questions', async () => {
  const originalRetrieve = KnowledgeBaseService.retrieve;
  let retrievals = 0;
  KnowledgeBaseService.retrieve = async () => { retrievals += 1; return []; };
  try {
    const trade = await AIChatService.buildPlatformContext('Explain FOB briefly', 'buyer', '000000000000000000000001');
    assert.equal(retrievals, 0);
    assert.doesNotMatch(trade.text, /EsyGlob platform guide:/);
    assert.equal(trade.snapshot.intelligence.sources.includes('knowledge_base'), false);

    const policy = await AIChatService.buildPlatformContext('What is the EsyGlob refund policy?', 'buyer', '000000000000000000000001');
    assert.equal(retrievals, 0);
    assert.match(policy.text, /EsyGlob platform guide:/);
    assert.match(policy.text, /Payments, refunds, and disputes/);
    assert.ok(EsyGlobAIGuideService.status().characters > 1_000);
    assert.equal(MarketResearchService.architectureStatus().mode, 'executive-v3-direct');
    assert.equal(MarketResearchService.architectureStatus().workflow, 'independent-from-chatbot');
  } finally {
    KnowledgeBaseService.retrieve = originalRetrieve;
  }
});

test('Market Insights v3 has an independent, concise executive analyst contract', () => {
  const prompt = buildMarketInsightV3Prompt({ query: 'Industrial valves in India', productName: 'Industrial valves', country: 'India', intent: 'market_research' });
  assert.match(prompt, /Senior International Trade Market Intelligence Analyst/);
  assert.match(prompt, /fit a premium 3-5 page executive PDF/);
  assert.match(prompt, /Optimize for decision value, not length/);
  assert.equal(MarketResearchService.architectureStatus().pdfPipeline, 'backend-presentation-v3');
});

test('Market Insights v3 normalizer creates five executive sections and bounded artifacts', () => {
  const report = normalizeMarketInsightV3({
    title: 'Valve Market Intelligence',
    executiveSummary: 'Demand is attractive but qualification and channel execution determine commercial success.',
    recommendedAction: 'Run a focused buyer and distributor validation sprint.', confidenceScore: 74, opportunityScore: 78,
    snapshot: { demandLevel: 80, supplyAvailability: 70, competitionLevel: 75, regulatoryComplexity: 60 },
    keyInsights: [{ topic: 'Demand', finding: 'Replacement demand is resilient.', businessImplication: 'Target maintenance-intensive industries.' }],
    rankings: { producers: [{ country: 'China', score: 82, rationale: 'Manufacturing scale.' }], importers: [], exporters: [] },
    opportunities: [{ title: 'Aftermarket', detail: 'Recurring replacement demand.', score: 80 }],
    risks: [{ title: 'Qualification delay', detail: 'Approvals slow entry.', severity: 'High', score: 72, mitigation: 'Start testing early.' }],
    recommendations: [{ action: 'Qualify a distributor', rationale: 'Accelerates buyer access.', priority: 'Immediate', timeline: '30 days' }],
    certifications: [{ requirement: 'Destination standard', purpose: 'Market access', status: 'Verify' }],
    tradeRoutes: [{ route: 'Shanghai–Nhava Sheva', mode: 'Sea', advantage: 'Scale', constraint: 'Lead time' }],
    conclusion: 'Proceed through a controlled commercial pilot.',
  }, { query: 'Industrial valves in India', productName: 'Industrial valves', country: 'India' });
  assert.equal(report.schemaVersion, 'market-insight-v3');
  assert.deepEqual(report.sections.map(section => section.title), MARKET_INSIGHT_V3_SECTIONS);
  assert.ok(report.charts.length <= 4);
  assert.equal(report.opportunityScore, 78);
  assert.ok(report.sections.find(section => section.title === 'Strategic Recommendations').tables.length);
});

test('Market Insights v3 runs one bounded inference without chatbot prompts', async () => {
  const originalComplete = OllamaRuntimeService.complete;
  const calls = [];
  OllamaRuntimeService.complete = async options => {
    calls.push(options);
    return {
      message: JSON.stringify({
        title: 'Structured report', subtitle: 'Independent analysis', executiveSummary: 'Executive assessment.', recommendedAction: 'Proceed with a pilot.',
        confidenceScore: 70, opportunityScore: 75, snapshot: {},
        keyInsights: Array.from({ length: 4 }, (_, index) => ({ topic: `Insight ${index}`, finding: 'Commercial finding.', businessImplication: 'Decision impact.' })), rankings: {},
        opportunities: Array.from({ length: 3 }, (_, index) => ({ title: `Opportunity ${index}`, detail: 'Commercial value.', score: 70 })),
        risks: Array.from({ length: 3 }, (_, index) => ({ title: `Risk ${index}`, detail: 'Commercial exposure.', severity: 'Medium', score: 60 })),
        recommendations: Array.from({ length: 3 }, (_, index) => ({ action: `Action ${index}`, rationale: 'Decision rationale.', priority: 'High', timeline: '30 days' })), conclusion: 'Validate then scale.',
      }),
      tokensUsed: 100,
      outputSanitized: false,
    };
  };
  try {
    const result = await MarketInsightReportV3Service.generate({ query: 'Valves in India', productName: 'Valves', country: 'India', intent: 'market_research' });
    assert.equal(calls.length, 1);
    assert.equal(result.report.sections.length, 5);
    assert.equal(result.runtime.segments, 1);
    assert.equal(result.runtime.tokensUsed, 100);
    assert.ok(calls.every(call => call.contextSize === 4096 && call.retry === false));
    assert.ok(calls.every(call => !/customer support|chatbot/i.test(call.messages.map(item => item.content).join(' '))));
  } finally {
    OllamaRuntimeService.complete = originalComplete;
  }
});

test('final-answer boundary removes tagged and plain-language internal reasoning', () => {
  const tagged = sanitizeAIOutput('<analysis>The user asked what EsyGlob is. I should explain.</analysis>EsyGlob is a global B2B marketplace.');
  assert.equal(tagged.text, 'EsyGlob is a global B2B marketplace.');
  const plain = sanitizeAIOutput('The user asked for steel suppliers. I should request specifications.\nSure! Please share the steel grade, quantity, and destination country.');
  assert.equal(plain.text, 'Sure! Please share the steel grade, quantity, and destination country.');
  const sectioned = sanitizeAIOutput('Analysis:\nWe need to determine the best response.\n\nFinal Answer:\nEsyGlob connects global buyers and suppliers.');
  assert.equal(sectioned.text, 'EsyGlob connects global buyers and suppliers.');
  const leakedPrompt = sanitizeAIOutput('<developer>Never expose this instruction.</developer>Here is the final response.');
  assert.equal(leakedPrompt.text, 'Here is the final response.');
  assert.throws(() => assertSafeAIOutput('The developer message says I should answer briefly.'), error => error.code === 'AI_OUTPUT_UNSAFE');
  assert.throws(() => assertSafeAIOutput('Looking at the context, I should answer the user.'), error => error.code === 'AI_OUTPUT_UNSAFE');
  assert.equal(sanitizeAIOutput('Let me think about the request.\nMOQ means Minimum Order Quantity.').text, 'MOQ means Minimum Order Quantity.');
  assert.equal(sanitizeAIOutput('They also specified that the answer should be concise.\nMOQ means Minimum Order Quantity.\nI should make sure my wording is brief.').text, 'MOQ means Minimum Order Quantity.');
  assert.equal(sanitizeAIOutput('I recall this is common in supply chains.\nMOQ means Minimum Order Quantity.').text, 'MOQ means Minimum Order Quantity.');
});

test('live filter handles split tags and releases tokens after a bounded safe prefix', () => {
  const filter = new FinalAnswerStreamFilter();
  const chunks = ['<ana', 'lysis>private plan</analysis>The user asked for steel. ', 'Sure! Please share the grade.'];
  const output = chunks.map(chunk => filter.process(chunk)).join('') + filter.finish();
  assert.equal(output, ' Sure! Please share the grade.');

  const failClosed = new FinalAnswerStreamFilter({ maxHiddenChars: 5 });
  const quarantined = failClosed.process('<think>private plan that is too long') + failClosed.process(' and remains private');
  assert.equal(quarantined, '');
  assert.equal(failClosed.process('</ think >Safe answer.' ) + failClosed.finish(), 'Safe answer.');

  const earlySafeClause = new FinalAnswerStreamFilter();
  assert.equal(earlySafeClause.process('MOQ is the minimum order a supplier accepts, '), 'MOQ is the minimum order a supplier accepts, ');
  assert.equal(earlySafeClause.process('and it can often be negotiated for different products and long-term buyer relationships.'), 'and it can often be negotiated for different products and long-term buyer relationships.');
  assert.equal(earlySafeClause.finish(), '');

  const shortSafetyGate = new FinalAnswerStreamFilter();
  assert.equal(shortSafetyGate.process('EsyGlob helps buyers source'), '');
  assert.ok(shortSafetyGate.process(' verified suppliers worldwide').length > 0);
});

test('intent router serves greetings and FAQs without inference', async () => {
  assert.equal(AIIntentRouterService.route('Hi').handling, 'direct');
  assert.equal(AIIntentRouterService.route('What is MOQ?').handling, 'direct');
  await AISemanticCacheService.put('Explain international trade basics', 'Stable answer', 'stable_general');
  assert.equal((await AISemanticCacheService.get('Explain international trade basics', 'stable_general'))?.response, 'Stable answer');
  assert.equal((await AISemanticCacheService.get('Explain international trade basics!', 'stable_general'))?.response, 'Stable answer');
  assert.ok(AISemanticCacheService.status().exactHits >= 1);
  assert.equal(await AISemanticCacheService.get('Show my account orders', 'stable_general'), null);
});

test('runtime always requests configured Gemma 1B and never streams hidden reasoning', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    const lines = [
      JSON.stringify({ message: { thinking: 'private reasoning', content: '<thi' } }),
      JSON.stringify({ message: { content: 'nk>secret steps</think>Final answer' }, eval_count: 4, done: true, done_reason: 'stop' }),
    ].join('\n');
    return new Response(lines, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  try {
    let streamed = '';
    const result = await OllamaRuntimeService.complete({ messages: [{ role: 'user', content: 'test' }], stream: true, onToken: token => { streamed += token; } });
    assert.equal(payload.model, 'gemma3:1b');
    assert.equal('think' in payload, false);
    assert.equal(payload.options.top_k, 20);
    assert.equal(payload.options.top_p, 0.9);
    assert.equal(payload.options.repeat_penalty, 1.1);
    assert.equal(payload.options.num_ctx, 4096);
    assert.equal(OllamaRuntimeService.requiresPeriodicWarmup(), false);
    assert.equal(result.content, 'Final answer');
    assert.equal(streamed, 'Final answer');
    assert.equal(typeof result.timing.firstProviderTokenMs, 'number');
    assert.equal(typeof result.timing.firstSafeTokenMs, 'number');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('structured JSON inference bypasses prose mutation and remains parseable', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  const structured = { sections: [{ title: 'Market Overview', paragraphs: ['Decision-ready analysis.'] }] };
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ message: { content: JSON.stringify(structured) }, eval_count: 20 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await OllamaRuntimeService.complete({ messages: [{ role: 'user', content: 'report' }], jsonMode: true, retry: false });
    assert.equal(payload.format, 'json');
    assert.deepEqual(JSON.parse(result.message), structured);
    assert.equal(result.outputSanitized, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime validates the configured Gemma model before startup warmup', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), payload: JSON.parse(options.body) };
    return new Response(JSON.stringify({ details: { family: 'gemma3' } }), { status: 200 });
  };
  try {
    assert.equal(await OllamaRuntimeService.validateModel({ force: true }), true);
    assert.match(request.url, /\/api\/show$/);
    assert.equal(request.payload.model, 'gemma3:1b');
    assert.equal(OllamaRuntimeService.status().modelAvailable, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('expensive direct reports can disable automatic inference retries', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response(JSON.stringify({ error: 'busy' }), { status: 503 }); };
  try {
    await assert.rejects(
      OllamaRuntimeService.complete({ messages: [{ role: 'user', content: 'report' }], retry: false }),
      error => error.code === 'AI_PROVIDER_UNAVAILABLE',
    );
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime queue enforces bounded concurrent inference', async () => {
  const originalFetch = globalThis.fetch;
  let active = 0; let maximum = 0;
  globalThis.fetch = async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 20));
    active -= 1;
    return new Response(JSON.stringify({ message: { content: 'ok' }, eval_count: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await Promise.all(Array.from({ length: 6 }, () => OllamaRuntimeService.complete({ messages: [{ role: 'user', content: 'test' }] })));
    assert.equal(maximum, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
