# AI chatbot and Market Insights optimization

Date: 2026-08-03

## Changes

- Removed all visible `Thinking...` text from active web and mobile chat experiences.
- Added a 500 ms delayed UI-only status event with contextual messages for marketplace search, general answers, and market analysis.
- Greetings bypass inference and stream a short polished welcome immediately.
- Added modular general, marketplace, trade, and market-intelligence prompts to reduce irrelevant prompt tokens and robotic instructions.
- Tuned `qwen3:4b` with an 8,192-token context, temperature 0.30, top-p 0.85, repeat penalty 1.08, streaming, and `think: false`.
- Retained the stream filter that removes both the structured Ollama thinking field and split `<think>` blocks.
- Improved hybrid RAG by de-duplicating identical chunks across documents, retaining the higher score, de-duplicating equivalent documents, and keeping only the strongest excerpts.
- Added response-cache and knowledge-cache hit/miss ratios to AI health output.
- Expanded post-cutoff routing so explicit 2024–2029 questions use current sources; stable pre-2024/general questions do not invoke live search.
- Added safe live-source citations to web and mobile response metadata/UI.
- Replaced raw provider and Market Insights errors with professional client messages.
- Renamed Market Insights progress copy so it describes work state without exposing internal reasoning.
- Market Insights continues to use the shared queued Ollama runtime and the existing enterprise PDF, chart, table, executive-summary, recommendations, and evidence-validation pipeline.

## Verification

- Backend tests: 67/67 passed.
- Vite production build: passed.
- Mobile AI chat lint: passed with no errors or warnings.
- Market Insight report/PDF tests: passed, including chart/table/branding/footer validation and storage lifecycle.
- Fixed-model, hidden-reasoning, prompt-module, post-2023 routing, 120-message memory, and bounded-concurrency tests: passed.

## Performance

The earlier baseline attempt returned HTTP 403 and produced no valid inference values. After restored VPS access, five requests measured the pre-validation streaming path:

| Metric | Result |
|---|---:|
| Cold total | 7,049 ms |
| Cold first token | 4,001 ms |
| Warm total average | 3,210 ms |
| Warm first-token average | 386 ms |
| Overall average | 3,977 ms |
| P95 total | 7,049 ms |
| Process RSS delta | 15 MB |
| Process CPU | 484 ms |
| Successful requests | 5/5 |

These values are retained as the before-strict-boundary comparison only. They no longer describe the production release boundary below.

## Strict final-answer boundary update

The final production boundary now buffers model generation internally, removes tagged/XML and plain-language meta-reasoning, validates the complete cleaned answer, and only then releases user-facing SSE chunks. Unsafe-only output is regenerated once with a stricter final-answer instruction. This prioritizes the non-disclosure requirement over speculative token latency: the post-boundary three-run benchmark measured 3,248 ms average generation-to-first-visible-chunk because no content is released before complete validation. A contextual loading state appears after 500 ms. Existing stored assistant messages are also sanitized when read.

The SSE completion event now exposes prompt construction, retrieval/database, Ollama inference, persistence, first-token, and total timing. Cache ratios are available from the AI status endpoint. This enables production traffic comparisons without logging private prompt contents.
