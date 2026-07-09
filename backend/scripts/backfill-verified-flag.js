// scripts/backfill-verified-flag.js
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import Seller from '../src/models/Seller.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all verified, active, non-suspended sellers
    const verifiedSellers = await Seller.find(
      { isVerified: true, isActive: true, isSuspended: { $ne: true } },
      '_id'
    ).lean();

    const verifiedIds = verifiedSellers.map(s => s._id);
    console.log(`Found ${verifiedIds.length} verified sellers`);

    // Mark verified sellers' products
    const result1 = await Product.updateMany(
      { sellerId: { $in: verifiedIds } },
      { $set: { isVerifiedSeller: true } }
    );
    console.log(`Set isVerifiedSeller=true for ${result1.modifiedCount} products`);

    // Mark all other products as false
    const result2 = await Product.updateMany(
      { sellerId: { $nin: verifiedIds } },
      { $set: { isVerifiedSeller: false } }
    );
    console.log(`Set isVerifiedSeller=false for ${result2.modifiedCount} products`);

    console.log('✅ Backfill complete');
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();