# EsyGlob Enterprise Seller Verification & Compliance Center

## Purpose

This document is the source of truth for reproducing the React Native Verification Center in the future EsyGlob web application. The implementation extends the existing seller onboarding, SellerVerification, Cloudinary, notification, and audit architecture. It does not introduce a second verification collection or replace authentication.

## Complete UI Flow

The seller opens Account → Verification. The existing `SellerOnboarding` navigation key now renders `VerificationCenterScreen`, preserving older deep links and account-menu mappings.

The screen loads a dashboard followed by an eight-step wizard:

1. Business Information
2. Legal Verification
3. Import / Export Verification
4. Factory Verification (manufacturer only)
5. Bank Verification
6. Product & Quality Certifications
7. Service Verification
8. Final Review

The dashboard displays overall completion, overall trust score, current and next levels, estimated remaining time, last save time, pending/verified/rejected/missing document counts, and separate business/trade/service scores.

The horizontal step rail identifies the active, completed, rejected, and not-applicable steps. Sellers may move between steps without losing data. Factory is disabled when the saved company type is not `manufacturer`.

## Navigation Flow

- Account screen label `Verification` → root route `SellerOnboarding`
- Root route `SellerOnboarding` → `VerificationCenterScreen`
- Back → previous Account/dashboard screen
- Notification Center continues to receive account-category verification events
- Existing public seller detail and verification badges continue using `Seller.isVerified`, `Seller.verificationLevel`, and `Seller.trustScore`

The old `SellerOnboardingScreen.tsx` remains in the repository for backward reference but is no longer registered as the root-route component.

## Mobile Components

`VerificationCenterScreen.tsx` contains reusable internal components:

- `ScoreRing`
- `Metric`
- `ScoreBar`
- `DocumentCard`
- `ReviewPanel`

The screen also uses existing shared components:

- `LoadingState`
- `ErrorState`
- MaterialCommunityIcons
- React Query
- React Navigation
- Document Picker

## Backend Flow

1. `GET /api/suppliers/onboarding` resolves the authenticated seller, SellerVerification record, legacy completion summary, and enterprise verification summary.
2. The mobile application hydrates `stepData` and `currentStep` once.
3. Field edits update local state immediately.
4. A 1.2-second debounce calls the existing onboarding draft endpoint.
5. The backend separates seller-compatible fields from `verificationCenter`, updates Seller and SellerVerification, calculates scores and levels, then returns the new summary.
6. Document selection posts multipart data to the existing verification document endpoint.
7. The backend validates role, document type, MIME type, size, and duplicate checksum before appending a new immutable version.
8. Admin review changes document state, writes an audit event, recalculates scores, updates Seller trust fields, and notifies the seller.

## API Endpoints Used

### Existing and extended

#### `GET /api/suppliers/onboarding`

Authentication: seller role required.

Response:

```json
{
  "success": true,
  "seller": {},
  "verification": {
    "currentStep": 0,
    "completedSteps": [],
    "rejectedSteps": [],
    "stepData": {},
    "documents": []
  },
  "completion": {},
  "verificationCenter": {
    "completionPercentage": 0,
    "businessScore": 0,
    "tradeReadinessScore": 0,
    "serviceReadinessScore": 0,
    "overallTrustScore": 0,
    "verificationLevel": 0,
    "currentLevel": "Unverified",
    "nextLevel": "Basic Verified",
    "estimatedMinutesRemaining": 64,
    "documentCounts": {
      "pending": 0,
      "verified": 0,
      "rejected": 0,
      "missing": 0
    },
    "lastSavedAt": null
  },
  "draftAvailable": true
}
```

#### `PATCH /api/suppliers/onboarding`

Authentication: seller role required.

Request:

```json
{
  "companyName": "Example Exports",
  "companyType": "manufacturer",
  "businessEmail": "seller@example.com",
  "businessPhone": "+919999999999",
  "gstNumber": "...",
  "panNumber": "...",
  "verificationCenter": {
    "currentStep": 2,
    "completedSteps": [0],
    "stepData": {
      "business": {},
      "legal": {},
      "trade": {},
      "factory": {},
      "bank": {},
      "certifications": {},
      "services": {}
    },
    "submitForReview": false
  }
}
```

`submitForReview: true` changes the verification workflow to `under_review` without invoking or duplicating the legacy completed-onboarding endpoint.

#### `POST /api/suppliers/verification/documents`

Authentication: seller role required. Multipart fields:

- `file`
- `documentType`

Response returns a protected application URL rather than exposing the stored Cloudinary URL:

```json
{
  "success": true,
  "document": {
    "_id": "...",
    "type": "trade_license",
    "name": "license.pdf",
    "url": "/api/suppliers/verification/documents/...",
    "downloadUrl": "/api/suppliers/verification/documents/...",
    "status": "pending",
    "version": 1,
    "reuploadCount": 0,
    "mimeType": "application/pdf",
    "size": 12345,
    "uploadedAt": "..."
  }
}
```

#### `GET /api/suppliers/verification/documents/:documentId`

Authentication: document owner or admin. Resolves the stored Cloudinary object only after authorization.

### New lifecycle/admin operations

#### `DELETE /api/suppliers/verification/documents/:documentId`

Authentication: owning seller. This is a soft delete. It sets `status=archived`, records `archivedAt`, and preserves the version and audit trail.

#### `GET /api/suppliers/verification/admin/reviews`

Authentication: admin role. Query options:

- `status`
- `sellerId`
- `level`
- `search`
- `limit` (maximum 100)

Returns seller/user-populated verification records for admin queues.

#### `PATCH /api/suppliers/verification/admin/documents/:documentId`

Authentication: admin role.

Request:

```json
{
  "status": "verified",
  "notes": "Registration verified against submitted record",
  "reason": "Required for rejected or needs_update states"
}
```

Allowed status transitions from this endpoint:

- `under_review`
- `verified`
- `rejected`
- `needs_update`

Rejection and needs-update operations require a reason or reviewer note.

## MongoDB Collections Used

No duplicate collection was created.

- `sellers`: company identity, public trust score, public verification level, badge status
- `sellerverifications`: enterprise wizard state, private document records, scores, review state
- `verificationaudits`: immutable lifecycle events
- `notifications`: seller-facing verification changes
- `factoryprofiles`: existing detailed factory profile remains reusable by factory screens
- `users`: authentication, roles, onboarding identity

## Database Changes

### SellerVerification additions

- `currentStep`
- `completedSteps`
- `rejectedSteps`
- `stepData` (Mixed, step-keyed)
- `businessScore`
- `tradeReadinessScore`
- `serviceReadinessScore`
- `overallTrustScore`
- `lastSavedAt`
- verification level maximum increased from 4 to 6

### Embedded document additions

- additional enterprise document types
- statuses: `pending`, `under_review`, `approved`, `verified`, `rejected`, `expired`, `needs_update`, `archived`
- `reviewerNotes`
- `issueDate`
- `expiryDate`
- `version`
- `reuploadCount`
- `supersedesDocumentId`
- `archivedAt`

### Seller additions/changes

- verification level maximum increased from 4 to 6
- existing `trustScore` and `verificationLevel` are synchronized after saves and reviews

## Cloudinary Integration Flow

The existing `storeUpload` pipeline is retained:

1. Multer stores the incoming multipart file in memory.
2. Controller validates declared verification type, MIME type, and 5 MB maximum.
3. SHA-256 checksum is calculated.
4. `storeUpload` writes into `verification/{sellerId}` in Cloudinary.
5. Only the Cloudinary URL/storage key and metadata are stored in MongoDB.
6. API responses replace the storage URL with the authenticated application download route.
7. Owner/admin authorization is checked before redirecting to the stored object.

## Upload and Re-upload Flow

- Images, PDFs, DOC, DOCX, and factory video are selectable where applicable.
- The mobile card shows active upload feedback.
- Uploading an identical checksum while an active version exists returns HTTP 409.
- Uploading a new file of the same type appends a new version.
- `supersedesDocumentId` links to the previous active version.
- `reuploadCount` increases.
- Previous versions remain stored and reviewable.
- Removing a document archives it instead of deleting history or the database record.

## Trust Score Logic

- Business score: completed required business identity fields / total business fields.
- Trade readiness: verified legal, import/export, and certification documents, capped at 100.
- Service readiness: verified service documents relative to selected services.
- Overall trust score:
  - Business: 40%
  - Trade: 40%
  - Services: 20%

Scores are recalculated after enterprise draft saves and admin document reviews. The final score is synchronized to `Seller.trustScore`.

## Verification Levels

- 0–19: Unverified
- 20–39: Basic Verified
- 40–54: Verified Supplier
- 55–69: Premium Supplier
- 70–84: Gold Supplier
- 85–94: Diamond Supplier
- 95–100: Enterprise Supplier

The resulting numeric level (0–6) is saved on SellerVerification and Seller.

## Status Flow

Verification-level flow:

`pending` → `document_submitted` → `document_review` / `under_review` → `approved`

Correction branches:

- `info_requested`
- `rejected`
- `suspended`

Document flow:

`pending` → `under_review` → `verified`

Correction branches:

- `rejected`
- `needs_update`
- `expired`
- `archived`

## Autosave and Resume

- Mobile fields update instantly.
- A 1.2-second debounce persists the entire step-keyed snapshot.
- Header reflects saving, saved, or error state.
- `currentStep`, `stepData`, and server-calculated completed/rejected steps are stored in SellerVerification.
- On first successful query hydration, mobile restores the saved step and data exactly once.
- React Query invalidation refreshes server scores and document states.

## Notification Flow

New notification types:

- `verification_started`
- `verification_under_review`
- `verification_rejected`
- `verification_needs_update`
- `trust_score_increased`
- `verification_level_increased`
- `document_uploaded`
- `document_verified`
- `document_rejected`

Upload, submission, score increase, level increase, and admin review create in-app notifications. These are categorized under the existing Account notification category and are ready for later email/push consumers.

## Admin Review Flow

1. Admin lists records with role-protected filters/search.
2. Admin downloads/previews a document through the authenticated document endpoint.
3. Admin sets under-review, verified, rejected, or needs-update status.
4. Rejections require notes/reason.
5. Backend updates reviewer identity/time and document status.
6. Backend writes VerificationAudit.
7. Backend recalculates step completion, scores, and levels.
8. Backend synchronizes Seller public trust fields.
9. Backend creates seller notification.

## Validation Rules

- Seller routes require authenticated seller role.
- Admin review routes require authenticated admin role.
- Downloads require owning seller or admin.
- Document IDs must be valid MongoDB ObjectIds.
- Declared document type must be allowlisted.
- File MIME must be allowlisted; only the factory-video type permits video MIME.
- Maximum file size is 5 MB.
- Duplicate active checksums are rejected.
- Review statuses are allowlisted.
- Rejected/needs-update reviews require explanation.
- Current step values are restricted to 0–7.
- Level values are restricted to 0–6.
- Scores are restricted to 0–100.
- Legacy onboarding request fields and routes remain supported.

## Files Created

- `EsyGlob/src/screens/VerificationCenterScreen.tsx`
- `backend/src/lib/verification-center.js`
- `VERIFICATION_CENTER_IMPLEMENTATION_SUMMARY.md`

## Files Modified

- `EsyGlob/App.tsx`
- `EsyGlob/src/api/marketplace.ts`
- `backend/src/models/SellerVerification.js`
- `backend/src/models/Seller.js`
- `backend/src/models/Notification.js`
- `backend/src/models/VerificationAudit.js`
- `backend/src/lib/constants.js`
- `backend/src/lib/seller-verification.js`
- `backend/src/validators/supplier.validator.js`
- `backend/src/repositories/supplier.repository.js`
- `backend/src/repositories/notification.repository.js`
- `backend/src/services/supplier.service.js`
- `backend/src/controllers/supplier.controller.js`
- `backend/src/routes/supplier.routes.js`

## Backward Compatibility

- Existing seller onboarding GET/PATCH/POST routes remain available.
- Existing Seller and SellerVerification collections are retained.
- Existing document upload/download routes remain available.
- Existing Account navigation key and deep links remain valid.
- Legacy document statuses (`approved`) are treated as verified by scoring.
- Existing four-level records remain valid; the range was only expanded.
- Public product/seller verification behavior still uses existing Seller fields.

## Required Live Verification

The following must be executed against a deployed environment with Cloudinary credentials, MongoDB, a seller account, and an admin account:

- upload every supported MIME/type combination
- confirm Cloudinary delivery and authorized preview/download
- confirm duplicate checksum rejection
- submit, review, reject, re-upload, approve, archive, and inspect version history
- confirm score/level synchronization and public badges
- confirm Account notifications
- background/terminate the app during autosave and verify exact resume
- verify seller/admin isolation and unauthorized download rejection

