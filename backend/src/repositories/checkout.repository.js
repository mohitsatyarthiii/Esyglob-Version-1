import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Quotation from '../models/Quotation.js';
import Seller from '../models/Seller.js';

export async function findQuotationWithProduct(quotationId) {
  return Quotation.findById(quotationId)
    .select('productId unitPrice totalPrice currency')
    .populate({ path: 'productId', select: 'sellerId name price samplePrice currency countryOfOrigin hsCodes packaging' })
    .lean()
    .exec();
}

export async function findProductById(productId) {
  return Product.findById(productId)
    .select('sellerId name price samplePrice currency countryOfOrigin hsCodes packaging')
    .lean()
    .exec();
}

export async function findSellerById(sellerId) {
  return Seller.findById(sellerId)
    .select('userId address shippingAddress companyName businessPhone businessEmail gstNumber')
    .lean()
    .exec();
}
