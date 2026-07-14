export const numberValue = (value: string | number | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const percentOf = (amount: number, rate: string | number): number =>
  amount * numberValue(rate) / 100;

export const safeDivide = (amount: number, divisor: string | number): number => {
  const value = numberValue(divisor);
  return value > 0 ? amount / value : 0;
};

export const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export type CostSummary = {
  productCost: number;
  freight: number;
  insurance: number;
  duty: number;
  gst: number;
  platformFee: number;
  packaging: number;
  misc: number;
  grandTotal: number;
  costPerUnit: number;
};

export const emptyCostSummary: CostSummary = {
  productCost: 0, freight: 0, insurance: 0, duty: 0, gst: 0,
  platformFee: 0, packaging: 0, misc: 0, grandTotal: 0, costPerUnit: 0,
};
