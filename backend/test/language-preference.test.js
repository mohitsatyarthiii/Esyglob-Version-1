import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeUser } from '../src/lib/session.js';
import ProfileService from '../src/services/profile.service.js';

test('session serialization exposes the saved account language with an English fallback', () => {
  assert.equal(serializeUser({ _id: 'user-1', email: 'buyer@example.com', roles: ['buyer'], metadata: { preferredLanguage: 'ar' } }).preferredLanguage, 'ar');
  assert.equal(serializeUser({ _id: 'user-2', email: 'buyer@example.com', roles: ['buyer'] }).preferredLanguage, 'en');
});

test('language preference rejects unsupported locale identifiers before accessing storage', async () => {
  await assert.rejects(() => ProfileService.updatePreferredLanguage('user-1', 'xx'), error => {
    assert.equal(error.statusCode, 422);
    return true;
  });
});
