import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function addIndexes() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // Products indexes
  await db.collection('products').createIndex({ status: 1, category: 1 });
  await db.collection('products').createIndex({ sellerId: 1, status: 1 });
  await db.collection('products').createIndex({ createdAt: -1 });
  await db.collection('products').createIndex({ averageRating: -1 });
  console.log('✅ Products indexes created');

  // Sellers indexes
  await db.collection('sellers').createIndex({ isVerified: 1, isActive: 1, isSuspended: 1 });
  console.log('✅ Sellers indexes created');

  console.log('✅ All indexes added');
  process.exit(0);
}

addIndexes().catch(err => {
  console.error(err);
  process.exit(1);
});