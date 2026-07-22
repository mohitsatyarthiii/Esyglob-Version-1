# EsyGlob Technical Architecture

> Single source of truth for the repository inspected on 2026-07-21. This document describes implemented behavior, not intended features.
> Production metadata was read through `backend/.env.production`; secrets and document values were not recorded. The selected live database is named `test`.

## 1. Project Overview

- EsyGlob is a mobile-first global B2B marketplace connecting buyers with manufacturers, exporters, wholesalers, distributors, and traders.
- Its business objective is to support the sourcing lifecycle: discovery -> inquiry/RFQ -> quotation -> chat/negotiation -> order -> payment -> logistics -> review.
- Adjacent paid trade services include verification, shipping, escrow, trade assurance, inspections, financing, customs, warehousing, documents, consulting, and market intelligence.
- Roles are `buyer`, `seller`, and `admin`; a user can hold multiple roles and has one `primaryRole`.
- A company is not an independent entity: company/business data is primarily embedded in `Seller`, with snapshots copied into orders and invoices.
- A service booking is represented by `ServiceRequest`; there is no separate `Booking` model.

```text
React Native app
  | HTTPS JSON + manually persisted session cookie
  | Socket.IO
  v
Express API (primary deployed API, /api, PM2 cluster)
  | controllers -> services -> repositories/models
  v
MongoDB Atlas-compatible database + Cloudinary + Razorpay + AI providers

Parallel code path: NestJS mobile API (/api, port 3001) -> same MongoDB collections
```

## 2. Technology Stack

### Frontend

- React 19.2 and React Native 0.86, TypeScript, Android and iOS native projects.
- React Navigation supplies native stacks and five bottom tabs: Home, Categories, Services, Messenger, and My EsyGlob.
- TanStack React Query handles server state; persistence and session state use `react-native-mmkv`.
- FlashList renders large lists; image/document picker, geolocation, Razorpay, vector icons, audio, and network-status packages support device features.
- A local API client performs JSON normalization, 20-second GET caching, request deduplication, and mutation-driven cache clearing.

### Backend

- Primary API: Node.js ES modules, Express 5, Mongoose 9, Zod, Multer, Socket.IO, PDFKit, XLSX, Axios, and Node crypto.
- Secondary API: NestJS 11, TypeScript, Mongoose 8, Zod, JWT, RxJS; it overlaps auth and marketplace endpoints.
- The Express code follows route -> controller -> service -> repository/model, although some modules access models directly.
- Passwords use PBKDF2-SHA512 with 120,000 iterations; Nest also accepts legacy bcrypt hashes.

### Infrastructure and integrations

- Database: MongoDB with references, embedded snapshots/history, text indexes, compound indexes, TTL indexes, and a `2dsphere` location index.
- Authentication: signed JWT stored as an HTTP-only cookie by Express; the native client extracts/persists the cookie and supplies its token to Socket.IO.
- Nest authentication independently issues 15-minute bearer JWTs and does not implement refresh tokens.
- Storage: Cloudinary signed uploads for images/documents; the secondary API also exposes local upload paths.
- Payments: Razorpay orders and HMAC signature verification for orders, subscriptions, and service bookings.
- AI: local Ollama first for chat, with Gemini and DeepSeek paths/fallbacks; Tavily powers optional live research.
- Caching: process-local Maps/objects and NodeCache, HTTP cache headers, and client memory caching; Redis is not used.
- Deployment: PM2 cluster mode, two Express workers, port 5000, 1 GB restart threshold; no Docker/Kubernetes/IaC was found.
- Public mobile configuration points to `https://api.esyglob.in/api` and `https://api.esyglob.in` for sockets.
- No implemented SMTP/email, SMS, WhatsApp, or FCM/APNs delivery provider was found.

## 3. Repository and Folder Structure

```text
esyglob-app/
|-- EsyGlob/                 React Native application
|   |-- src/api/             API client, endpoint wrappers, types, normalizers
|   |-- src/auth/            Auth context and session lifecycle
|   |-- src/components/      Reusable cards, inputs, feedback, images
|   |-- src/screens/         Marketplace, account, seller, trade, service screens
|   |-- src/realtime/        Socket.IO singleton and React provider
|   |-- src/features/        Trade calculator feature modules
|   |-- src/storage/         MMKV abstraction
|   `-- android/, ios/       Native build projects
|-- backend/                 Primary Express API
|   |-- src/routes/          URL and middleware composition
|   |-- src/controllers/     HTTP parsing and response shaping
|   |-- src/services/        Business workflows and orchestration
|   |-- src/repositories/    Query construction and persistence
|   |-- src/models/          Mongoose schemas and indexes
|   |-- src/validators/      Zod request contracts
|   |-- src/middlewares/     Auth, upload, validation, rate limit, errors
|   |-- src/lib/             Cache, security, AI, lifecycle, integrations
|   |-- src/config/          Environment and MongoDB connection
|   `-- scripts/             Seeds, backfills, diagnostics, index utilities
|-- mobile-backend/          Parallel NestJS API
|   `-- src/{auth,ai,marketplace,sellers,users}/
`-- *.md, screenshots        Operational notes and visual evidence
```

- The Express API is the broader implementation and matches the production URL used by the app.
- The Nest API duplicates core schemas and endpoints; both can mutate the same collections, so schema drift is a material risk.
- Existing backups/scripts and current uncommitted changes are operational artifacts, not application modules.

## 4. MongoDB Production Database

### Inspection scope

- Read-only inspection used the production configuration and observed 58 collections in database `test`.
- Counts below are approximate `estimatedDocumentCount` values at inspection time and will change.
- Collection shape was sampled without retaining credentials, tokens, passwords, or business record values.

### Observed collections and counts

| Domain | Collections (count) |
|---|---|
| Identity | `users` 107, `addresses` 10, `userlocations` 5, `mobile_sessions` 0 |
| Sellers | `sellers` 60, `sellerverifications` 63, `verificationaudits` 244, `factoryprofiles` 17, `certifications` 0 |
| Catalog | `categories` 35, `subcategories` 183, `products` 45, `productcategorymappings` 45, `productdrafts` 0, `bulkproductimports` 0, `hscodes` 238 |
| Procurement | `rfqs` 47, `quotations` 15, `orders` 21, `reviews` 10, `recentlyvieweds` 199, `saveditems` 18 |
| Messaging | `chats` 54, `messages` 152, `notifications` 285 |
| AI/research | `aichats` 229, `ai_chats` 4, `aiusages` 121, `knowledgedocuments` 71, `savedresearchreports` 55, `saved_research_reports` 1 |
| Billing | `payments` 22, `paymentmethods` 3, `wallets` 15, `wallettransactions` 0, `withdrawalrequests` 0 |
| Plans | `subscriptions` 19, `subscriptionplans` 8 |
| Fulfilment | `shipments` 2, `shippingorders` 0, `invoices` 0, `taxcalculations` 0 |
| Services | `servicerequests` 0, `supporttickets` 2, `documents` 0, `qualityinspections` 0, `customsclearances` 0, `consultingengagements` 0 |
| Protection/finance | `escrowtransactions` 0, `tradeassurances` 0, `tradeassurancecases` 0, `tradefinancings` 0, `disputes` 0 |
| Warehousing/config | `warehouses` 0, `warehouseinventories` 0, `warehouseorders` 0, `commercesettings` 0, `contactleads` 2 |

### Relationships and storage strategy

```text
User 1--0..1 Seller 1--* Product
  |          |             |--* Review
  |          |--1 SellerVerification --* embedded documents
  |          `--0..1 FactoryProfile
  |--* RFQ 1--* Quotation --0..1 Order
  |--* Chat 1--* Message
  |--* Order -- Payment / Invoice / Shipment / Escrow / Dispute
  |--1 Subscription --* Payment
  |--* ServiceRequest --0..1 Payment --0..1 Invoice
  `--* Notification / SavedItem / RecentlyViewed / AIChat / SupportTicket
```

- ObjectId references connect mutable entities; order, invoice, message, and research documents also embed snapshots to preserve historical display.
- Product stores both category strings and `categoryId`/`subcategoryId`; `ProductCategoryMapping` provides explicit taxonomy mapping.
- Chat embeds state per participant and order eligibility; Message embeds product/order/RFQ/quotation cards.
- Seller verification embeds uploaded documents, checks, step data, scores, and information requests; standalone `Document` is for trade documents.
- Arrays embed price tiers, variants, certifications, shipping data, histories, timelines, audit logs, and status events.

### Important live indexes

- Unique: user email; seller userId; category slug; category/subcategory slug pair; order/payment/service numbers; chat `pairKey`; wallet userId+role.
- Catalog: verified/status/category/date listing indexes, price/rating/order sorts, seller/status, HS code mappings, and weighted text indexes.
- Search: text indexes exist on users, sellers, products, categories, RFQs, quotations, orders, reviews, notifications, HS codes, and knowledge documents.
- Messaging: chat participant/state/date compounds and message chat/date, receiver/unread, delivery indexes.
- Expiry: notifications and `mobile_sessions` have TTL indexes; notification documents default to 30 days.
- Location: `userlocations.current` is indexed as GeoJSON `2dsphere`.
- Drift: both `aichats`/`ai_chats` and `savedresearchreports`/`saved_research_reports` exist, proving naming-version duplication.

## 5. Schema Catalog

| Schema | Purpose, key fields, and flow |
|---|---|
| User | Identity: email, hidden passwordHash, names, phone, roles, primaryRole, active/ban flags, onboarding, metadata; parent for almost all user-owned records. |
| Seller / Company | One per seller user; company, tax IDs, contact/address/bank/shipping, verification, subscription, metrics, trust score, badges, certifications, hours. No separate Company schema. |
| FactoryProfile | Intended one-per-seller facility, address, capacity, machinery, media, and verification; current model source is invalid as described in limitations. |
| SellerVerification | One workflow per seller; status, steps, scores, checks, embedded documents, review data, expiry, admin notes; audited by VerificationAudit. |
| Product | Seller-owned offer with taxonomy/HS codes, price tiers, MOQ/unit, stock, media, variants, specifications, trade/shipping terms, status, ratings, and denormalized seller verification. |
| Category/Subcategory | Active, ordered, searchable taxonomy; subcategory references category and is unique by category+slug. |
| ProductCategoryMapping | Unique product/category/subcategory link used during product create/update. |
| RFQ | Buyer requirement with optional product/seller/chat, items, quantity, target price, delivery, incoterm, attachments, visibility, response tracking, and lifecycle status. |
| Quotation | Seller response to RFQ with pricing tiers, quantities, lead time, terms, shipping estimate, revisions, negotiation history, status, and optional order link. |
| Order | Buyer/seller trade aggregate: products, money, payment/shipping/assurance links, addresses, production, workflow, audit log, timeline, review, and extensive lifecycle statuses. |
| Payment | Gateway transaction for order/subscription/verification/service; amount/fees, entity link, Razorpay IDs/signature, status, refund and invoice metadata. |
| Subscription/Plan | One user subscription plus plan pricing, AI credits, feature lists, limits, support tier, verification boost, priority ranking, renewal and usage counters. |
| Wallet/WalletTransaction | Per-user-role balances and immutable-intent ledger entries linked to orders, payments, escrow, withdrawals, refunds, or adjustments. |
| PaymentMethod/WithdrawalRequest | Saved role-specific payout/payment metadata and seller withdrawal approval lifecycle. Sensitive fields are encrypted by helper code where used. |
| Chat/Message | Conversation participants/context/state and individual typed messages, attachments, read/delivery/edit/delete state, plus embedded marketplace cards. |
| Conversation | Older conversation model distinct from active Chat; another compatibility surface. |
| Review | Buyer/user rating dimensions, text, media, purchase verification, helpful votes, moderation status, and seller response; aggregates refresh Product/Seller. |
| Notification | User event inbox with type, title/body, related entity/action, priority, read state, and TTL expiry. |
| ServiceRequest | Generic service booking with requester role, service key, requirements, documents, quote, payment/invoice, assignment, progress, status, and history. |
| Invoice | Order or service invoice with parties/snapshots, line items, totals, payment data, terms, document URL, and public download token. |
| Document | User-owned trade/compliance document with parties, items, signatures, sharing, review status, retention, file metadata, and entity links. |
| TradeAssurance/Case | Protection records tied to an order; coverage, inspection/delivery/dispute/refund state or provider-backed funding/release terms. |
| EscrowTransaction | Order-linked amount, milestones, funding, inspection, release/refund, fees, documents, and dispute state. |
| Shipment/ShippingOrder | Active normalized shipment plus legacy/dedicated shipping-order model; provider/tracking, addresses, packages, events, documents, customs/warehouse state. |
| QualityInspection | Inspection request, provider, checklist/results, report, schedule, fees, order/shipment links, and status. |
| Dispute | Order/escrow/assurance issue with evidence, messages, resolution, refunds, assignment, and timeline. |
| TradeFinancing | Application, applicant/order, facility terms, underwriting documents, approval/disbursement, repayment schedule, and status. |
| CustomsClearance | Shipment/order classification, duties, documents, broker, filing/clearance, holds and status. |
| Warehouse/Inventory/Order | Facilities, stock by product/owner, and inbound/outbound storage/fulfilment operations. |
| HSCode | Revisioned classification hierarchy, descriptions/synonyms/keywords, country extensions, trade controls, text search, and optional vector embedding. |
| AIChat/AIUsage | AI conversation/messages/context and per-user feature/model/credit usage. Live duplicate AI collection names require migration. |
| KnowledgeDocument | Versioned admin-curated RAG content with roles, intents, language, priority, FAQ/content and weighted retrieval text. |
| MarketAnalytics/SavedResearchReport | Generated market metrics and user-owned saved research; duplicate live naming variants exist. |
| SavedItem/RecentlyViewed | Wishlist-like polymorphic product/seller saves and unique per-user product view history. |
| SupportTicket/ContactLead | Authenticated support cases with AI context and public contact submissions with notes/status. |
| BulkProductImport | Seller spreadsheet job, per-row validation outcome, totals, and created product references. |
| CommerceSettings/TaxCalculation/Certification | Provider/rule configuration, calculated duties/taxes, and standalone seller certificate verification. |

## 6. API Architecture

- Express mounts all primary endpoints under `/api`; `/api/health` reports process, uptime, and Mongo connection state.
- Public read APIs: products, categories, suppliers, global search, HS codes, public RFQs, contact submission, and tokenized invoice PDF.
- Auth APIs: `/auth/login|signin|signup|logout|refresh|me`; `refresh` reissues the same stateless session model, not a separate refresh token.
- Buyer/seller APIs cover RFQs, quotations, chat, saved/recent items, checkout, sample/direct/trade orders, reviews, payments, addresses, profile, wallet, subscriptions, and notifications.
- Service APIs cover service requests, shipping/shipments, invoices, inspections, financing, escrow, disputes, customs, consulting, warehousing, documents, support, uploads, and market insights.
- Admin APIs are limited to seller verification review, subscription plan/subscription management, and knowledge-base CRUD; other service modules infer admin access inside services.
- Seller-only middleware protects product mutations, bulk import, onboarding/factory/profile/document operations; buyer-only middleware protects samples and review creation.
- Protected route sequence is `authenticate` (JWT decode) -> `requireAuth` (load active user) -> optional `requireRole`/subscription gate -> controller.
- Zod validators return HTTP 422; not all routes have validators, and several services validate manually.
- Normal errors are `{error}`; duplicate keys are 409, auth is 401/403, not-found is 404. Response envelopes are inconsistent across modules.
- Pagination commonly uses `page`/`limit`, clamps maximums per module, sorts newest first, and returns totals/pages; some lists only apply a hard limit.
- Product filters include category, subcategory, seller, price range and text; sort aliases are latest, rating, price ascending/descending.
- Rate limiting exists for public product traffic, contact leads, and AI search; the limiter is process-local.
- Public product responses send cache-control headers; repository caches are invalidated on Product repository mutations.
- Nest exposes overlapping `/api` auth, home/catalog/search, seller onboarding, RFQ/quotation/chat/order/payment/notification/wallet/address and AI routes.

## 7. Services Module

- The catalog defines 13 visible services: shipping, trade assurance, escrow, quality inspection, supplier verification, warehousing, financing, customs, dispute resolution, analytics, documentation, consulting, and tax calculator.
- Booking begins with `POST /service-requests/quote/:serviceKey`, calculating base price, quantity surcharge, 2% platform fee, and 18% GST.
- `POST /service-requests` is subscription-gated, creates a numbered request, stores requirements/documents/quote, and starts at `submitted`.
- Lifecycle: `draft -> submitted -> under_review -> documents_required -> in_progress -> completed`; cancellation is terminal.
- Payment lifecycle: `pending -> processing -> paid`, with `failed`, `cancelled`, and `refunded` alternatives.
- Payment initiation creates a Razorpay order and Payment record; verification checks HMAC, gateway order, captured state, and amount.
- Verified payment creates a tokenized paid Invoice, moves the request to `under_review`, raises progress to at least 25%, and records history.
- Users may cancel only draft/submitted/under-review unpaid requests.
- Documents carry pending/approved/rejected/reupload-required state; assignment, expected completion, notes, remarks, progress, and history support tracking.
- The current public service-request API has no admin assignment/status/document-review endpoints, no service refund endpoint, and no service-specific support thread.
- Dedicated domain services (shipping, escrow, inspection, financing, customs, dispute, warehouse, consulting) have their own records and routes but mostly zero live records.

## 8. Authentication and Authorization

```text
signup/login -> validate -> find/create User -> verify/hash password
             -> sign JWT(sub) -> Set-Cookie esyglob_session
native app   -> persist cookie pair in MMKV -> Cookie header on API requests
protected API -> decode token -> load active, non-banned User -> role/plan checks
Socket.IO    -> token in handshake.auth -> verify -> load User -> join user room
```

- Signup accepts buyer/seller; seller signup also creates Seller and SellerVerification defaults. The first database user becomes admin.
- Login normalizes email, compares PBKDF2, rejects inactive/banned accounts, records last login, and initializes seller defaults.
- Express JWT is accepted from bearer header first or cookie second; cookie is HTTP-only, same-site/secure environment-aware, and 30 days by default.
- Logout clears the cookie. There is no token revocation list, rotating refresh token, session collection, MFA, or OTP in the Express path.
- OTP signup/login is not implemented. Nest has reset/email-verification token consumers, but no outbound token delivery and no OTP flow.
- `requireRole` relies on the fully loaded user; feature limits/AI credits are enforced by `requireSubscriptionFeature` and persisted to Subscription/AIUsage.
- The standalone permission map is descriptive; route enforcement primarily uses role checks, not fine-grained permission middleware.

## 9. Product Lifecycle

1. A seller completes onboarding, receives Seller/Verification records, and creates a draft or listing under plan limits.
2. Create validates ownership and taxonomy for non-drafts, copies category names/IDs, creates mapping, and denormalizes `isVerifiedSeller`.
3. Status values are draft, pending_review, rejected, published, active, or paused; current create can publish directly, so universal admin approval is not enforced.
4. Public queries require active/published and `isVerifiedSeller=true`; owner/admin may view non-public detail.
5. Search uses Mongo text search plus category/subcategory/seller/price filters, bounded pagination, safe sort allow-list, and compound hints.
6. Listing cards project only name, first image, price, unit, MOQ, taxonomy, rating, seller; details populate seller and full product data.
7. Similar products are same-category, verified, public products excluding the current item, limited to six; this is rule-based, not personalized ML.
8. Home first tries `/home`; Express lacks that route, so the client falls back to parallel categories and product requests and slices latest data into trending/recommended.
9. Images are Cloudinary URLs stored in arrays; variants may have their own images, and video objects store URL/thumbnail/title.
10. Updates/deletes enforce seller ownership and clear repository caches; review writes refresh product and seller rating aggregates.

## 10. Seller Flow

- Registration creates User -> Seller -> SellerVerification; onboarding drafts save incremental company, business, trade, bank, factory, and document data.
- Submission computes completion/readiness scores and moves verification toward review; document upload uses Multer then Cloudinary.
- Admin document review supports under_review, verified, rejected, and needs_update, requires rejection notes, writes VerificationAudit, updates scores, and notifies the seller.
- Factory information is intended to live in a unique FactoryProfile linked by sellerId; seller public detail also exposes products and trust attributes.
- Trust score and verification level derive from verification-center completeness/checks; verified/trusted badges and subscription affect visibility and ranking fields.
- Supplier lists sort/filter on active, suspended, verified, trusted, verification level, trust score, rating, company type, and country.
- Plans define product limits, quotation/message/service limits, AI credits, support tier, trust boost, verification level, and `priorityRanking`.
- Metrics such as products, orders, revenue, response rate, delivery rate, rating, and trade-history summary are denormalized on Seller.

## 11. Buyer Journey

```text
signup -> home/categories/search -> product/seller detail -> save or inquiry/chat
       -> custom/product RFQ -> seller quotation -> negotiate/revise/accept
       -> checkout/order -> Razorpay verification -> production/shipment
       -> delivery -> review, dispute, or service/support workflow
```

- Wishlist behavior uses SavedItem for products and sellers; RecentlyViewed records product detail activity.
- Inquiry can create a product/seller-targeted RFQ and linked chat; general RFQs may be public or restricted to selected suppliers.
- Quotation acceptance can create/link a trade order and synchronize RFQ, quotation, chat, notifications, and realtime events.
- Buyers can place sample, direct, chat-derived, or quotation-derived orders, manage addresses, view invoices/payments, and track shipment timelines.
- Reviews support multidimensional ratings, verified purchase, images, helpful votes, moderation state, and seller responses.

## 12. Search System

- `/search?q=` performs global product, supplier, and category retrieval; mobile normalizers tolerate products/suppliers/sellers/manufacturers response aliases.
- `/products` provides exact taxonomy resolution, text query, price, seller, pagination, and sort; public results exclude unverified sellers.
- `/suppliers` supports company/type/location/trust/verification filtering and ranking; `/categories` returns active ordered taxonomy and counts.
- Suggestions are derived from matching marketplace records; no dedicated persisted autocomplete/trending-query collection exists.
- `/ai-search` classifies natural language into product/supplier/manufacturer/RFQ/quotation/procurement/mixed intent and translates it to marketplace retrieval.
- Image search currently treats the uploaded URL as context and returns marketplace candidates; visual embeddings are explicitly not connected.
- HS search has weighted text indexes and repository support for an Atlas vector index named `hs_code_embedding`, when embeddings/index are available.
- Search caches are per process, so the two PM2 workers can return different cache ages after writes.

## 13. AI Module

```text
message -> language/role/intent classifier
        -> route: marketplace data | private account data | knowledge | trade research
        -> Mongo retrieval + optional KnowledgeDocument RAG + optional Tavily evidence
        -> prompt with bounded snapshots/history
        -> Ollama; AIService may use Gemini/DeepSeek and Ollama fallback
        -> safety/relevance/language validation -> repair/fallback -> persist AIChat/usage
```

- Intent routing is deterministic regex-based and recognizes products, suppliers, RFQ, quotation, order, shipping, assurance, payment, membership, policy, HS codes, research, and business templates.
- Private retrieval is authorized by userId; marketplace snapshots cap product/supplier/category/RFQ/order counts before prompt construction.
- Knowledge RAG tokenizes the query, applies status/role/intent/language filters, text-searches `KnowledgeDocument`, re-ranks, and caches for five minutes.
- Ollama is warmed on startup and every 25 minutes; chat uses recent messages and can stream responses.
- Gemini/DeepSeek key pools implement retries/rate-limit handling; deterministic marketplace answers remain available when models fail.
- Response validation checks empty/incomplete output, relevance, requested language, wrong retrieval, credential leakage, and malformed formatting.
- AI quotas are plan-driven; usage increments before execution and selected failures can refund usage.
- There is no vector store for general RAG, no embedding pipeline for products/images, and no durable job queue for long research.

## 14. Payments, Subscription, and Wallet

- Order/service/subscription checkout creates a server-side Razorpay order; amounts are converted to paise and validated.
- Client completion is not trusted: Express recomputes HMAC, fetches the Razorpay payment, and verifies captured status, order ID, and amount.
- Successful order payment updates Payment and Order, generates/link Invoice where applicable, records workflow/timeline, notifies parties, and emits realtime updates.
- Subscription payment activates the buyer/seller plan, dates, billing cycle, AI credits and history; auto-renew is only a stored toggle unless externally scheduled.
- `/subscription/webhook` is the only explicit webhook route found; order/service flows primarily use client-triggered verification endpoints.
- Refund fields and refunded statuses exist across Payment, Order, Wallet, Escrow, Assurance, and ServiceRequest, but there is no unified refund orchestrator.
- Wallet summary is derived from Wallet plus payments/orders/withdrawals; ledger transactions support holds/releases, but the live ledger was empty.
- Platform fees default to 3% for commerce helpers; generic service quotes separately use 2%, so fee policy is not centralized.

## 15. Notifications

- Persisted categories: messages; enquiries/RFQs/quotations; order/payment; reviews; services/logistics/escrow/inspection/finance/customs/warehouse; account/verification/subscription; products; system alerts.
- Creation occurs inside domain services; Notification stores related model/id/action URL, priority, read state, and 30-day expiry.
- APIs list/filter/page, count unread, mark one/all read, and delete one/read/all.
- Socket events provide immediate in-app refresh for chat, RFQ, quotation, order, and selected notification events.
- The frontend invalidates React Query notification/chat/order/quotation caches when relevant socket events arrive.
- “Email”, “push”, “SMS”, and “WhatsApp” appear only as concepts/config provider types; no actual outbound implementation was found.

## 16. Real-time Architecture

- Socket.IO shares the Express HTTP server and accepts websocket with polling fallback, 25-second ping interval, and 20-second timeout.
- Authentication verifies the JWT and active/non-banned User before connection.
- Each connection joins `user_<id>`; authorized chat members may join `chat_<id>`.
- Events include presence_updated, typing/typing_updated, new_message, messages_delivered, mark_read/messages_read, new_notification, RFQ/quotation/order updates.
- Read operations update Message read timestamps; HTTP chat sends persist messages, update chat summary/unread counts, then emit.
- Presence is process-memory/room based. With two PM2 workers and no Socket.IO Redis adapter, cross-worker rooms and presence are incomplete.
- Presence broadcasts globally and is not stored; typing is ephemeral; delivery/read state is persisted on Message.

## 17. Admin Capabilities

- Implemented APIs allow admins to list seller verification reviews, review individual embedded documents, update trust/verification values, audit actions, and notify sellers.
- Admins can list/edit subscription plans and list subscriptions, and can CRUD knowledge-base records for RAG.
- Several domain services let admins view all records or update statuses (for example disputes, customs, financing), but authorization is sometimes inside service code.
- Moderation exists for chat contact-information leakage and review status fields; product model has review fields but no complete admin product-review route.
- No dedicated admin frontend, consolidated dashboard/analytics API, user management, report queue, or comprehensive permission UI exists in this repository.
- The static permission catalog is not wired as the main authorization system; role checks are the effective control.

## 18. Complete Request Lifecycles

- Homepage: screen -> `/home` -> 404 on Express -> client fallback -> categories + two product queries -> caches -> normalized cards -> render.
- Product search: SearchScreen -> `/search` or `/products` -> route/rate limit -> service -> indexed repository queries -> normalized arrays -> React Query cache -> result cards.
- Product detail: ID/slug -> visibility check -> seller populate + similar query -> details, media, seller CTA; view tracking is a separate buyer activity call.
- Seller detail: `/suppliers/:id` -> active seller/profile/verification/factory/product aggregation -> seller screen -> chat, save, product navigation.
- RFQ: validated/subscription-gated create -> RFQ persistence -> optional targeted chat/system message -> notification/socket -> seller quote -> revisions -> acceptance -> trade order.
- Service booking: quote -> gated ServiceRequest create -> Razorpay order -> native checkout -> HMAC/gateway verify -> Payment + Invoice -> under-review dashboard.
- Payment: server quote/order -> client Razorpay UI -> IDs/signature -> verify endpoint -> gateway fetch -> transaction/order state -> invoice/wallet/notifications as supported.
- Chat: create/find pair/group -> load paged messages -> HTTP send with moderation -> Message + Chat counters -> Socket.IO room/user events -> cache invalidation/render.
- Order update: authorized transition -> lifecycle guard checks payment/inspection/shipment/dispute -> update workflow/timeline/audit -> notify -> socket -> refetch UI.

## 19. End-to-End Data Flow

```text
Screen/component
  -> React Query + apiRequest (session header, GET cache/dedupe)
  -> Express route (CORS/body/security/rate/auth/role/plan/validation)
  -> controller (HTTP translation)
  -> service (rules, orchestration, external providers)
  -> repository or Mongoose model
  -> MongoDB indexes/references/embedded state
  -> JSON/error + HTTP cache headers
  -> normalizer -> React Query/component state -> UI
  -> optional Socket.IO event -> cache invalidation -> refetch
```

- Cloudinary receives binary uploads before URLs/metadata are saved; Razorpay receives payment intents before verified state is committed.
- Transactions are generally multi-document sequential writes, not MongoDB sessions, so partial failure compensation is limited.
- Cache layers are client Map, React Query/persistence, repository objects, shared memory-cache helper, NodeCache RAG, and HTTP/CDN semantics.

## 20. Module Dependencies

- Auth is foundational: User/session -> every protected domain; Seller defaults depend on verification helpers.
- Catalog depends on Seller, taxonomy, HS codes, mappings, reviews, and subscription limits.
- Procurement depends on User/Seller/Product -> RFQ -> Quotation -> Chat/Message -> Order.
- Commerce depends on Order -> Payment -> Invoice/Wallet/Escrow/Assurance -> Shipment/Inspection/Customs/Dispute.
- Services depend on User, Subscription, Payment, Invoice, documents, notifications, and domain-specific models.
- AI depends on User/Subscription/AIUsage, marketplace repositories, knowledge base, saved research, and external providers.
- Realtime depends on auth, Chat/Message, and domain services; frontend realtime depends on React Query.
- Keep dependency direction routes -> controllers -> services -> repositories -> models; shared `lib` must not import controllers/routes.
- The parallel Nest API should not own competing schema definitions; choose one API contract or extract a shared schema/package.

## 21. Current Architecture Limitations

- Critical: `backend/src/models/FactoryProfile.js` currently contains and executes a seller-update script, not a Mongoose model; importing it can mutate production and exit the process.
- Two backend implementations duplicate schemas, auth, validation, and route behavior against one database.
- Live duplicate collection names (`aichats`/`ai_chats`, two saved-research names) split data and complicate reads/migrations.
- Production configuration selects a database named `test`, increasing operational ambiguity and accidental-environment risk.
- PM2 clustering conflicts with process-local caches, rate limits, Socket.IO rooms/presence, and AI warm state.
- Multi-document order/payment/RFQ/quotation changes lack MongoDB transactions, idempotency keys, and a durable outbox.
- Product publishing does not consistently require admin approval; `pending_review` exists but is not a mandatory state machine.
- Auth has long-lived stateless cookies without revocation/rotation; OTP/MFA and real email verification delivery are absent.
- Response envelopes, validation coverage, statuses, duplicated fields, and ID meanings vary between modules.
- SellerId sometimes means Seller `_id` and sometimes seller User `_id`, especially in Chat/Assurance models.
- Denormalized counts, ratings, verification flags, prices, and snapshots can drift without repair jobs/change streams.
- Sequential count-based human-readable IDs can collide under concurrency in several older schemas.
- Generic service workflow lacks admin operations, refund orchestration, SLAs, provider callbacks, and linked support threads.
- Search is Mongo text/regex/rule based; image search and general embeddings are placeholders, and Atlas vector support is HS-specific.
- No queue/workers, centralized logs/tracing/metrics, automated migrations, API versioning, OpenAPI spec, Docker/IaC, or meaningful backend tests were found.
- Stored Razorpay signatures/gateway payloads and broad mixed fields increase sensitive-data and schema-governance risk.
- The homepage `/home` contract exists in Nest/client but not Express, forcing a 404 fallback on the primary API.

## 22. Future Scalability Roadmap

1. Restore a valid FactoryProfile model immediately; move operational data scripts outside models and require explicit dry-run/production confirmation.
2. Declare Express or Nest as canonical, publish OpenAPI, share DTOs/types, and migrate callers before retiring the duplicate path.
3. Rename the production database, introduce migration/version records, consolidate duplicate collections, and validate references/denormalized fields.
4. Add Redis for response cache, distributed rate limits, sessions/revocation, Socket.IO adapter, presence, locks, and idempotency.
5. Introduce queues/workers for notifications, webhooks, invoices, media, imports, AI research, expiry, settlements, and reconciliation.
6. Use MongoDB transactions for quotation acceptance/order creation/payment finalization and an outbox for reliable events.
7. Add Razorpay webhook-first reconciliation, signed webhook replay protection, idempotency keys, centralized refunds, and ledger invariants.
8. Put Cloudinary behind lifecycle/retention policies and a CDN; add private signed downloads, malware scanning, checksums, and media transformations.
9. Move product/supplier discovery to Atlas Search or OpenSearch; add autocomplete, facets, typo tolerance, analytics, embeddings, and real image similarity.
10. Split only where load/ownership demands it: identity, catalog/search, procurement/orders, payments/ledger, messaging/realtime, services, AI, notifications.
11. Scale APIs statelessly behind a load balancer; add health/readiness checks, autoscaling, secret manager, backups, staging isolation, and zero-downtime migrations.
12. Add structured logs, traces, metrics, audit dashboards, SLOs, alerts, contract/integration tests, security tests, and restore drills.
13. Replace coarse roles with resource-scoped policies and admin permissions; add short access tokens, rotating refresh sessions, MFA/OTP, and verified delivery channels.
14. Formalize every lifecycle as a single state machine with allowed transitions, responsible role, side effects, compensation, and audit entry.

## Source-of-Truth Rules

- Production collection/index metadata outranks local assumptions; Mongoose models define validation for future writes but do not prove live usage.
- Express routes/services describe the production mobile URL unless deployment configuration proves traffic is routed to Nest.
- Empty live collections mean the capability is modeled, not that the workflow is proven in production.
- Update this document whenever a schema, route, provider, lifecycle, deployment topology, or collection migration changes.
