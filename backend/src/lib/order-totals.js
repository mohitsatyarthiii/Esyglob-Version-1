function finiteNumber(value, field, { minimum = 0, required = false } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw Object.assign(new Error(`${field} must be a valid number${minimum > 0 ? ' greater than zero' : ''}`), {
      statusCode: 422,
      field,
    });
  }
  return number;
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateCommercialTotal({
  unitPrice,
  quantity,
  shippingCost = 0,
  taxAmount = 0,
  discount = 0,
}) {
  const finalUnitPrice = finiteNumber(unitPrice, 'Final Unit Price', { minimum: 0.000001, required: true });
  const finalQuantity = finiteNumber(quantity, 'Final Quantity', { minimum: 0.000001, required: true });
  const finalShipping = finiteNumber(shippingCost, 'Shipping Cost');
  const finalTax = finiteNumber(taxAmount, 'Tax Amount');
  const finalDiscount = finiteNumber(discount, 'Discount');
  const subtotal = roundMoney(finalUnitPrice * finalQuantity);
  const totalAmount = roundMoney(subtotal + finalShipping + finalTax - finalDiscount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw Object.assign(new Error('Order payable amount must be greater than zero'), {
      statusCode: 422,
      field: 'amount',
    });
  }
  return {
    unitPrice: finalUnitPrice,
    quantity: finalQuantity,
    subtotal,
    shippingCost: finalShipping,
    taxAmount: finalTax,
    discount: finalDiscount,
    totalAmount,
  };
}

export function resolveOrderPayableAmount(order) {
  const stored = Number(order?.totalAmount ?? order?.totalPrice);
  if (Number.isFinite(stored) && stored > 0) return roundMoney(stored);
  return calculateCommercialTotal({
    unitPrice: order?.pricePerUnit ?? order?.products?.[0]?.unitPrice,
    quantity: order?.quantity ?? order?.products?.[0]?.quantity,
    shippingCost: order?.shippingCost,
    taxAmount: order?.taxAmount,
    discount: order?.discount,
  }).totalAmount;
}
