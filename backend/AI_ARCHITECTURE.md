# EsyGlob enterprise AI architecture

## Database boundary

- `MONGODB_URI` is the marketplace database. It remains the source of truth for users, products, suppliers, RFQs, quotations, orders, chats, wallets, reviews, and all transactional state.
- `AI_KNOWLEDGE_MONGODB_URI` is the independent AI knowledge connection. In production it is required and should point to a separate MongoDB cluster. `AI_KNOWLEDGE_DB_NAME` selects its database.
- AI conversations remain in the marketplace database because they are user-owned operational data. Knowledge documents and chunks are registered only on the AI knowledge connection.

Both connections start independently and are reported separately by `/api/health`.

## Request pipeline

AI chat requests follow this path:

1. Load the authenticated conversation.
2. Detect language and intent, using the remembered language as fallback.
3. rebuild compact conversation memory and remembered entities.
4. Rewrite the current query internally.
5. Route to marketplace retrieval, knowledge retrieval, live retrieval, or a mixed route.
6. Run independent marketplace and knowledge retrieval in parallel.
7. Rank and bound retrieved context.
8. Build the system prompt from role, memory, recent messages, marketplace data, knowledge excerpts, and the current question.
9. Generate, validate, optionally repair, polish, and stream the response.
10. Persist the response and updated memory in one marketplace-database write.

The rewritten query is stored as diagnostic conversation context but is never returned as user-facing copy.

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
AI_KNOWLEDGE_MONGODB_URI=mongodb+srv://.../esyglob-ai
AI_KNOWLEDGE_DB_NAME=esyglob_ai_knowledge
AI_KNOWLEDGE_VECTOR_INDEX=knowledge_chunk_embedding
AI_EMBEDDING_MODEL=nomic-embed-text
AI_EMBEDDINGS_ENABLED=true
```

Do not reuse credentials between clusters. Apply least-privilege users separately: the application marketplace user needs no access to the knowledge cluster, and the knowledge user needs no access to marketplace collections.
