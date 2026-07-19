// scripts/seed.js
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import KnowledgeDocument from '../src/models/knowledgeDocument.js';
import knowledgeDocuments from './seedData.js';
import dotenv from 'dotenv';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/esyglob';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function seedDatabase() {
  try {
    // DROP THE PROBLEMATIC INDEX FIRST
    try {
      await KnowledgeDocument.collection.dropIndex("status_1_targetRoles_1_intentTags_1_priority_-1");
      console.log('✅ Dropped problematic index');
    } catch (error) {
      console.log('ℹ️  Index not found or already dropped');
    }

    const count = await KnowledgeDocument.countDocuments();
    console.log(`📊 Current documents in collection: ${count}`);
    
    if (count > 0) {
      console.log(`⚠️  Database already contains ${count} knowledge documents.`);
      
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const clearData = await new Promise((resolve) => {
        rl.question('Do you want to clear existing data and re-seed? (y/n): ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y');
        });
      });

      if (!clearData) {
        console.log('ℹ️  Seeding cancelled. Existing data preserved.');
        return { insertedCount: 0, errors: [] };
      }

      console.log('🗑️  Clearing existing documents...');
      await KnowledgeDocument.deleteMany({});
      console.log('✅ Existing documents cleared.');
    }

    console.log(`📝 Inserting ${knowledgeDocuments.length} knowledge documents...`);
    
    let insertedCount = 0;
    const errors = [];
    
    for (let i = 0; i < knowledgeDocuments.length; i++) {
      try {
        const doc = new KnowledgeDocument(knowledgeDocuments[i]);
        await doc.save();
        insertedCount++;
        
        if ((i + 1) % 10 === 0 || i === knowledgeDocuments.length - 1) {
          console.log(`   Progress: ${i + 1}/${knowledgeDocuments.length} documents processed`);
        }
      } catch (error) {
        errors.push({
          index: i,
          title: knowledgeDocuments[i].title,
          slug: knowledgeDocuments[i].slug,
          error: error.message
        });
        console.log(`   ❌ Failed at index ${i}: ${knowledgeDocuments[i].title} - ${error.message}`);
      }
    }

    console.log(`\n✅ Successfully inserted ${insertedCount} documents.`);
    
    if (errors.length > 0) {
      console.log(`\n⚠️  ${errors.length} documents failed to insert:`);
      errors.forEach((err, idx) => {
        if (idx < 5) {
          console.log(`   ${idx + 1}. ${err.title} (${err.slug})`);
          console.log(`      Error: ${err.error}`);
        }
      });
      if (errors.length > 5) {
        console.log(`   ... and ${errors.length - 5} more errors`);
      }
    }
    
    console.log('\n📊 Seeding Summary:');
    console.log(`   Total documents attempted: ${knowledgeDocuments.length}`);
    console.log(`   Successfully inserted: ${insertedCount}`);
    console.log(`   Failed: ${errors.length}`);
    
    return { insertedCount, errors };
  } catch (error) {
    console.error('❌ Error during seeding:', error.message);
    throw error;
  }
}

async function run() {
  try {
    await connectDB();
    await seedDatabase();
    console.log('\n🎉 Seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n⚠️  Seeding interrupted by user');
  process.exit(0);
});

run();