const MONEY_SCALE = 100;

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

export function commercialNumber(value, field, { minimum = 0, required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw Object.assign(new Error(`${field} must be a finite number${minimum > 0 ? ' greater than zero' : ' of zero or more'}`), {
      statusCode: 422,
      code: 'INVALID_COMMERCIAL_VALUE',
      field,
    });
  }
  return number;
}

export function calculateQuotationTotals({ unitPrice, quantity, shippingCost = 0, taxAmount, taxRate, otherCharges = 0, discount = 0 }) {
  const price = commercialNumber(unitPrice, 'Unit price', { minimum: Number.EPSILON });
  const resolvedQuantity = commercialNumber(quantity, 'Quantity', { minimum: Number.EPSILON });
  const shipping = commercialNumber(shippingCost, 'Shipping cost');
  const rate = taxRate === undefined || taxRate === '' ? undefined : commercialNumber(taxRate, 'Tax rate');
  if (rate !== undefined && rate > 100) throw Object.assign(new Error('Tax rate cannot exceed 100 percent'), { statusCode: 422, code: 'INVALID_COMMERCIAL_VALUE', field: 'Tax rate' });
  const charges = commercialNumber(otherCharges, 'Other charges');
  const resolvedDiscount = commercialNumber(discount, 'Discount');
  const productSubtotal = roundMoney(price * resolvedQuantity);
  const tax = taxAmount === undefined || taxAmount === ''
    ? roundMoney(productSubtotal * Number(rate || 0) / 100)
    : commercialNumber(taxAmount, 'Tax amount');
  const finalTotal = roundMoney(productSubtotal + shipping + tax + charges - resolvedDiscount);
  if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
    throw Object.assign(new Error('Final quotation total must be greater than zero'), {
      statusCode: 422,
      code: 'INVALID_COMMERCIAL_TOTAL',
    });
  }
  return { unitPrice: price, quantity: resolvedQuantity, productSubtotal, shippingCost: shipping, ...(rate === undefined ? {} : { taxRate: rate }), taxAmount: tax, otherCharges: charges, discount: resolvedDiscount, finalTotal };
}

export function resolveOfferTotals(quotation, input = {}) {
  const quantity = input.suppliedQuantity ?? quotation.suppliedQuantity ?? input.minimumOrderQuantity ?? quotation.minimumOrderQuantity;
  const taxRate = input.taxes?.taxRate ?? input.taxRate ?? quotation.taxes?.taxRate;
  return calculateQuotationTotals({
    unitPrice: input.unitPrice ?? quotation.unitPrice,
    quantity,
    shippingCost: input.shippingCost ?? quotation.shippingCost ?? 0,
    taxAmount: taxRate === undefined || taxRate === '' ? input.taxes?.amount ?? input.taxAmount ?? quotation.taxes?.amount : undefined,
    taxRate,
    otherCharges: input.otherCharges ?? quotation.otherCharges ?? 0,
    discount: input.discount ?? quotation.discount ?? 0,
  });
}
