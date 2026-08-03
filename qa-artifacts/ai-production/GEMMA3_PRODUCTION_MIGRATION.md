# Gemma3 Production Migration

Date: 2026-08-03

## Runtime

- The only configured inference model is `gemma3:4b`.
- Startup checks model availability through Ollama before warmup.
- A missing model degrades the AI service with `AI_MODEL_UNAVAILABLE` without crashing unrelated backend functionality.
- The model remains loaded through Ollama's indefinite keep-alive setting.
- Runtime concurrency remains bounded at two active generations with a bounded queue.

## Generation profile

- Temperature: `0.22` (`0.15` for final-answer repair)
- Top P: `0.9`
- Top K: `40`
- Repeat penalty: `1.1`
- Dynamic context: 4K for general requests, 6K for marketplace/trade requests, and 8K for research/market insights
- Dynamic response budgets remain intent-dependent and capped at 520 tokens

## Safety and compatibility

- Model-specific reasoning controls were removed.
- The universal final-answer boundary remains active for tagged and untagged internal reasoning.
- Existing direct FAQ routing, semantic caching, marketplace context, RAG, conversation memory, streaming cancellation, and web/mobile clients remain unchanged.
- Streaming can atomically replace a partial draft if final validation requires a repaired answer.

## Validation

- Production model catalog and model details endpoint validated successfully.
- Backend AI runtime suite: 9/9 passed.
- Web production build: passed.
- React Native TypeScript check: passed.
- Ten-request production runtime benchmark: 10/10 completed with zero retries, failures, or filtered outputs.

## Benchmark comparison

The same ten-request runtime benchmark was compared with the previous production baseline:

| Metric | Previous baseline | Gemma3 | Change |
| --- | ---: | ---: | ---: |
| Warm average | 2,879 ms | 1,362 ms | 52.7% faster |
| Overall average | 2,914 ms | 1,312 ms | 55.0% faster |
| P95 | 3,224 ms | 1,684 ms | 47.8% faster |
| First safe output | 1,143 ms | 1,312 ms | 14.8% slower |
| Backend process CPU | 735 ms | 218 ms | 70.3% lower |
| Backend process memory delta | 14 MB | 3 MB | 78.6% lower |
| Reported token throughput | 27.45 tokens/s | 17.46 tokens/s | 36.4% lower |
| Safety-filter events | 12 | 0 | improved |

The first-output and token-rate regressions are affected by the universal sentence safety boundary and Gemma3's much shorter 25-token answers. Total user-visible completion latency is materially lower. CPU and memory figures measure the Node.js benchmark process, not the remote Ollama host, so they are directional rather than host-capacity measurements.

See `benchmark-gemma3-2026-08-03.json` for the captured runtime metrics.
