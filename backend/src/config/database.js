import mongoose from 'mongoose';
import { config } from './env.js';

let isConnected = false;
let listenersAttached = false;

export async function connectToDatabase() {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  try {
    await mongoose.connect(config.mongodbUri, {
      maxPoolSize: config.mongoMaxPoolSize,
      minPoolSize: config.mongoMinPoolSize,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      family: 4,
    });

    isConnected = true;
    attachConnectionListeners();
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  isConnected = false;
}

function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
    isConnected = false;
  });

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
    isConnected = true;
  });
}

export async function warmupDatabase() {
  if (config.nodeEnv === 'test' || process.env.SKIP_DB_WARMUP === 'true') {
    return;
  }

  console.log('Pre-warming database queries...');

  try {
    const { default: ProductService } = await import('../services/product.service.js');

    await Promise.all([
      ProductService.getProducts({ page: 1, limit: 3 }),
      ProductService.getProducts({ page: 1, limit: 12 }),
      ProductService.getProducts({ type: 'categories' }),
    ]);

    console.log('Database warmup complete');
  } catch (err) {
    console.error('Database warmup failed:', err.message);
  }
}
