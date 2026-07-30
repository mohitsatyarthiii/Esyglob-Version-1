import assert from 'node:assert/strict';
import test from 'node:test';
import HuggingFaceVisionProvider, {
  VisionProviderError,
  buildAnalysisFromCaption,
  extractCaption,
} from '../src/providers/huggingface-vision.provider.js';

function response(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('extracts a Hugging Face caption into normalized marketplace search evidence', () => {
  const payload = [{ generated_text: 'A plastic bottle of orange juice on a table.', score: 0.93 }];
  const caption = extractCaption(payload);
  const analysis = buildAnalysisFromCaption(caption, payload);

  assert.equal(caption, 'A plastic bottle of orange juice on a table.');
  assert.match(analysis.productName, /plastic bottle of orange juice/i);
  assert.equal(analysis.material, 'plastic');
  assert.ok(analysis.keywords.includes('orange juice'));
  assert.ok(analysis.alternateKeywords.includes('bottle'));
  assert.equal(analysis.confidence, 0.93);
});

test('uses the configured fallback model when the primary model is unavailable', async () => {
  const urls = [];
  const provider = new HuggingFaceVisionProvider({
    apiKey: 'hf_test',
    model: 'microsoft/Florence-2-base',
    fallbackModel: 'Salesforce/blip-image-captioning-large',
    baseUrl: 'https://router.huggingface.test/models',
    maxRetries: 0,
    fetchImpl: async (url) => {
      urls.push(url);
      return urls.length === 1
        ? response(404, { error: 'Model is not available' })
        : response(200, [{ generated_text: 'A black office chair with a mesh back.' }]);
    },
  });

  const result = await provider.analyze({
    imageBuffer: Buffer.from('valid-image'),
    mimeType: 'image/jpeg',
    requestId: 'provider-fallback-test',
  });

  assert.equal(result.model, 'Salesforce/blip-image-captioning-large');
  assert.equal(result.analysis.material, '');
  assert.match(result.analysis.productName, /office chair/i);
  assert.match(urls[0], /microsoft\/Florence-2-base$/);
  assert.match(urls[1], /Salesforce\/blip-image-captioning-large$/);
});

test('retries transient Hugging Face failures before succeeding', async () => {
  let calls = 0;
  const provider = new HuggingFaceVisionProvider({
    apiKey: 'hf_test',
    model: 'caption/model',
    baseUrl: 'https://router.huggingface.test/models',
    maxRetries: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response(503, { error: 'Model is loading' }, { 'retry-after': '0' })
        : response(200, [{ generated_text: 'A pair of brown leather shoes.' }]);
    },
  });

  const result = await provider.analyze({
    imageBuffer: Buffer.from('valid-image'),
    mimeType: 'image/png',
  });

  assert.equal(calls, 2);
  assert.equal(result.analysis.material, 'leather');
  assert.match(result.analysis.productName, /shoes/i);
});

test('returns a meaningful rate-limit error after retries are exhausted', async () => {
  const provider = new HuggingFaceVisionProvider({
    apiKey: 'hf_test',
    model: 'caption/model',
    baseUrl: 'https://router.huggingface.test/models',
    maxRetries: 0,
    fetchImpl: async () => response(429, { error: 'Rate limit exceeded' }),
  });

  await assert.rejects(
    provider.analyze({ imageBuffer: Buffer.from('valid-image'), mimeType: 'image/webp' }),
    (error) => {
      assert.ok(error instanceof VisionProviderError);
      assert.equal(error.code, 'HF_RATE_LIMITED');
      assert.equal(error.statusCode, 429);
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test('rejects missing configuration and invalid images before making a request', async () => {
  const missingKey = new HuggingFaceVisionProvider({
    apiKey: '',
    model: 'caption/model',
    fetchImpl: async () => { throw new Error('must not run'); },
  });
  await assert.rejects(
    missingKey.analyze({ imageBuffer: Buffer.from('image'), mimeType: 'image/jpeg' }),
    (error) => error.code === 'HF_API_KEY_MISSING'
  );

  const invalidImage = new HuggingFaceVisionProvider({
    apiKey: 'hf_test',
    model: 'caption/model',
    fetchImpl: async () => { throw new Error('must not run'); },
  });
  await assert.rejects(
    invalidImage.analyze({ imageBuffer: Buffer.alloc(0), mimeType: 'image/jpeg' }),
    (error) => error.code === 'HF_INVALID_IMAGE' && error.statusCode === 422
  );
});
