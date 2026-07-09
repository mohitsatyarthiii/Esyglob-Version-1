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
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    quotation = await checkoutRepository.findQuotationWithProduct(body.quotationId);
    product = quotation?.productId || null;
  }

  if (!product && body.productId) {
    if (!mongoose.Types.ObjectId.isValid(body.productId)) {
      const error = new Error('Product not found');
      error.statusCode = 404;
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

  return { quote };
}