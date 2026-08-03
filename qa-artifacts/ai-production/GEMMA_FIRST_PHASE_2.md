# Gemma-First AI Architecture — Phase 2

Date: 2026-08-03

## Production defaults

- `AI_RAG_ENABLED=false`
- `MARKET_INSIGHTS_RAG_ENABLED=false`
- The AI knowledge database is neither required nor initialized while RAG is disabled.
- Ordinary conversations and stable trade questions route directly to Gemma3.
- Current marketplace and authenticated account questions use the marketplace MongoDB before Gemma3.
- EsyGlob-facing policy, membership, identity, support, and workflow questions receive selected sections from `knowledge/esyglob-ai-guide.md`.
- Document ingestion, embeddings, vector search, lexical retrieval, ranking, and the knowledge database remain intact and can be restored through configuration.

## Market Insights

The default report path now asks Gemma3 for a qualitative structured report containing Executive Summary, Market Overview, Demand Trends, Supply Trends, Major Producing Countries, Major Importing Countries, Major Exporting Countries, Business Opportunities, Potential Risks, Recommendations, and Conclusion.

The direct prompt prohibits claims of live evidence or invented precise figures. The existing HTML, PDF layout, storage, persistence, preview, download, and regeneration pipeline is unchanged. Enabling both RAG flags restores the previous evidence-retrieval branch.

The direct report uses the stable 4K runtime context and a 900-token budget for ten concise sections. Larger 1,800-token/8K and 900-token/8K probes exceeded the controlled CPU response window; a 750-token/4K probe completed in 36 seconds but truncated the JSON and was not retained.
Direct reports use one bounded generation attempt; a long timeout cannot automatically enqueue a second expensive report generation on the CPU runner.

The retained compact report contract completed a live, non-persistent production Gemma probe in 34.548 seconds using 722 tokens. It returned valid JSON, all ten required sections, and zero sanitizer changes without RAG, MongoDB, or PDF writes.

## Pipeline benchmark

A representative 100-query routing workload covered general trade, EsyGlob policies and help, products, suppliers, authenticated records, and time-sensitive questions.

| Metric | RAG branch enabled, disconnected comparison | Gemma-first default |
| --- | ---: | ---: |
| Document retrieval invocations | 40 | 0 |
| Average routing/context latency | 0.159 ms | 0.151 ms |
| P95 routing/context latency | 0.387 ms | 0.372 ms |
| Average selected prompt size | 2,622 characters | 2,611 characters |

The comparison intentionally uses a disconnected knowledge database, so it measures only application overhead. In production with a connected knowledge cluster, Gemma-first also removes database, embedding, vector/lexical search, ranking, serialization, and network latency for those 40 requests.

The initial guide selection averaged 4,863 prompt characters. Intent-specific section selection reduced that to 2,611 characters, a 46.3% reduction, without removing the maintained source document.

Gemma inference remains the dominant latency measured in Phase 1. This phase removes avoidable pre-inference work; it does not reduce answer budgets or change model generation quality.

## Validation

- Backend suite: 75/75 tests passed.
- AI runtime and Gemma-first architecture tests: passed.
- Multi-page Market Insights PDF rendering and report storage tests: passed.
- Direct Gemma Market Insights structure probe: passed (10/10 sections, valid JSON).
- Web production build: passed.
- React Native TypeScript validation: passed.
- The 100-query default pipeline benchmark made zero document-retrieval calls.
