# EsyGlob production AI implementation report

Date: 2026-08-03

## Final architecture

- The only text-generation model is `qwen3:4b` through the dedicated Ollama runtime.
- Chat, AI search answers, trade research, market-insight narratives, RFQ/quotation generation, supplier analysis, and description improvement share that runtime.
- Removed cloud text-provider routing, racing, key pools, legacy model defaults, fallback-model calls, and model-unload behavior.
- Vision remains optional and disabled by default. Its stable provider abstraction and clear `VISION_PROVIDER_UNAVAILABLE` response remain intact.
- Retrieval embeddings are deterministic local 768-dimensional vectors. They do not load another Ollama model.

## Files modified or added

- `backend/src/services/ollama-runtime.service.js`
- `backend/src/services/ai-chat.service.js`
- `backend/src/controllers/ai-chat.controller.js`
- `backend/src/lib/ai-service.js`
- `backend/src/lib/ai-intelligence-pipeline.js`
- `backend/src/services/ai-embedding.service.js`
- `backend/src/services/market-insights.service.js`
- `backend/src/repositories/ai-chat.repository.js`
- `backend/src/models/AIChat.js`
- `backend/src/models/AIUsage.js`
- `backend/src/lib/subscription-access.js`
- `backend/src/lib/trade-data.js`
- `backend/scripts/benchmark-ai-runtime.js`
- `backend/scripts/test-ai-platform-context.js`
- `backend/test/ai-production-runtime.test.js`
- `backend/package.json`
- `backend/.env`, `backend/.env.production`, and `backend/src/.env.example`
- `EsyGlob/src/screens/SubscriptionCenterScreen.tsx`
- `backend/AI_ARCHITECTURE.md` and `TECHNICAL_ARCHITECTURE.md`

## Runtime behavior

- Fixed model constant; an environment override cannot accidentally select another model.
- Bounded FIFO queue: 2 active requests and 64 pending by default, configurable without changing the model.
- `keep_alive=24h`, startup warming, and periodic warming retain the loaded model.
- Streaming SSE forwards tokens immediately, supports client disconnect cancellation, and never forwards Ollama's `thinking` field or `<think>` blocks.
- One bounded retry is allowed for non-streamed transient failures, timeouts, or an unsafe final-answer validation failure.
- Health output includes queue depth, counters, average latency, p95 latency, and p95 first-token latency.
- Provider errors become stable `AI_PROVIDER_UNAVAILABLE`, `AI_QUEUE_FULL`, or `AI_REQUEST_CANCELLED` errors.

## Conversation memory

- Persisted histories are capped at 160 messages (minimum configurable cap is 100).
- Prompt memory keeps the recent 20 messages plus up to eight older user instructions/preferences.
- Previous rolling summaries, detected entities, currency, verified-supplier preference, low-MOQ preference, language, and current page context are retained within a character/token budget.
- Regression coverage uses a 120-message conversation and verifies both the first durable instruction and latest turn survive.

## Retrieval and knowledge priority

1. Authenticated marketplace/user data
2. Uploaded knowledge documents and chunks
3. Conversation summary, preferences, and recent turns
4. Native `qwen3:4b` knowledge
5. Tavily live search only for explicitly current/latest queries

Marketplace and knowledge retrieval run concurrently where both are required. Knowledge and live-web summaries retain their existing bounded TTL caches; generated reusable answers use a bounded SHA-256 response cache.

## Model-reference audit

Legacy text-model references were removed from source, tests, environment model configuration, mobile subscription labels, and architecture documents. Runtime and persisted defaults now identify `qwen3:4b`. Market insight source labels no longer claim a removed cloud provider.

## Validation results

- Backend: 67/67 tests pass.
- Added tests: fixed model payload, no hidden-reasoning stream exposure, bounded queue concurrency, live-search routing, and 100+ message memory.
- Node syntax checks pass for the runtime, chat controller/service, AI facade, and market insights.
- Mobile subscription screen: 0 lint errors; 3 existing inline-style warnings.
- `git diff --check`: no whitespace errors.

## Benchmark status

The benchmark runner records cold response time, warm average, overall average, p95, first-token average, token counts, process RSS delta, process CPU, and runtime queue metrics.

The first 2026-08-03 baseline attempt was rejected by the AI proxy with HTTP 403. A later pre-boundary run measured 386 ms warm first-token latency, but that path did not fully validate the complete answer before release. The production strict-boundary benchmark completed three 80-token requests with 3,589 ms cold total, 3,078 ms warm total average, 3,248 ms overall average, and 3,248 ms average generation-to-first-visible-chunk. Client-process RSS increased by 12 MB and CPU usage was 484 ms.

## Remaining operational limitation

The strict boundary intentionally releases no model text until the complete response has passed final-answer sanitation. A contextual loading state appears after 500 ms. Total latency remains bounded by generation speed and requested output length. End-to-end authenticated database timing should be monitored from the SSE timing payload because the standalone benchmark isolates Ollama inference.
