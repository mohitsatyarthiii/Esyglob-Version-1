import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getVisionProvider,
  isVisionProviderAvailable,
  resetVisionProviderForTests,
  setVisionProviderForTests,
} from '../src/providers/vision.provider.js';
import AIService from '../src/lib/ai-service.js';

test('vision is disabled cleanly when no provider is configured', async () => {
  resetVisionProviderForTests();

  assert.equal(isVisionProviderAvailable(), false);
  await assert.rejects(
    getVisionProvider().analyze(),
    error => error.code === 'VISION_PROVIDER_UNAVAILABLE'
      && error.statusCode === 503
      && error.message === 'Vision provider is currently unavailable'
      && error.retryable === false,
  );
});

test('the provider abstraction remains injectable without a startup dependency', async () => {
  const provider = {
    configured: true,
    analyze: async () => ({ success: true, provider: 'test' }),
  };
  setVisionProviderForTests(provider);

  assert.equal(isVisionProviderAvailable(), true);
  assert.deepEqual(await getVisionProvider().analyze(), { success: true, provider: 'test' });
  resetVisionProviderForTests();
});

test('image analysis fails clearly before downloading an image when vision is disabled', async () => {
  resetVisionProviderForTests();

  await assert.rejects(
    AIService.analyzeMarketplaceImage('https://example.invalid/product.jpg'),
    error => error.code === 'VISION_PROVIDER_UNAVAILABLE'
      && error.message === 'Vision provider is currently unavailable',
  );
});

test('uploaded image buffers reach the provider without exposing temporary storage', async () => {
  const imageBuffer = Buffer.from('validated-image-bytes');
  let received;
  setVisionProviderForTests({
    configured: true,
    async analyze(input) {
      received = input;
      return { success: true, provider: 'test' };
    },
  });

  const result = await AIService.analyzeMarketplaceImage('https://api.esyglob.in/storage/temp/private.webp', {
    imageBuffer,
    imageMimeType: 'image/webp',
    requestId: 'buffer-test',
  });

  assert.equal(result.success, true);
  assert.equal(received.imageBuffer, imageBuffer);
  assert.equal(received.mimeType, 'image/webp');
  assert.equal(received.requestId, 'buffer-test');
  resetVisionProviderForTests();
});
