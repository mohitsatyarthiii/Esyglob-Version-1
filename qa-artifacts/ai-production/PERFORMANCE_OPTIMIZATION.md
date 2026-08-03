# AI Chatbot Production Performance Optimization

Date: 2026-08-03

## Retained optimizations

- The universal stream-safety boundary can release validated clauses instead of buffering every complete sentence. Tagged reasoning and unsafe plain-language clauses remain blocked.
- Normalized exact public-query cache hits bypass embedding generation, cosine ranking, and Redis reads. Semantic Redis matches are hydrated locally for later requests.
- Semantic-cache telemetry now separates exact and semantic hits.
- Generic chat prompts no longer repeat instructions already present in the system prompt.
- HS-code retrieval now runs only for explicit classification-related requests instead of every generic product or trade query.
- Independent authenticated seller and RFQ lookups run concurrently.
- Runtime metrics now expose queue wait, generation time, P50, P90, P95, P99, and first-visible latency.
- SSE responses expose routing, chat lookup, cache lookup, context assembly, prompt construction, inference, sanitization, validation/repair, persistence, first-visible, and total timings.
- The web client renders the first safe chunk immediately and batches subsequent chunks to animation frames. Historical message Markdown is memoized so unchanged messages are not reparsed on every streamed update.

## Benchmark outcome

The workload uses 20 representative sourcing, supplier, RFQ, logistics, compliance, inspection, payment, and trade-document questions. One hundred requests established the baseline at production concurrency two. Post-change runs completed 125 successful requests in total.

| Metric | Baseline | Stable post-change sample | Change |
| --- | ---: | ---: | ---: |
| Average total | 4,641 ms | 4,337 ms | 6.5% faster |
| P50 | 4,593 ms | 4,370 ms | 4.9% faster |
| P90 | 4,987 ms | 4,762 ms | 4.5% faster |
| P95 | 5,157 ms | 5,061 ms | 1.9% faster |
| P99 | 5,411 ms | 5,110 ms | 5.6% faster |
| First visible average | 4,286 ms | 3,362 ms | 21.6% faster |
| First visible P95 | 4,909 ms | 3,823 ms | 22.1% faster |
| Requests/minute | 25.76 | 27.11 | 5.2% higher |
| Token throughput | 19.06/s | 20.24/s | 6.2% higher |
| Backend CPU/request | 25.78 ms | 21.85 ms | 15.2% lower |

Every stable benchmark response passed the production final-answer boundary. No response budgets were reduced.

## Cache result

One thousand normalized exact public-query lookups completed in 6.466 ms total, or 0.0065 ms average, with a 100% hit rate. User-specific and private queries remain ineligible.

## Rejected optimization

Reducing the simple-query context from 4K to 2K was not retained. The production runner did not provide a stable comparable result after changing runner context, and the potential conversation-quality regression was not justified. Production remains at 4K for general chat, 6K for marketplace/trade, and 8K for market insights.

## Remaining bottlenecks

- CPU-only Gemma inference dominates request time at approximately 4.3 seconds for a 44-token representative answer.
- The universal reasoning boundary intentionally retains a short lookahead and validates text before it becomes visible. This is the main difference between raw model token arrival and safe visible output.
- Remote Ollama host CPU and RAM were not observable from the Node.js client process. Reported process figures cover the backend benchmark client only.
- Database and RAG latency depend on production dataset size and indexes. The SSE stage telemetry now makes those costs directly observable per authenticated request.
- Materially lower generation latency will ultimately require faster CPU cores, more inference capacity, a GPU, or a smaller model; those changes are outside this architecture-preserving pass.
