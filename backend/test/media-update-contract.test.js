import assert from 'node:assert/strict';
import test from 'node:test';
import { profileSchema } from '../src/validators/profile.validator.js';
import { factorySchema } from '../src/validators/supplier.validator.js';
import { parseProductUpdate } from '../src/validators/product.validator.js';
import { ownDefinedFields } from '../src/lib/media-integrity.js';
import { categorySeedUpdate, subcategorySeedUpdate } from '../src/repositories/category.repository.js';

test('partial profile edits do not synthesize an empty avatar', () => {
  const parsed = profileSchema.parse({ fullName: 'Example User', email: 'example@example.com' });
  assert.equal(Object.hasOwn(parsed, 'avatarUrl'), false);
  assert.deepEqual(ownDefinedFields(parsed, ['avatarUrl']), {});
});

test('partial factory edits do not synthesize empty media arrays', () => {
  const parsed = factorySchema.parse({ description: 'Unrelated edit' });
  assert.equal(Object.hasOwn(parsed, 'images'), false);
  assert.equal(Object.hasOwn(parsed, 'videos'), false);
  assert.equal(Object.hasOwn(parsed, 'certifications'), false);
});

test('partial product edits preserve images, variants, videos, and certificates', () => {
  const parsed = parseProductUpdate({ description: 'Unrelated edit' });
  for (const field of ['images', 'variants', 'videos', 'certifications']) {
    assert.equal(Object.hasOwn(parsed, field), false);
  }
});

test('catalog seeding initializes media only on insert and never overwrites uploaded media', () => {
  const item = { name: 'Category', slug: 'category', description: 'Description', trending: [], subcategories: ['Child'] };
  const categoryUpdate = categorySeedUpdate(item, 0);
  const subcategoryUpdate = subcategorySeedUpdate('category-id', item, 'Child', 0);
  assert.equal(Object.hasOwn(categoryUpdate.$set, 'image'), false);
  assert.equal(typeof categoryUpdate.$setOnInsert.image, 'string');
  assert.equal(Object.hasOwn(subcategoryUpdate.$set, 'image'), false);
  assert.equal(typeof subcategoryUpdate.$setOnInsert.image, 'string');
});
