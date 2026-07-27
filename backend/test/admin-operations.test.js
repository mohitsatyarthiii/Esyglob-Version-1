import assert from 'node:assert/strict';
import test from 'node:test';
import { adminActionSchema, documentReviewSchema } from '../src/validators/admin.validator.js';
import { adminRole, hasAdminPermission, requireAdminResourcePermission } from '../src/middlewares/admin-permission.middleware.js';

test('enforces scoped administrator permissions and defaults legacy admins safely', () => {
  const verificationAdmin = { roles: ['admin'], metadata: { adminRole: 'verification_admin' } };
  assert.equal(adminRole(verificationAdmin), 'verification_admin');
  assert.equal(hasAdminPermission(verificationAdmin, 'verifications:manage'), true);
  assert.equal(hasAdminPermission(verificationAdmin, 'payments:manage'), false);
  assert.equal(hasAdminPermission({ roles: ['admin'] }, 'payments:manage'), true);
  assert.equal(hasAdminPermission({ roles: ['seller'] }, 'verifications:manage'), false);
});

test('requires reasons and operational inputs for sensitive actions', () => {
  assert.equal(adminActionSchema.safeParse({ action: 'suspend' }).success, false);
  assert.equal(adminActionSchema.safeParse({ action: 'suspend', reason: 'Policy violation' }).success, true);
  assert.equal(adminActionSchema.safeParse({ action: 'mark_paid' }).success, false);
  assert.equal(adminActionSchema.safeParse({ action: 'mark_paid', reference: 'BANK-1001' }).success, true);
  assert.equal(adminActionSchema.safeParse({ action: 'update_status' }).success, false);
  assert.equal(adminActionSchema.safeParse({ action: 'update_status', status: 'shipped' }).success, true);
  assert.equal(adminActionSchema.safeParse({ action: 'update_tracking' }).success, false);
  assert.equal(adminActionSchema.safeParse({ action: 'update_tracking', reference: 'AWB-2026-1001' }).success, true);
});

test('requires seller feedback when a document needs correction or is rejected', () => {
  assert.equal(documentReviewSchema.safeParse({ status: 'verified' }).success, true);
  assert.equal(documentReviewSchema.safeParse({ status: 'needs_update' }).success, false);
  assert.equal(documentReviewSchema.safeParse({ status: 'needs_update', reason: 'Upload a legible GST certificate.' }).success, true);
});

test('keeps activity records immutable through resource management routes', () => {
  let response;
  const middleware = requireAdminResourcePermission('manage');
  middleware(
    { params: { resource: 'activities' }, user: { roles: ['admin'] } },
    { status(code) { response = { code }; return { json(body) { response.body = body; return response; } }; } },
    () => assert.fail('Immutable activity log must not call next'),
  );
  assert.equal(response.code, 403);
  assert.equal(response.body.code, 'IMMUTABLE_AUDIT_LOG');
});
