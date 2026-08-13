import mongoose from 'mongoose';
import * as checkoutRepository from '../repositories/checkout.repository.js';
import { buildCheckoutQuote } from '../lib/checkout-quote.js';
import { getLiveCheckoutShipping, isIndianAddress } from '../lib/checkout-shipping.js';
import { checkoutShipmentForProduct, requireProductShippingData } from '../lib/checkout-package.js';
import { sellerWithCheckoutPickup } from '../lib/checkout-seller-pickup.js';

export async function getCheckoutQuote(session, body) {
  const quantity = Math.max(Number(body.quantity || 1), 1);
  let product = null;
  let quotation = null;

  // Resolve product from quotation or direct productId
  if (body.quotationId) {
    if (!mongoose.Types.ObjectId.isValid(body.quotationId)) {
      const error = new Error('Invalid quotation ID');
      error.statusCode = 422;
      throw error;
    }

    quotation = await checkoutRepository.findQuotationWithProduct(body.quotationId);
    
    if (!quotation) {
      const error = new Error('Quotation not found');
      error.statusCode = 404;
      throw error;
    }

    product = quotation?.productId || null;
  }

  if (!product && body.productId) {
    if (!mongoose.Types.ObjectId.isValid(body.productId)) {
      const error = new Error('Invalid product ID');
      error.statusCode = 422;
      throw error;
    }

    product = await checkoutRepository.findProductById(body.productId);
  }

  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  // Resolve seller
  const sellerId = product?.sellerId?._id || product?.sellerId;
  const sellerRecord = sellerId
    ? await checkoutRepository.findSellerById(sellerId)
    : null;
  const seller = await sellerWithCheckoutPickup(sellerRecord || {});

  let shipping = { options: [], providerStatuses: [] };
  let shippingError = null;
  try {
    if (!isIndianAddress(body.destination || {})) {
      shipping = { routeType: 'international_unsupported', internationalUnsupported: true, options: [], providerStatuses: [] };
    } else {
      const productShipment = requireProductShippingData(product, checkoutShipmentForProduct(product, {
        description: product.name,
        declaredValue: Number(product.price || 0) * quantity,
        currency: product.currency || 'INR',
        hsCode: product.hsCode,
        countryOfOrigin: product.countryOfOrigin,
      }, quantity));
      shipping = await getLiveCheckoutShipping({
        userId: session._id || session.id,
        seller: seller || {},
        destination: body.destination || {},
        shipment: productShipment,
        requestId: body.requestId || '',
      });
    }
  } catch (error) {
    shippingError = { code: error.code || 'SHIPPING_RATES_UNAVAILABLE', message: error.message, fieldErrors: error.fieldErrors || null };
  }

  const quote = await buildCheckoutQuote({
    product,
    seller,
    quotation,
    quantity,
    orderType: body.orderType || 'bulk',
    orderSubType: body.orderSubType || 'direct_order',
    destination: body.destination || {},
    selectedLogisticsKey: body.logisticsOption,
    userId: session._id || session.id,
    couponCodes: body.couponCodes || body.couponCode,
    giftCardCode: body.giftCardCode,
    liveLogisticsOptions: shipping.options,
  });

  // Return standardized response
  return {
    success: true,
    quote: {
      currency: quote.currency || 'INR',
      quantity: quote.quantity,
      unitPrice: quote.unitPrice,
      originalUnitPrice: quote.originalUnitPrice,
      originalProductTotal: quote.originalProductTotal,
      productTotal: quote.productTotal,
      logisticsOptions: quote.logisticsOptions || [],
      selectedLogistics: quote.selectedLogistics || null,
      logisticsCharges: quote.logisticsCharges || 0,
      platformFee: quote.platformFee || 0,
      platformFeeRate: quote.platformFeeRate || 0,
      gstRate: quote.gstRate || 0.18,
      gstAmount: quote.gstAmount || 0,
      discount: quote.discount || 0,
      productSavings: quote.productSavings || 0,
      couponDiscount: quote.couponDiscount || 0,
      giftCardAmount: quote.giftCardAmount || 0,
      savings: quote.savings || 0,
      appliedCoupon: quote.appliedCoupon || null,
      appliedCoupons: quote.appliedCoupons || [],
      giftCard: quote.giftCard || null,
      grandTotal: quote.grandTotal || quote.productTotal || 0,
      automatedServices: quote.automatedServices || [],
      providerStatuses: shipping.providerStatuses || [],
      internationalUnsupported: shipping.internationalUnsupported === true,
      shippingError,
      subtotal: quote.productTotal || 0,
      totalAmount: quote.grandTotal || quote.productTotal || 0,
    },
  };
}
