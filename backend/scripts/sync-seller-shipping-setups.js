import 'dotenv/config';
import mongoose from 'mongoose';
import Seller from '../src/models/Seller.js';
import { sellerPickup, synchronizeSellerShippingSetup } from '../src/services/seller-shipping-setup.service.js';

const execute = process.argv.includes('--execute');
const register = process.argv.includes('--register');
await mongoose.connect(process.env.MONGODB_URI);
const sellers = await Seller.find({ isActive: { $ne: false } }).select('_id companyName').lean();
const summary = { mode: execute ? register ? 'register' : 'synchronize' : 'dry-run', sellers: sellers.length, valid: 0, invalid: 0, ready: 0, partial: 0, pending: 0, failed: 0 };
for (const seller of sellers) {
  if (!execute) {
    const { address } = await sellerPickup(seller._id);
    const valid = Boolean(address.line1 && address.city && address.state && /^\d{6}$/.test(address.postalCode) && address.phone && address.email);
    summary[valid ? 'valid' : 'invalid'] += 1;
    continue;
  }
  const setup = await synchronizeSellerShippingSetup(seller._id, { register });
  summary[setup.readiness] = Number(summary[setup.readiness] || 0) + 1;
}
console.log(JSON.stringify(summary, null, 2));
await mongoose.disconnect();
