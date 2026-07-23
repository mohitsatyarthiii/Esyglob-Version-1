// delete-all-rfqs-quotations.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Apna MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/esyglob';

// Models import karo (apne project structure ke hisaab se adjust karo)
let RFQ, Quotation, RFQMessage, Negotiation;

try {
  // Relative path se import karo
  const rfqModule = await import('../src/models/RFQ.js');
  const quotationModule = await import('../src/models/Quotation.js');
  RFQ = rfqModule.default;
  Quotation = quotationModule.default;
} catch (error) {
  console.log('⚠️  Unable to import models directly, will try to use mongoose models');
}

// Dry run mode check karo
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// User se confirmation lene ke liye function
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

// Collection list karne ka function
async function listCollections() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  return collections.map(col => col.name);
}

// Specific collections me se rfq/quotation related documents count karo
async function countRelatedDocuments() {
  const counts = {};
  const db = mongoose.connection.db;
  
  try {
    // RFQs count
    const rfqCount = await db.collection('rfqs').countDocuments();
    counts.rfqs = rfqCount;
  } catch (e) { counts.rfqs = 0; }

  try {
    // Quotations count
    const quotationCount = await db.collection('quotations').countDocuments();
    counts.quotations = quotationCount;
  } catch (e) { counts.quotations = 0; }

  try {
    // RFQ Messages count
    const rfqMessagesCount = await db.collection('rfqmessages').countDocuments();
    counts.rfqMessages = rfqMessagesCount;
  } catch (e) { counts.rfqMessages = 0; }

  try {
    // Negotiations count
    const negotiationsCount = await db.collection('negotiations').countDocuments();
    counts.negotiations = negotiationsCount;
  } catch (e) { counts.negotiations = 0; }

  return counts;
}

// Main delete function
async function deleteAllRFQsAndQuotations() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('✅ Database connected successfully\n');

    // Sab collections list karo
    const allCollections = await listCollections();
    console.log('📚 Available collections:', allCollections.join(', '), '\n');

    // Documents count karo
    console.log('🔍 Counting documents...');
    const counts = await countRelatedDocuments();
    
    console.log('\n📊 Current Document Counts:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 RFQs: ${counts.rfqs}`);
    console.log(`📋 Quotations: ${counts.quotations}`);
    console.log(`📨 RFQ Messages: ${counts.rfqMessages}`);
    console.log(`🤝 Negotiations: ${counts.negotiations}`);
    const totalDocuments = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Total Documents: ${totalDocuments}`);
    console.log('');

    if (totalDocuments === 0) {
      console.log('✅ No documents found to delete!');
      return;
    }

    // Dry run mode
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE - No documents will be deleted');
      console.log('📝 Run without --dry-run flag to actually delete\n');
      return;
    }

    // Warning message
    console.log('⚠️  WARNING: This action is IRREVERSIBLE!');
    console.log('⚠️  Make sure you have taken a database backup!\n');

    // Delete karne se pehle type karna padega "DELETE" confirm karne ke liye
    const confirmation = await askConfirmation(
      `Type "DELETE" to confirm deletion of ${totalDocuments} documents: `
    );

    if (confirmation !== 'delete') {
      console.log('\n❌ Deletion cancelled. No documents were deleted.');
      return;
    }

    console.log('\n🗑️  Starting deletion process...\n');
    
    const results = {
      rfqs: 0,
      quotations: 0,
      rfqMessages: 0,
      negotiations: 0
    };

    const db = mongoose.connection.db;

    // Delete in order (child documents first)
    
    // 1. RFQ Messages delete karo
    try {
      if (allCollections.includes('rfqmessages')) {
        const result = await db.collection('rfqmessages').deleteMany({});
        results.rfqMessages = result.deletedCount;
        console.log(`📨 RFQ Messages deleted: ${results.rfqMessages}`);
      } else {
        console.log('⚠️  rfqmessages collection not found, skipping...');
      }
    } catch (error) {
      console.log(`❌ Error deleting rfq messages: ${error.message}`);
    }

    // 2. Negotiations delete karo
    try {
      if (allCollections.includes('negotiations')) {
        const result = await db.collection('negotiations').deleteMany({});
        results.negotiations = result.deletedCount;
        console.log(`🤝 Negotiations deleted: ${results.negotiations}`);
      } else {
        console.log('⚠️  negotiations collection not found, skipping...');
      }
    } catch (error) {
      console.log(`❌ Error deleting negotiations: ${error.message}`);
    }

    // 3. Quotations delete karo
    try {
      if (allCollections.includes('quotations')) {
        const result = await db.collection('quotations').deleteMany({});
        results.quotations = result.deletedCount;
        console.log(`📋 Quotations deleted: ${results.quotations}`);
      } else {
        console.log('⚠️  quotations collection not found, skipping...');
      }
    } catch (error) {
      console.log(`❌ Error deleting quotations: ${error.message}`);
    }

    // 4. RFQs delete karo
    try {
      if (allCollections.includes('rfqs')) {
        const result = await db.collection('rfqs').deleteMany({});
        results.rfqs = result.deletedCount;
        console.log(`📦 RFQs deleted: ${results.rfqs}`);
      } else {
        console.log('⚠️  rfqs collection not found, skipping...');
      }
    } catch (error) {
      console.log(`❌ Error deleting rfqs: ${error.message}`);
    }

    // Summary
    console.log('\n📊 Deletion Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 RFQs: ${results.rfqs}`);
    console.log(`📋 Quotations: ${results.quotations}`);
    console.log(`📨 RFQ Messages: ${results.rfqMessages}`);
    console.log(`🤝 Negotiations: ${results.negotiations}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━');
    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`📊 Total Deleted: ${totalDeleted}`);
    console.log('\n✅ All RFQs and Quotations deleted successfully!');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n👋 Database connection closed');
    }
    process.exit(0);
  }
}

// Script run karo
console.log('🚀 RFQ & Quotation Deletion Script');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

deleteAllRFQsAndQuotations();