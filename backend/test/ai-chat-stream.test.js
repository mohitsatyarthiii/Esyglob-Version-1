import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import AIChatController from '../src/controllers/ai-chat.controller.js';
import AIChatRepository from '../src/repositories/ai-chat.repository.js';

function streamingResponse() {
  const chunks = [];
  return {
    chunks,
    writableEnded: false,
    destroyed: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    flushHeaders() {},
    flush() {},
    once() {},
    write(chunk) { chunks.push(String(chunk)); return true; },
    end() { this.writableEnded = true; },
  };
}

test('chat streaming emits immediate final-answer events and persists once', async () => {
  const originalFind = AIChatRepository.findForStreaming;
  const originalUpdate = AIChatRepository.updateChatAfterResponse;
  const previousPerformanceLogs = process.env.AI_PERFORMANCE_LOGS;
  const userId = new mongoose.Types.ObjectId();
  const chatId = new mongoose.Types.ObjectId();
  let persisted = 0;
  AIChatRepository.findForStreaming = async (_chatId, _userId, limit) => {
    assert.equal(limit, 6);
    return { _id: chatId, userId, messages: [], context: {} };
  };
  AIChatRepository.updateChatAfterResponse = async () => { persisted += 1; return {}; };
  process.env.AI_PERFORMANCE_LOGS = 'false';

  try {
    const req = {
      user: { _id: userId, primaryRole: 'buyer', roles: ['buyer'] },
      body: { chatId: String(chatId), message: 'Hi', role: 'buyer' },
      get(name) { return name.toLowerCase() === 'x-ai-request-id' ? 'stream-test' : undefined; },
    };
    const res = streamingResponse();
    await AIChatController.streamChat(req, res);

    const events = res.chunks
      .filter(chunk => chunk.startsWith('data: '))
      .map(chunk => JSON.parse(chunk.slice(6)));
    assert.equal(res.status, 200);
    assert.match(res.headers['Content-Type'], /text\/event-stream/);
    assert.deepEqual(events.slice(0, 2).map(event => event.type), ['start', 'typing']);
    assert.ok(events.some(event => event.type === 'token' && /Hi/.test(event.content)));
    assert.ok(events.some(event => event.type === 'generation_complete'));
    const done = events.find(event => event.type === 'done');
    assert.equal(done.chatId, String(chatId));
    assert.equal(done.timing.requestId, 'stream-test');
    assert.equal(done.timing.promptChars, 0);
    assert.equal(persisted, 1);
    assert.equal(res.writableEnded, true);
  } finally {
    AIChatRepository.findForStreaming = originalFind;
    AIChatRepository.updateChatAfterResponse = originalUpdate;
    if (previousPerformanceLogs === undefined) delete process.env.AI_PERFORMANCE_LOGS;
    else process.env.AI_PERFORMANCE_LOGS = previousPerformanceLogs;
  }
});
