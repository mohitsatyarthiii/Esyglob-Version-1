import { normalizeVisionAnalysis } from '../lib/image-search.js';
import { logImageSearch } from '../lib/image-search-logger.js';

const CAPTION_PREFIX = /^(?:a|an|the)?\s*(?:photo|image|picture|photograph)\s+of\s+/i;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'showing', 'shown',
  'product', 'item', 'object', 'photo', 'image', 'picture',
]);
const MATERIAL_TERMS = [
  'stainless steel', 'aluminum', 'aluminium', 'cardboard', 'ceramic', 'cotton',
  'fabric', 'glass', 'leather', 'metal', 'paper', 'plastic', 'rubber', 'steel', 'wood',
];

export class VisionProviderError extends Error {
  constructor(message, {
    code = 'VISION_PROVIDER_FAILED',
    statusCode = 502,
    providerStatus,
    retryable = false,
    model,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'VisionProviderError';
    this.code = code;
    this.statusCode = statusCode;
    this.providerStatus = providerStatus;
    this.retryable = retryable;
    this.model = model;
    this.stage = 'ai_analysis';
  }
}

function clean(value, maxLength = 240) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function unique(values, limit = 20) {
  return [...new Set(values.map((value) => clean(value, 100).toLowerCase()).filter(Boolean))].slice(0, limit);
}

function uniqueOriginal(values, limit = 20) {
  const seen = new Set();
  return values.map((value) => clean(value, 200)).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function extractCaption(payload) {
  const candidates = Array.isArray(payload) ? payload : [payload];
  for (const candidate of candidates.filter(Boolean)) {
    const caption = clean(
      candidate.generated_text
      || candidate.caption
      || candidate.text
      || candidate.answer
      || candidate?.[0]?.generated_text
    );
    if (caption) return caption;
  }
  return '';
}

function extractLabels(payload) {
  const candidates = Array.isArray(payload) ? payload : [payload];
  return unique(candidates
    .flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate])
    .map((candidate) => candidate?.label)
    .filter(Boolean), 10);
}

function extractConfidence(payload) {
  const candidates = Array.isArray(payload) ? payload.flat() : [payload];
  const scores = candidates.map((candidate) => Number(candidate?.score)).filter(Number.isFinite);
  return scores.length ? Math.min(1, Math.max(0, Math.max(...scores))) : 0.72;
}

export function buildAnalysisFromCaption(caption, payload = null) {
  const normalizedCaption = clean(caption)
    .replace(/^<[^>]+>\s*/g, '')
    .replace(CAPTION_PREFIX, '')
    .replace(/[.!?]+$/, '')
    .trim();
  if (!normalizedCaption) {
    throw new VisionProviderError('Hugging Face returned an empty image caption', {
      code: 'HF_EMPTY_CAPTION',
      statusCode: 502,
      retryable: true,
    });
  }

  const labels = extractLabels(payload);
  const words = normalizedCaption
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  const bigrams = words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
  const trigrams = words.slice(0, -2).map((word, index) => `${word} ${words[index + 1]} ${words[index + 2]}`);
  const keywords = unique([normalizedCaption, ...labels, ...trigrams, ...bigrams], 12);
  const alternateKeywords = unique([...bigrams, ...words, ...labels], 12);
  const productName = clean(labels[0] || normalizedCaption, 100);
  const captionLower = normalizedCaption.toLowerCase();
  const material = MATERIAL_TERMS.find((term) => new RegExp(`\\b${term}\\b`, 'i').test(captionLower)) || '';

  return {
    ...normalizeVisionAnalysis({
      productName,
      productType: clean(labels[0] || normalizedCaption, 100),
      object: clean(labels[0] || normalizedCaption, 100),
      category: '',
      subcategory: '',
      industry: '',
      material,
      keywords,
      alternateKeywords,
      confidence: extractConfidence(payload),
      caption: normalizedCaption,
      labels,
    }),
    productType: clean(labels[0] || normalizedCaption, 100),
    object: clean(labels[0] || normalizedCaption, 100),
    caption: normalizedCaption,
    labels,
  };
}

function modelUrl(baseUrl, model) {
  const encodedModel = model.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encodedModel}`;
}

function modelMetadataUrl(baseUrl, model) {
  const encodedModel = model.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/api/models/${encodedModel}?expand[]=pipeline_tag&expand[]=inferenceProviderMapping`;
}

function retryAfterMs(response, attempt) {
  const seconds = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(2_000, seconds * 1_000);
  return Math.min(2_000, 300 * (2 ** attempt));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class HuggingFaceVisionProvider {
  constructor({
    apiKey = process.env.HF_API_KEY,
    model = process.env.HF_IMAGE_MODEL,
    fallbackModel = process.env.HF_IMAGE_FALLBACK_MODEL,
    baseUrl = process.env.HF_BASE_URL || 'https://router.huggingface.co/hf-inference/models',
    hubBaseUrl = process.env.HF_HUB_BASE_URL || 'https://huggingface.co',
    timeoutMs = Number(process.env.HF_TIMEOUT || 30_000),
    maxRetries = Number(process.env.HF_MAX_RETRIES || 2),
    fetchImpl = fetch,
  } = {}) {
    this.apiKey = clean(apiKey, 500);
    this.models = uniqueOriginal([model, fallbackModel], 2);
    this.baseUrl = clean(baseUrl, 500).replace(/\/+$/, '');
    this.hubBaseUrl = clean(hubBaseUrl, 500).replace(/\/+$/, '');
    this.timeoutMs = Math.max(5_000, Math.min(120_000, Number(timeoutMs) || 30_000));
    this.maxRetries = Math.max(0, Math.min(3, Number(maxRetries) || 0));
    this.fetch = fetchImpl;
    this.name = 'huggingface';
  }

  validateConfiguration() {
    if (!this.apiKey) {
      throw new VisionProviderError('Hugging Face image inference is not configured', {
        code: 'HF_API_KEY_MISSING',
        statusCode: 503,
      });
    }
    if (!this.models.length) {
      throw new VisionProviderError('HF_IMAGE_MODEL is not configured', {
        code: 'HF_IMAGE_MODEL_MISSING',
        statusCode: 503,
      });
    }
    let parsed;
    try {
      parsed = new URL(this.baseUrl);
    } catch {
      throw new VisionProviderError('HF_BASE_URL is invalid', {
        code: 'HF_BASE_URL_INVALID',
        statusCode: 500,
      });
    }
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new VisionProviderError('HF_BASE_URL must use HTTPS', {
        code: 'HF_BASE_URL_INSECURE',
        statusCode: 500,
      });
    }
    try {
      parsed = new URL(this.hubBaseUrl);
    } catch {
      throw new VisionProviderError('HF_HUB_BASE_URL is invalid', {
        code: 'HF_HUB_BASE_URL_INVALID',
        statusCode: 500,
      });
    }
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new VisionProviderError('HF_HUB_BASE_URL must use HTTPS', {
        code: 'HF_HUB_BASE_URL_INSECURE',
        statusCode: 500,
      });
    }
  }

  async validateSupport({ signal } = {}) {
    this.validateConfiguration();
    const validated = [];

    for (const model of this.models) {
      let response;
      try {
        response = await this.fetch(modelMetadataUrl(this.hubBaseUrl, model), {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
          },
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
            : AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const isTimeout = ['TimeoutError', 'AbortError'].includes(error.name);
        throw new VisionProviderError(
          isTimeout
            ? `Timed out while validating Hugging Face model "${model}"`
            : `Unable to validate Hugging Face model "${model}"`,
          {
            code: isTimeout ? 'HF_MODEL_VALIDATION_TIMEOUT' : 'HF_MODEL_VALIDATION_FAILED',
            statusCode: 503,
            retryable: true,
            model,
            cause: error,
          }
        );
      }

      const metadata = await response.json().catch(() => null);
      if (!response.ok) {
        throw new VisionProviderError(
          response.status === 404
            ? `Configured Hugging Face model "${model}" does not exist`
            : `Hugging Face model validation failed for "${model}" with HTTP ${response.status}`,
          {
            code: response.status === 404 ? 'HF_MODEL_NOT_FOUND' : 'HF_MODEL_VALIDATION_FAILED',
            statusCode: 500,
            providerStatus: response.status,
            model,
          }
        );
      }

      const pipelineTag = clean(metadata?.pipeline_tag, 100).toLowerCase();
      const mapping = metadata?.inferenceProviderMapping?.['hf-inference'];
      const task = clean(mapping?.task, 100).toLowerCase();
      const isCaptionTask = pipelineTag === 'image-to-text';
      const isLive = mapping?.status === 'live';
      const taskMatches = !task || task === 'image-to-text';

      if (!isCaptionTask || !isLive || !taskMatches) {
        throw new VisionProviderError(
          `Configured model "${model}" is not a live image-to-text model on provider hf-inference`,
          {
            code: 'HF_MODEL_UNSUPPORTED_BY_PROVIDER',
            statusCode: 500,
            model,
          }
        );
      }

      validated.push({ model, pipelineTag, provider: 'hf-inference', status: mapping.status });
    }

    logImageSearch('info', 'vision_provider_configuration_validated', {
      provider: this.name,
      models: validated,
    });
    return validated;
  }

  validateImage(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
      throw new VisionProviderError('A non-empty image buffer is required', {
        code: 'HF_INVALID_IMAGE',
        statusCode: 422,
      });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new VisionProviderError(`Unsupported image type: ${mimeType || 'unknown'}`, {
        code: 'HF_UNSUPPORTED_IMAGE',
        statusCode: 415,
      });
    }
  }

  async analyze({ imageBuffer, mimeType, requestId = '', signal } = {}) {
    this.validateConfiguration();
    this.validateImage(imageBuffer, mimeType);
    const attempts = [];

    for (const model of this.models) {
      try {
        const result = await this.requestModel({ imageBuffer, mimeType, requestId, signal, model, attempts });
        return { ...result, attempts };
      } catch (error) {
        attempts.push({
          model,
          statusCode: error.providerStatus,
          code: error.code,
          error: error.message,
        });
        const modelUnavailable = [400, 404, 422, 503].includes(Number(error.providerStatus))
          || error.code === 'HF_TIMEOUT';
        if (!modelUnavailable || model === this.models.at(-1)) {
          error.attempts = attempts;
          throw error;
        }
      }
    }

    throw new VisionProviderError('No Hugging Face image model is available', {
      code: 'HF_MODELS_UNAVAILABLE',
      statusCode: 503,
      retryable: true,
    });
  }

  async requestModel({ imageBuffer, mimeType, requestId, signal, model, attempts }) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const startedAt = Date.now();
      let response;
      try {
        response = await this.fetch(modelUrl(this.baseUrl, model), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': mimeType,
            Accept: 'application/json',
            'X-Wait-For-Model': 'true',
          },
          body: imageBuffer,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
            : AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        const isTimeout = ['TimeoutError', 'AbortError'].includes(error.name);
        if (attempt < this.maxRetries && (isTimeout || error instanceof TypeError)) {
          attempts.push({ model, attempt: attempt + 1, code: isTimeout ? 'HF_TIMEOUT' : 'HF_NETWORK_ERROR' });
          await wait(300 * (2 ** attempt));
          continue;
        }
        throw new VisionProviderError(
          isTimeout ? 'Hugging Face image analysis timed out' : 'Unable to reach Hugging Face image inference',
          {
            code: isTimeout ? 'HF_TIMEOUT' : 'HF_NETWORK_ERROR',
            statusCode: isTimeout ? 504 : 502,
            retryable: true,
            model,
            cause: error,
          }
        );
      }

      const durationMs = Date.now() - startedAt;
      const payload = await response.json().catch(() => null);
      if (response.ok) {
        const caption = extractCaption(payload);
        const analysis = buildAnalysisFromCaption(caption, payload);
        logImageSearch('info', 'vision_provider_response', {
          requestId,
          provider: this.name,
          model,
          statusCode: response.status,
          durationMs,
          caption,
          keywords: analysis.keywords,
        });
        return {
          success: true,
          provider: this.name,
          model,
          analysis,
          caption,
          durationMs,
          tokensUsed: 0,
        };
      }

      const providerMessage = clean(payload?.error || payload?.message || `HTTP ${response.status}`, 400);
      const retryable = response.status === 429 || response.status >= 500;
      logImageSearch(retryable ? 'warn' : 'error', 'vision_provider_error', {
        requestId,
        provider: this.name,
        model,
        statusCode: response.status,
        durationMs,
        attempt: attempt + 1,
        errorMessage: providerMessage,
      });
      if (retryable && attempt < this.maxRetries) {
        attempts.push({ model, attempt: attempt + 1, statusCode: response.status, error: providerMessage });
        await wait(retryAfterMs(response, attempt));
        continue;
      }

      const statusCode = response.status === 429 ? 429 : response.status >= 500 ? 503 : 422;
      throw new VisionProviderError(`Hugging Face image analysis failed: ${providerMessage}`, {
        code: response.status === 429 ? 'HF_RATE_LIMITED' : response.status >= 500 ? 'HF_SERVICE_UNAVAILABLE' : 'HF_MODEL_REJECTED_IMAGE',
        statusCode,
        providerStatus: response.status,
        retryable,
        model,
      });
    }

    throw new VisionProviderError('Hugging Face image analysis failed after retries', {
      code: 'HF_RETRIES_EXHAUSTED',
      statusCode: 503,
      retryable: true,
      model,
    });
  }
}
