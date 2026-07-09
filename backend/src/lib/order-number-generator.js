export function generateOrderNumber(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

export const ORDER_PREFIXES = {
  SHIPPING: 'SHP',
  ESCROW: 'ESC',
  INSPECTION: 'QIN',
  WAREHOUSE: 'WHO',
  FINANCING: 'TFN',
  CUSTOMS: 'CUS',
  DISPUTE: 'DSP',
  DOCUMENT: 'DOC',
  CONSULTING: 'CNS',
  ORDER: 'ORD',
  PAYMENT: 'PAY',
  ASSURANCE: 'TAS',
  VERIFICATION: 'VRF',
};