import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import Seller from '../src/models/Seller.js';
import { checkoutShipmentForProduct, productHsCode, requireProductShippingData } from '../src/lib/checkout-package.js';
import { getLiveCheckoutShipping } from '../src/lib/checkout-shipping.js';
import { sellerWithCheckoutPickup } from '../src/lib/checkout-seller-pickup.js';
import { sellerShippingCheckoutContext } from '../src/services/seller-shipping-setup.service.js';

await mongoose.connect(process.env.MONGODB_URI);
try {
  const seller = await Seller.findOne({ companyName: /urbanwood/i }).lean();
  if (!seller) throw new Error('UrbanWood seller was not found');
  const product = await Product.findOne({ sellerId: seller._id, status: { $in: ['published', 'active'] } }).lean();
  if (!product) throw new Error('No published UrbanWood product was found');
  const context = await sellerShippingCheckoutContext(seller._id);
  const checkoutSeller = await sellerWithCheckoutPickup(seller, context.pickupAddress);
  const shipment = requireProductShippingData(product, checkoutShipmentForProduct(product, {
    description: product.name, declaredValue: Number(product.price || 0), currency: product.currency || 'INR',
    hsCode: productHsCode(product), countryOfOrigin: product.countryOfOrigin,
  }, 1));
  const result = await getLiveCheckoutShipping({
    userId: seller.userId,
    seller: checkoutSeller,
    destination: { contactName: 'Checkout QA', phone: '9999999999', line1: 'Vrindavan', city: 'Vrindavan', state: 'Uttar Pradesh', postalCode: '281121', country: 'India', countryCode: 'IN' },
    shipment,
    requestId: `checkout-qa-${Date.now()}`,
    providerMappings: context.providerMappings,
  });
  console.log(JSON.stringify({
    product: product.name,
    destination: 'Vrindavan 281121',
    readiness: context.readiness,
    tiers: result.options.map(option => ({ key: option.key, label: option.label, amount: option.amount, currency: option.currency, eta: option.eta, bookingAvailable: option.bookingAvailable })),
    bookingAttempted: false,
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
