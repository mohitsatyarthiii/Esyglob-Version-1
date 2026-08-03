import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRequest, buildConversationMemory } from '../src/lib/ai-intelligence-pipeline.js';
import OllamaRuntimeService from '../src/services/ollama-runtime.service.js';
import AIService from '../src/lib/ai-service.js';
import { assertSafeAIOutput, FinalAnswerStreamFilter, sanitizeAIOutput } from '../src/lib/ai-output-sanitizer.js';
import AIIntentRouterService from '../src/services/ai-intent-router.service.js';
import AISemanticCacheService from '../src/services/ai-semantic-cache.service.js';

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
  assert.match(general, /stable facts through 2023/);
  assert.doesNotMatch(general, /enterprise market-intelligence analyst/);
  assert.match(insights, /enterprise market-intelligence analyst/);
  assert.match(insights, /verified evidence/);
});

test('final-answer boundary removes tagged and plain-language internal reasoning', () => {
  const tagged = sanitizeAIOutput('<analysis>The user asked what EsyGlob is. I should explain.</analysis>EsyGlob is a global B2B marketplace.');
  assert.equal(tagged.text, 'EsyGlob is a global B2B marketplace.');
  const plain = sanitizeAIOutput('The user asked for steel suppliers. I should request specifications.\nSure! Please share the steel grade, quantity, and destination country.');
  assert.equal(plain.text, 'Sure! Please share the steel grade, quantity, and destination country.');
  const sectioned = sanitizeAIOutput('Analysis:\nWe need to determine the best response.\n\nFinal Answer:\nEsyGlob connects global buyers and suppliers.');
  assert.equal(sectioned.text, 'EsyGlob connects global buyers and suppliers.');
  assert.throws(() => assertSafeAIOutput('Looking at the context, I should answer the user.'), error => error.code === 'AI_OUTPUT_UNSAFE');
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
});

test('intent router serves greetings and FAQs without inference', async () => {
  assert.equal(AIIntentRouterService.route('Hi').handling, 'direct');
  assert.equal(AIIntentRouterService.route('What is MOQ?').handling, 'direct');
  await AISemanticCacheService.put('Explain international trade basics', 'Stable answer', 'stable_general');
  assert.equal((await AISemanticCacheService.get('Explain international trade basics', 'stable_general'))?.response, 'Stable answer');
  assert.equal(await AISemanticCacheService.get('Show my account orders', 'stable_general'), null);
});

test('runtime always requests qwen3:4b and never streams hidden reasoning', async () => {
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
    assert.equal(payload.model, 'qwen3:4b');
    assert.equal(payload.think, false);
    assert.equal(payload.options.repeat_penalty, 1.08);
    assert.equal(payload.options.num_ctx, 8192);
    assert.equal(result.content, 'Final answer');
    assert.equal(streamed, 'Final answer');
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
