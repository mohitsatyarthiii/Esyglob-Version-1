import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRequest, buildConversationMemory } from '../src/lib/ai-intelligence-pipeline.js';
import OllamaRuntimeService from '../src/services/ollama-runtime.service.js';
import AIService from '../src/lib/ai-service.js';

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
