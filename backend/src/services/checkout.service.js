import mongoose from 'mongoose';
import * as checkoutRepository from '../repositories/checkout.repository.js';
import { buildCheckoutQuote } from '../lib/checkout-quote.js';

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
  const seller = sellerId
    ? await checkoutRepository.findSellerById(sellerId)
    : null;

  const quote = await buildCheckoutQuote({
    product,
    seller,
    quotation,
    quantity,
    orderType: body.orderType || 'bulk',
    orderSubType: body.orderSubType || 'direct_order',
    destination: body.destination || {},
    selectedLogisticsKey: body.logisticsOption,
  });

  // Return standardized response
  return {
    success: true,
    quote: {
      currency: quote.currency || 'INR',
      quantity: quote.quantity,
      unitPrice: quote.unitPrice,
      productTotal: quote.productTotal,
      logisticsOptions: quote.logisticsOptions || [],
      selectedLogistics: quote.selectedLogistics || null,
      logisticsCharges: quote.logisticsCharges || 0,
      platformFee: quote.platformFee || 0,
      platformFeeRate: quote.platformFeeRate || 0,
      gstRate: quote.gstRate || 0.18,
      gstAmount: quote.gstAmount || 0,
      discount: quote.discount || 0,
      grandTotal: quote.grandTotal || quote.productTotal || 0,
      automatedServices: quote.automatedServices || [],
      subtotal: quote.productTotal || 0,
      totalAmount: quote.grandTotal || quote.productTotal || 0,
    },
  };
}