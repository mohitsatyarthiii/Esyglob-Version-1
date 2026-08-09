import test from 'node:test';
import assert from 'node:assert/strict';
import { getAICreditPackage, listAICreditPackages } from '../src/lib/ai-credit-packages.js';

test('AI credit packages come from validated backend configuration', () => {
  const previous = process.env.AI_CREDIT_PACKAGES_JSON;
  process.env.AI_CREDIT_PACKAGES_JSON = JSON.stringify([
    { key: 'credits_1000', credits: 1000, price: 250, currency: 'inr' },
    { key: 'invalid', credits: -1, price: 0 },
  ]);
  try {
    assert.deepEqual(listAICreditPackages(), [{ key: 'credits_1000', name: '1,000 Credits', credits: 1000, price: 250, currency: 'INR', popular: false }]);
    assert.equal(getAICreditPackage('credits_1000').price, 250);
    assert.equal(getAICreditPackage('invalid'), null);
  } finally {
    if (previous === undefined) delete process.env.AI_CREDIT_PACKAGES_JSON;
    else process.env.AI_CREDIT_PACKAGES_JSON = previous;
  }
});

test('invalid or absent package configuration exposes no purchasable packages', () => {
  const previous = process.env.AI_CREDIT_PACKAGES_JSON;
  process.env.AI_CREDIT_PACKAGES_JSON = 'not-json';
  try { assert.deepEqual(listAICreditPackages(), []); }
  finally { if (previous === undefined) delete process.env.AI_CREDIT_PACKAGES_JSON; else process.env.AI_CREDIT_PACKAGES_JSON = previous; }
});
