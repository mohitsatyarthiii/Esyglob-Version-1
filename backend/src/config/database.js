import mongoose from 'mongoose';
import { config } from './env.js';

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) return;

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  try {
    await mongoose.connect(config.mongodbUri, {
      maxPoolSize: 10,
      minPoolSize: 5,              // ← 2 se 5 (pre-establish connections)
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
       family: 4,                  // ← Force IPv4 (faster DNS)
    });

    isConnected = true;
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }

  mongoose.connection.on('error', (error) => {
    console.error('❌ MongoDB connection error:', error);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
    isConnected = false;
  });
}

/**
 * Pre-warm database connections & product cache
 * Call AFTER connectToDatabase(), BEFORE app.listen()
 */
export async function warmupDatabase() {
  console.log('🔥 Pre-warming database...');

  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const { default: ProductService } = await import('../services/product.service.js');

    console.log('   → Fetching page 1 (limit 3)...');
    const r1 = await ProductService.getProducts({ page: 1, limit: 3 });
    console.log(`   ✓ Got ${r1.products?.length} products`);

    console.log('   → Fetching page 1 (limit 12)...');
    const r2 = await ProductService.getProducts({ page: 1, limit: 12 });
    console.log(`   ✓ Got ${r2.products?.length} products`);

    console.log('   → Fetching categories...');
    const r3 = await ProductService.getProducts({ type: 'categories' });
    console.log(`   ✓ Got ${r3.categories?.length} categories`);

    console.log('✅ Pre-warmed all queries');
  } catch (err) {
    console.error('❌ Pre-warm FAILED:', err.message);
    console.error('   Stack:', err.stack?.split('\n').slice(0, 3).join('\n'));
  }
}