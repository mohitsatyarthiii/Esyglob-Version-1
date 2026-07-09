// scripts/createProductIndexes.js
import Product from '../src/models/Product.js';
import Seller from '../src/models/Seller.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function createIndexes() {
  try {
    // Check MongoDB URI
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;
    
    if (!mongoURI) {
      console.error('❌ MongoDB URI not found in environment variables!');
      console.error('Please check your .env file for:');
      console.error('  - MONGODB_URI');
      console.error('  - MONGO_URI');
      console.error('  - DB_URI');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');

    console.log('\nCreating product indexes...\n');

    // Product indexes
    const productIndexes = [
      {
        spec: { status: 1, sellerId: 1, category: 1, createdAt: -1 },
        options: { name: 'idx_public_listing', background: true }
      },
      {
        spec: { status: 1, sellerId: 1, price: 1 },
        options: { name: 'idx_price_sort', background: true }
      },
      {
        spec: { sellerId: 1, status: 1, createdAt: -1 },
        options: { name: 'idx_seller_products', background: true }
      },
      {
        spec: { slug: 1 },
        options: { name: 'idx_slug_lookup', unique: true, sparse: true, background: true }
      },
      {
        spec: { name: 'text', tags: 'text', category: 'text', subcategory: 'text' },
        options: { 
          name: 'idx_text_search', 
          background: true, 
          weights: { name: 10, tags: 5, category: 3, subcategory: 2 } 
        }
      },
      {
        spec: { category: 1, status: 1 },
        options: { name: 'idx_category_status', background: true }
      }
    ];

    // Create product indexes
    for (const index of productIndexes) {
      try {
        await Product.collection.createIndex(index.spec, index.options);
        console.log(`✅ Created index: ${index.options.name}`);
      } catch (error) {
        if (error.code === 85) {
          console.log(`⚠️  Index ${index.options.name} already exists with different options, skipping...`);
        } else {
          console.log(`❌ Error creating ${index.options.name}: ${error.message}`);
        }
      }
    }

    // Seller indexes
    const sellerIndexes = [
      {
        spec: { isVerified: 1, isActive: 1, isSuspended: 1 },
        options: { name: 'idx_verified_sellers', background: true }
      },
      {
        spec: { userId: 1 },
        options: { name: 'idx_seller_user', background: true }
      }
    ];

    console.log('\nCreating seller indexes...\n');

    // Create seller indexes
    for (const index of sellerIndexes) {
      try {
        await Seller.collection.createIndex(index.spec, index.options);
        console.log(`✅ Created index: ${index.options.name}`);
      } catch (error) {
        if (error.code === 85) {
          console.log(`⚠️  Index ${index.options.name} already exists with different options, skipping...`);
        } else {
          console.log(`❌ Error creating ${index.options.name}: ${error.message}`);
        }
      }
    }

    // Show existing indexes
    console.log('\n📊 Current Product Indexes:');
    const productExistingIndexes = await Product.collection.indexes();
    productExistingIndexes.forEach(index => {
      console.log(`  - ${index.name}`);
    });

    console.log('\n📊 Current Seller Indexes:');
    const sellerExistingIndexes = await Seller.collection.indexes();
    sellerExistingIndexes.forEach(index => {
      console.log(`  - ${index.name}`);
    });

    console.log('\n✅ All indexes created successfully!');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

// Run the script
console.log('🚀 Starting index creation...\n');
createIndexes();