import CommerceSettings from '../models/CommerceSettings.js';
import { calculatePlatformFeeFromSettings, shouldApplyPlatformFee } from '../lib/platform-fees.js'
import { calculatePromotions, productPriceForQuantity } from '../services/promotion.service.js';

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const DEFAULT_LOGISTICS_RULES = [
  {
    key: 'esyglob_standard',
    label: 'Esyglob Standard',
    mode: 'standard',
    incoterm: 'CIF',
    eta: '21-35 days',
    baseCharge: 8500,
    variableRate: 0.008,
    providerKey: 'manual',
    internalBreakdown: {
      logistics: 5400,
      insurance: 550,
      warehousing: 700,
      taxation: 450,
      handling: 800,
      documentation: 600,
    },
  },
  {
    key: 'esyglob_premium',
    label: 'Esyglob Premium',
    mode: 'premium',
    incoterm: 'DAP',
    eta: '10-16 days',
    baseCharge: 14500,
    variableRate: 0.015,
    providerKey: 'manual',
    internalBreakdown: {
      logistics: 9800,
      insurance: 850,
      warehousing: 950,
      taxation: 750,
      handling: 1200,
      documentation: 950,
    },
  },
  {
    key: 'esyglob_express',
    label: 'Esyglob Express',
    mode: 'express',
    incoterm: 'DDP',
    eta: '3-5 days',
    baseCharge: 28500,
    variableRate: 0.022,
    providerKey: 'manual',
    internalBreakdown: {
      logistics: 19000,
      insurance: 1500,
      warehousing: 1800,
      taxation: 1400,
      handling: 2500,
      documentation: 1300,
    },
  },
];

export const AUTOMATED_PLATFORM_SERVICES = [
  { key: 'trade_assurance', label: 'Trade Assurance', buyerVisible: true, status: 'active', amount: 0 },
  { key: 'escrow', label: 'Secure Payment Escrow', buyerVisible: true, status: 'pending_funding', amount: 0 },
  { key: 'buyer_protection', label: 'Buyer Protection', buyerVisible: true, status: 'active', amount: 0 },
  { key: 'refund_protection', label: 'Refund Protection', buyerVisible: true, status: 'active', amount: 0 },
  { key: 'order_tracking', label: 'Order Tracking', buyerVisible: true, status: 'active', amount: 0 },
  { key: 'shipment_tracking', label: 'Shipment Tracking', buyerVisible: true, status: 'pending_shipment', amount: 0 },
  { key: 'gst_invoice', label: 'GST Invoice', buyerVisible: true, status: 'pending_generation', amount: 0 },
  { key: 'purchase_order', label: 'Purchase Order', buyerVisible: true, status: 'pending_generation', amount: 0 },
  { key: 'document_management', label: 'Document Management', buyerVisible: true, status: 'active', amount: 0 },
  { key: 'risk_detection', label: 'Risk Detection', buyerVisible: false, status: 'active', amount: 0 },
  { key: 'compliance', label: 'Compliance Screening', buyerVisible: false, status: 'active', amount: 0 },
  { key: 'seller_verification', label: 'Seller Verification Check', buyerVisible: false, status: 'active', amount: 0 },
  { key: 'fraud_detection', label: 'Fraud Detection', buyerVisible: false, status: 'active', amount: 0 },
  { key: 'tax_calculation', label: 'Tax Calculation', buyerVisible: false, status: 'active', amount: 0 },
  { key: 'invoice_generation', label: 'Invoice Generation', buyerVisible: false, status: 'pending_generation', amount: 0 },
  { key: 'payment_validation', label: 'Payment Validation', buyerVisible: false, status: 'active', amount: 0 },
];

async function getCommerceSettings() {
  const settings = await CommerceSettings.findOne({ key: 'default' }).lean();
  return {
    gstRate: Number(settings?.gstRate ?? 0.18),
  };
}

export async function buildCheckoutQuote({
  product,
  quantity = 1,
  orderType = 'bulk',
  orderSubType = 'direct_order',
  destination = {},
  selectedLogisticsKey,
  quotation,
  seller = {},
  userId,
  couponCodes = [],
  giftCardCode,
  liveLogisticsOptions = [],
} = {}) {
  const settings = await getCommerceSettings();
  const qty = Math.max(Number(quantity || 1), 1);
  const calculatedPrice = productPriceForQuantity(product, qty);
  const unitPrice = Number(quotation?.unitPrice || (orderType === 'sample' ? product?.samplePrice || product?.price : calculatedPrice.unitPrice) || 0);
  const originalUnitPrice = Number(quotation?.unitPrice || (orderType === 'sample' ? product?.samplePrice || product?.price : calculatedPrice.originalUnitPrice) || 0);
  const productTotal = Number(quotation?.totalPrice || unitPrice * qty || 0);
  const originalProductTotal = Number(quotation?.totalPrice || originalUnitPrice * qty || 0);

  const logisticsOptions = Array.isArray(liveLogisticsOptions)
    ? liveLogisticsOptions.filter(option => option && Number(option.amount ?? option.price) > 0)
    : [];

  const selectedLogistics = logisticsOptions.find((option) => option.key === selectedLogisticsKey) || logisticsOptions[0] || null;
  const rawLogisticsCharges = Number(selectedLogistics?.amount || 0);
  const promotions = await calculatePromotions({
    userId,
    product,
    seller,
    quantity: qty,
    productTotal,
    shipping: rawLogisticsCharges,
    couponCodes,
    giftCardCode,
    currency: product?.currency || quotation?.currency || 'INR',
    country: destination?.country,
  });
  const logisticsCharges = promotions.shippingAfterDiscount;
  const discountedProductTotal = promotions.productAfterDiscount;
  const taxableAmount = discountedProductTotal + logisticsCharges;
  const { platformFee, platformFeeRate, platformFeeSlab } = shouldApplyPlatformFee({ orderType, orderSubType })
    ? await calculatePlatformFeeFromSettings(taxableAmount)
    : { platformFee: 0, platformFeeRate: 0, platformFeeSlab: null };
  const gstAmount = Math.round((platformFee * settings.gstRate) * 100) / 100;
  const productSavings = Math.max(0, originalProductTotal - productTotal);
  const discount = roundMoney(productSavings + promotions.couponDiscount);
  const payableBeforeGiftCard = roundMoney(taxableAmount + platformFee + gstAmount);
  const grandTotal = roundMoney(Math.max(0, payableBeforeGiftCard - promotions.giftCardAmount));

  return {
    currency: product?.currency || quotation?.currency || 'INR',
    quantity: qty,
    originalUnitPrice,
    unitPrice,
    originalProductTotal,
    productTotal,
    logisticsOptions,
    selectedLogistics,
    logisticsCharges,
    platformFee,
    platformFeeRate,
    platformFeeSlab,
    gstRate: settings.gstRate,
    gstAmount,
    discount,
    productSavings: roundMoney(productSavings),
    couponDiscount: promotions.couponDiscount,
    giftCardAmount: promotions.giftCardAmount,
    savings: roundMoney(discount + promotions.giftCardAmount),
    appliedCoupon: promotions.appliedCoupons[0] || null,
    appliedCoupons: promotions.appliedCoupons,
    giftCard: promotions.giftCard,
    promotionSnapshot: promotions,
    grandTotal,
    automatedServices: AUTOMATED_PLATFORM_SERVICES,
  };
}
