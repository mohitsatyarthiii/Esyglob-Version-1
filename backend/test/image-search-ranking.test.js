import assert from 'node:assert/strict';
import test from 'node:test';
import { rankVisualProducts } from '../src/repositories/ai-search.repository.js';

test('visual search ranks product identity and material above unrelated popularity', () => {
  const candidates = [
    {
      _id: 'popular-unrelated',
      name: 'Wireless industrial barcode scanner',
      category: 'Electronics',
      description: 'Handheld warehouse scanner',
      averageRating: 5,
      totalOrders: 250000,
      sellerId: { isVerified: true },
    },
    {
      _id: 'visual-match',
      name: 'Recycled cotton canvas tote bag',
      category: 'Bags',
      subcategory: 'Shopping bags',
      tags: ['recycled cotton', 'canvas', 'natural'],
      description: 'Beige reusable tote with long handles',
      averageRating: 4.2,
      totalOrders: 25,
    },
  ];

  const ranked = rankVisualProducts(candidates, ['cotton', 'canvas', 'tote', 'bag', 'beige']);

  assert.equal(ranked[0]._id, 'visual-match');
  assert.ok(ranked[0].visualRelevanceScore > ranked[1].visualRelevanceScore);
});

test('visual search gives product names more weight than incidental description matches', () => {
  const candidates = [
    { _id: 'description-only', name: 'Packaging machine', description: 'Can package stainless steel bottles' },
    { _id: 'name-match', name: 'Stainless steel water bottle', description: 'Bulk drinkware' },
  ];

  assert.equal(rankVisualProducts(candidates, ['stainless', 'steel', 'bottle'])[0]._id, 'name-match');
});
