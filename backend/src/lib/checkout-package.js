function firstNumber(value) {
  const match = String(value || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function weightInKg(value) {
  const amount = firstNumber(value);
  if (!amount) return 0;
  const unit = String(value || '').toLowerCase();
  if (/\b(?:mg|milligram)/.test(unit)) return amount / 1_000_000;
  if (/\b(?:g|gram)/.test(unit) && !/\b(?:kg|kilogram)/.test(unit)) return amount / 1000;
  if (/\b(?:lb|pound)/.test(unit)) return amount * 0.45359237;
  return amount;
}

function dimensionsInCm(value) {
  const values = String(value || '').replaceAll(',', '.').match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [];
  if (values.length !== 3 || values.some(item => !item)) return null;
  const unit = String(value || '').toLowerCase();
  const multiplier = /\bmm\b|millimet/.test(unit) ? 0.1 : /\b(?:m|metre|meter)s?\b/.test(unit) && !/\bcm\b|centimet/.test(unit) ? 100 : /\b(?:in|inch)/.test(unit) ? 2.54 : 1;
  return values.map(item => item * multiplier);
}

export function checkoutShipmentForProduct(product = {}, shipment = {}, quantity = 1) {
  const packaging = product.packaging || {};
  const unitsPerPackage = Math.max(1, Number(packaging.unitsPerPackage || 1));
  const packageCount = Math.max(1, Math.ceil(Number(quantity || 1) / unitsPerPackage));
  const storedWeight = weightInKg(packaging.weight);
  const storedDimensions = dimensionsInCm(packaging.dimensions);

  return {
    ...shipment,
    quantity: Math.max(1, Number(quantity || 1)),
    weightKg: storedWeight ? storedWeight * packageCount : 0,
    lengthCm: storedDimensions?.[0] || 0,
    widthCm: storedDimensions?.[1] || 0,
    heightCm: storedDimensions?.[2] || 0,
    packageCount,
    packageSource: storedWeight && storedDimensions ? 'product' : 'missing',
  };
}

export function requireProductShippingData(product = {}, shipment = {}) {
  if (shipment.packageSource === 'product') return shipment;
  const error = new Error('Shipping rate unavailable for this product. Please contact the manufacturer.');
  error.statusCode = 422;
  error.code = 'PRODUCT_SHIPPING_DATA_MISSING';
  throw error;
}
