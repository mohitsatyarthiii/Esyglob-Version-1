# EsyGlob enterprise AI architecture

## Database boundary

- `MONGODB_URI` is the marketplace database. It remains the source of truth for users, products, suppliers, RFQs, quotations, orders, chats, wallets, reviews, and all transactional state.
- `AI_KNOWLEDGE_MONGODB_URI` is the optional independent RAG knowledge connection. It is required only when `AI_RAG_ENABLED=true`. `AI_KNOWLEDGE_DB_NAME` selects its database.
- AI conversations remain in the marketplace database because they are user-owned operational data. Knowledge documents and chunks are registered only on the AI knowledge connection.

Gemma-first mode is the default. It opens only the marketplace connection. When RAG is enabled, both connections start independently and are reported separately by `/api/health`.

## Request pipeline

AI chat requests follow this path:

1. Load the authenticated conversation.
2. Detect language and intent, using the remembered language as fallback.
3. rebuild compact conversation memory and remembered entities.
4. Route ordinary questions directly to Gemma.
5. Load the compact `knowledge/esyglob-ai-guide.md` only for EsyGlob platform and policy questions.
6. Query marketplace MongoDB only for current products, suppliers, manufacturers, categories, or authenticated private records.
7. When `AI_RAG_ENABLED=true`, optionally rewrite and retrieve document knowledge for configured routes.
8. Build the system prompt from only the context required by the selected route.
9. Generate, validate, optionally repair, polish, and stream the response.
10. Persist the response and updated memory in one marketplace-database write.

The rewritten query is stored as diagnostic conversation context but is never returned as user-facing copy.

## Market Insights v2

Market Insights is a separate product pipeline, not a chatbot mode. `MarketInsightReportV2Service` calls the shared Ollama runtime directly with an independent Senior International Trade Market Intelligence Analyst contract. It returns a versioned `market-insight-v2` JSON document rather than presentation text.

The backend normalizer guarantees the executive report structure and converts structured indices, rankings, forecasts, pricing, competitors, opportunities, risks, SWOT, PESTLE, ports, routes, requirements, HS candidates, strategies, and action plans into presentation artifacts. The HTML/PDF layer owns typography, tables, bar/pie/line/area charts, risk heatmaps, framework cards, contents, page numbers, branding, and decision-use notices.

The default report path is direct structured analysis. Evidence collection remains optional behind `AI_RAG_ENABLED=true` and `MARKET_INSIGHTS_RAG_ENABLED=true`; enabling it enriches the same v2 schema instead of changing the document architecture. This boundary also supports future trade, pricing, shipping, government, and HS-code providers.

On the 4-vCPU deployment, report synthesis uses eight compact sequential segments of five chapters each with a 4K context window. This avoids CPU contention and oversized JSON timeouts; each segment is validated immediately and the backend deterministically merges them into one report before rendering or persistence.

## Knowledge ingestion

Admins can submit `multipart/form-data` to:

`POST /api/admin/knowledge-base/ingest`

Fields:

- `file`: PDF, DOCX, Markdown, HTML, or TXT (optional when `content` is supplied)
- `title`: required
- `content`: raw text alternative to `file`
- `slug`, `summary`, `status`, `version`, `sourceUri`: optional
- `keywords`, `intentTags`, `targetRoles`, `supportedLanguages`: JSON arrays or comma-separated values

The service extracts and cleans text, computes a SHA-256 duplicate key, creates logical overlapping chunks, derives keywords, requests embeddings, and stores the document and chunks in the AI knowledge database. If the embedding provider is unavailable, ingestion still succeeds and retrieval uses lexical ranking.

## Vector search

Set `AI_KNOWLEDGE_VECTOR_INDEX` to the MongoDB Atlas Vector Search index name. The index must target:

- collection: `knowledge_chunks`
- path: `embedding`
- similarity: cosine
- dimensions: the output dimensions of `AI_EMBEDDING_MODEL`

If the index is absent or unavailable, vector retrieval automatically falls back to text/regex retrieval without interrupting chat.

## Existing knowledge migration

Preview:

```bash
npm run knowledge:migrate
```

Copy and ingest:

```bash
npm run knowledge:migrate -- --apply
```

The migration is non-destructive: it does not remove legacy documents from the marketplace database. Remove them only after validating the new knowledge database and taking a backup.

## Production environment

```dotenv
MONGODB_URI=mongodb+srv://.../esyglob
AI_RAG_ENABLED=false
MARKET_INSIGHTS_RAG_ENABLED=false
AI_KNOWLEDGE_MONGODB_URI=mongodb+srv://.../esyglob-ai
AI_KNOWLEDGE_DB_NAME=esyglob_ai_knowledge
AI_KNOWLEDGE_VECTOR_INDEX=knowledge_chunk_embedding
AI_EMBEDDINGS_ENABLED=true
AI_SEMANTIC_CACHE_ENABLED=true
AI_SEMANTIC_CACHE_THRESHOLD=0.92
AI_SEMANTIC_CACHE_MAX=200
REDIS_URL=redis://user:password@redis-host:6379
OLLAMA_KEEP_ALIVE=-1
OLLAMA_WARM_INTERVAL_MS=270000
```

`REDIS_URL` is optional; when omitted, semantic caching remains process-local. Only public, context-free questions are eligible for semantic caching, so account and marketplace records never enter the shared cache. Ollama runs only `gemma3:4b`. To restore document RAG, set `AI_RAG_ENABLED=true`; set `MARKET_INSIGHTS_RAG_ENABLED=true` as well to restore evidence retrieval for reports. Do not reuse credentials between clusters.
