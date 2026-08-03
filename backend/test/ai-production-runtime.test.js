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
import MarketInsightReportV2Service, { buildMarketInsightV2Prompt, MARKET_INSIGHT_SECTION_TITLES, normalizeMarketInsightV2 } from '../src/services/market-insight-report-v2.service.js';

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
    assert.equal(MarketResearchService.architectureStatus().mode, 'structured-v2-direct');
    assert.equal(MarketResearchService.architectureStatus().workflow, 'independent-from-chatbot');
  } finally {
    KnowledgeBaseService.retrieve = originalRetrieve;
  }
});

test('Market Insights v2 has an independent analyst contract and complete structured schema', () => {
  const prompt = buildMarketInsightV2Prompt({ query: 'Industrial valves in India', productName: 'Industrial valves', country: 'India', intent: 'market_research' });
  for (const section of MARKET_INSIGHT_SECTION_TITLES) {
    assert.match(prompt, new RegExp(section, 'i'));
  }
  assert.match(prompt, /Senior International Trade Market Intelligence Analyst/);
  assert.match(prompt, /estimated comparative indices/);
  assert.match(prompt, /Return only the final structured report/);
  assert.equal(MarketResearchService.architectureStatus().pdfPipeline, 'backend-presentation-v2');
});

test('Market Insights v2 normalizer creates all sections and backend-owned decision artifacts', () => {
  const report = normalizeMarketInsightV2({
    title: 'Valve Market Intelligence',
    sections: [{ title: 'Market Overview', paragraphs: ['A focused commercial overview.'] }],
    indices: [{ label: 'Demand', score: 78, rationale: 'Industrial replacement demand.' }],
    rankings: { producers: [{ country: 'China', score: 82, rationale: 'Manufacturing scale.' }], importers: [], exporters: [] },
    risks: [{ risk: 'Input volatility', likelihood: 'High', impact: 'Medium', score: 72, mitigation: 'Use indexed contracts.' }],
    swot: { strengths: ['Installed supplier base'], weaknesses: ['Qualification cycle'], opportunities: ['Aftermarket'], threats: ['Price pressure'] },
    requirements: { import: ['Confirm classification'], export: ['Origin documentation'], certifications: ['Destination standard'], hsCodes: [{ code: '8481', description: 'Valve family', validation: 'Confirm at tariff-line depth' }] },
  }, { query: 'Industrial valves in India', productName: 'Industrial valves', country: 'India' });
  assert.equal(report.schemaVersion, 'market-insight-v2');
  assert.deepEqual(report.sections.map(section => section.title), MARKET_INSIGHT_SECTION_TITLES);
  assert.ok(report.sections.find(section => section.title === 'Risk Assessment').tables.length);
  assert.ok(report.sections.find(section => section.title === 'SWOT Analysis').tables.length);
  assert.ok(report.sections.find(section => section.title === 'Recommended HS Codes').tables.length);
});

test('Market Insights v2 runs bounded sequential segments without chatbot prompts', async () => {
  const originalComplete = OllamaRuntimeService.complete;
  const calls = [];
  OllamaRuntimeService.complete = async options => {
    calls.push(options);
    const required = options.messages[1].content.match(/Required sections for this segment, exactly once: (.+)\n/)?.[1].split(' | ') || [];
    const sections = required.map(title => ({ title, paragraphs: [`Commercial analysis for ${title}.`], insights: ['Validate the decision inputs.'] }));
    return {
      message: JSON.stringify({
        title: 'Structured report', subtitle: 'Independent analysis', executiveSummary: 'Executive assessment.',
        sections: calls.length === 4 ? Object.fromEntries(sections.map(section => [section.title, { paragraphs: section.paragraphs, insights: section.insights }])) : sections,
      }),
      tokensUsed: 100,
      outputSanitized: false,
    };
  };
  try {
    const result = await MarketInsightReportV2Service.generate({ query: 'Valves in India', productName: 'Valves', country: 'India', intent: 'market_research' });
    assert.equal(calls.length, 8);
    assert.equal(result.report.sections.length, MARKET_INSIGHT_SECTION_TITLES.length);
    assert.equal(result.runtime.segments, 8);
    assert.equal(result.runtime.tokensUsed, 800);
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

test('live filter handles split tags and discards only unsafe completed sentences', () => {
  const filter = new FinalAnswerStreamFilter();
  const chunks = ['<ana', 'lysis>private plan</analysis>The user asked for steel. ', 'Sure! Please share the grade.'];
  const output = chunks.map(chunk => filter.process(chunk)).join('') + filter.finish();
  assert.equal(output, ' Sure! Please share the grade.');

  const failClosed = new FinalAnswerStreamFilter({ maxHiddenChars: 5 });
  const quarantined = failClosed.process('<think>private plan that is too long') + failClosed.process(' and remains private');
  assert.equal(quarantined, '');
  assert.equal(failClosed.process('</ think >Safe answer.' ) + failClosed.finish(), 'Safe answer.');

  const earlySafeClause = new FinalAnswerStreamFilter();
  assert.equal(earlySafeClause.process('MOQ is the minimum order a supplier accepts, '), '');
  assert.equal(earlySafeClause.process('and it can often be negotiated for different products and long-term buyer relationships.'), 'MOQ is the minimum order a supplier accepts,');
  assert.equal(earlySafeClause.finish(), ' and it can often be negotiated for different products and long-term buyer relationships.');
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

test('runtime always requests gemma3:4b and never streams hidden reasoning', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    const lines = [
      JSON.stringify({ message: { thinking: 'private reasoning', content: '<thi' } }),
      JSON.stringify({ message: { content: 'nk>secret steps</think>Final answer' }, eval_count: 4 }),
    ].join('\n');
    return new Response(lines, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  try {
    let streamed = '';
    const result = await OllamaRuntimeService.complete({ messages: [{ role: 'user', content: 'test' }], stream: true, onToken: token => { streamed += token; } });
    assert.equal(payload.model, 'gemma3:4b');
    assert.equal('think' in payload, false);
    assert.equal(payload.options.top_k, 40);
    assert.equal(payload.options.top_p, 0.9);
    assert.equal(payload.options.repeat_penalty, 1.1);
    assert.equal(payload.options.num_ctx, 8192);
    assert.equal(OllamaRuntimeService.requiresPeriodicWarmup(), false);
    assert.equal(result.content, 'Final answer');
    assert.equal(streamed, 'Final answer');
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
    assert.equal(request.payload.model, 'gemma3:4b');
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
