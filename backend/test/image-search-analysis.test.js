import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVisualSearchProfile,
  normalizeVisionAnalysis,
  parseVisionAnalysis,
  rankProductsByVisualRelevance,
} from '../src/lib/image-search.js';
import { storageVisionUrl } from '../src/lib/ai-service.js';

test('normalizes structured vision JSON into the stable image-search contract', () => {
  const analysis = parseVisionAnalysis(`\`\`\`json
  {
    "productName": " Stainless Steel Ball Valve ",
    "category": "Industrial Equipment",
    "subcategory": "Valves",
    "industry": "Industrial",
    "material": "Stainless Steel",
    "keywords": ["Ball Valve", "ball valve", "Pipe Valve"],
    "alternateKeywords": ["Control Valve"],
    "confidence": 1.4
  }
  \`\`\``);

  assert.equal(analysis.productName, 'Stainless Steel Ball Valve');
  assert.deepEqual(analysis.keywords, ['ball valve', 'pipe valve']);
  assert.equal(analysis.confidence, 1);
});

test('invalid or uncertain model output becomes an empty low-confidence analysis', () => {
  assert.deepEqual(parseVisionAnalysis('This might be a valve or a pump.'), normalizeVisionAnalysis(null));
  assert.equal(normalizeVisionAnalysis({ productName: '', confidence: -2 }).confidence, 0);
});

test('accepts only secure EsyGlob VPS storage URLs for the vision runtime', () => {
  const result = storageVisionUrl('https://api.esyglob.in/storage/products/catalog-product.webp');
  assert.equal(result, 'https://api.esyglob.in/storage/products/catalog-product.webp');
  assert.throws(
    () => storageVisionUrl('https://example.com/product.webp'),
    /uploaded through EsyGlob/
  );
});

test('visual search profile combines identity and broader fallback evidence', () => {
  const profile = buildVisualSearchProfile({
    productName: 'Stainless Steel Ball Valve',
    category: 'Industrial Equipment',
    subcategory: 'Valves',
    industry: 'Industrial',
    material: 'Stainless Steel',
    keywords: ['ball valve', 'pipe valve'],
    alternateKeywords: ['control valve'],
    confidence: 0.94,
  }, 'flanged fitting');

  assert.ok(profile.identityTerms.includes('stainless steel ball valve'));
  assert.ok(profile.broadTerms.includes('industrial equipment'));
  assert.ok(profile.broadTerms.includes('control valve'));
  assert.ok(profile.broadTerms.includes('flanged'));
});

test('structured visual ranking uses material and subcategory fields without popularity leakage', () => {
  const profile = buildVisualSearchProfile({
    productName: 'Ball Valve',
    category: 'Industrial Equipment',
    subcategory: 'Valves',
    industry: 'Industrial',
    material: 'Stainless Steel',
    keywords: ['pipe valve'],
    alternateKeywords: ['control valve'],
    confidence: 0.92,
  });
  const ranked = rankProductsByVisualRelevance([
    {
      _id: 'wrong-popular',
      name: 'Industrial barcode scanner',
      category: 'Electronics',
      totalOrders: 900000,
      averageRating: 5,
    },
    {
      _id: 'right-product',
      name: 'Flanged ball valve',
      category: 'Industrial Equipment',
      subcategory: 'Valves',
      specifications: { material: 'Stainless Steel 304' },
      tags: ['pipe valve'],
      totalOrders: 2,
    },
  ], profile);

  assert.equal(ranked[0]._id, 'right-product');
  assert.equal(ranked.some((product) => product._id === 'wrong-popular'), false);
});

test('normalizes comma-delimited model keywords and removes unspecified search noise', () => {
  const analysis = normalizeVisionAnalysis({
    productName: 'Laptop',
    category: 'Electronics',
    subcategory: 'Computers',
    material: 'Unspecified',
    keywords: ['laptop, notebook computer, portable PC'],
    alternateKeywords: [],
    confidence: 0.9,
  });
  const profile = buildVisualSearchProfile(analysis);

  assert.deepEqual(analysis.keywords, ['laptop', 'notebook computer', 'portable pc']);
  assert.equal(profile.broadTerms.includes('unspecified'), false);
});

test('drops name-only accessory collisions when product classification is incompatible', () => {
  const profile = buildVisualSearchProfile({
    productName: 'Laptop',
    category: 'Electronics',
    subcategory: 'Computers and Peripherals',
    industry: 'Technology',
    keywords: ['notebook computer'],
    alternateKeywords: ['portable computer'],
    confidence: 0.95,
  });
  const ranked = rankProductsByVisualRelevance([
    {
      _id: 'actual-laptop',
      name: 'Business laptop computer',
      category: 'Computer Hardware & Software',
      subcategory: 'Laptops',
      tags: ['notebook computer'],
    },
    {
      _id: 'laptop-bag',
      name: 'Leather laptop school bag',
      category: 'Leather Products',
      subcategory: 'Leather Bags',
    },
  ], profile);

  assert.deepEqual(ranked.map((product) => product._id), ['actual-laptop']);
});
