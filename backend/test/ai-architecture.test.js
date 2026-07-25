import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeRequest,
  buildConversationMemory,
  detectLanguage,
  rewriteSearchQuery,
} from '../src/lib/ai-intelligence-pipeline.js';
import {
  chunkKnowledgeContent,
  cleanKnowledgeContent,
  contentHash,
  extractKeywords,
} from '../src/lib/knowledge-ingestion.js';

test('routes marketplace, knowledge, mixed, and private requests independently', () => {
  assert.equal(analyzeRequest({ message: 'Show steel suppliers in India' }).route, 'marketplace_data');
  assert.equal(analyzeRequest({ message: 'How do I import steel from China?' }).route, 'platform_knowledge');
  assert.equal(analyzeRequest({ message: 'Find suppliers and explain export documents' }).route, 'mixed');
  assert.equal(analyzeRequest({ message: 'What is the status of my order?' }).route, 'private_data');
});

test('detects multilingual turns and preserves the previous language for ambiguous input', () => {
  assert.equal(detectLanguage('Mujhe supplier chahiye'), 'hinglish');
  assert.equal(detectLanguage('मुझे सप्लायर चाहिए'), 'hi');
  assert.equal(detectLanguage('12345', 'hinglish'), 'hinglish');
});

test('rewrites references using conversation memory without changing the user message', () => {
  const memory = buildConversationMemory({
    messages: [{ role: 'user', content: 'I need steel pipe suppliers in India' }],
    context: {},
  });
  const message = 'Compare those by MOQ';
  const intelligence = analyzeRequest({ message });
  const rewritten = rewriteSearchQuery({ message, intelligence, memory });
  assert.equal(message, 'Compare those by MOQ');
  assert.match(rewritten, /steel pipe/i);
  assert.match(rewritten, /India/i);
});

test('cleans, chunks, fingerprints, and enriches ingested knowledge', () => {
  const content = cleanKnowledgeContent(`
    <h1>Import Guide</h1>
    <p>Choose a verified supplier. Confirm the HS code and Incoterm.</p>
    <p>Prepare customs documents and inspect goods before shipment.</p>
  `, 'html');
  const chunks = chunkKnowledgeContent(content, { maxLength: 90, overlap: 15 });
  assert.ok(chunks.length >= 2);
  assert.equal(contentHash(content).length, 64);
  assert.ok(extractKeywords(content).includes('supplier'));
});
