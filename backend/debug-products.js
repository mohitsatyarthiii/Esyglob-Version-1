// debug-products.js
// Run: node debug-products.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}

async function debugProductQuery() {
  console.log('🔍 DEBUG: Product API Performance Breakdown\n');
  console.log('═'.repeat(60));

  // ===== STEP 1: Connect =====
  const connectStart = Date.now();
  await mongoose.connect(MONGO_URI);
  const connectTime = Date.now() - connectStart;
  console.log(`📡 MongoDB Connection:       ${connectTime}ms`);

  const db = mongoose.connection.db;
  const collection = db.collection('products');

  // ===== STEP 2: Count total products =====
  const countStart = Date.now();
  const totalProducts = await collection.countDocuments({});
  const countTime = Date.now() - countStart;
  console.log(`📊 Total Products in DB:      ${totalProducts} (took ${countTime}ms)`);

  // ===== STEP 3: Check isVerifiedSeller field =====
  const fieldCheckStart = Date.now();
  const sampleProduct = await collection.findOne({}, { projection: { isVerifiedSeller: 1, name: 1 } });
  const fieldCheckTime = Date.now() - fieldCheckStart;
  console.log(`🏷️  isVerifiedSeller exists:   ${sampleProduct?.isVerifiedSeller !== undefined ? '✅ YES' : '❌ NO'}`);
  console.log(`   Sample product: ${sampleProduct?.name?.substring(0, 40) || 'N/A'}... (took ${fieldCheckTime}ms)`);

  // ===== STEP 4: Count with filter =====
  const filterCountStart = Date.now();
  const publicCount = await collection.countDocuments({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  });
  const filterCountTime = Date.now() - filterCountStart;
  console.log(`📊 Public products count:     ${publicCount} (took ${filterCountTime}ms)`);

  // ===== STEP 5: EXPLAIN the query =====
  console.log('\n' + '═'.repeat(60));
  console.log('📋 EXPLAIN PLAN (how MongoDB runs the query):\n');

  const explainStart = Date.now();
  const explainResult = await collection.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .sort({ createdAt: -1 })
  .limit(12)
  .explain('executionStats');
  const explainTime = Date.now() - explainStart;

  // Extract key info
  const winningPlan = explainResult?.queryPlanner?.winningPlan;
  const execStats = explainResult?.executionStats;

  console.log(`⏱️  EXPLAIN query took:        ${explainTime}ms`);
  console.log(`📊 Execution time (MongoDB):  ${execStats?.executionTimeMillis || 'N/A'}ms`);
  console.log(`📄 Documents examined:        ${execStats?.totalDocsExamined || 'N/A'}`);
  console.log(`📄 Documents returned:        ${execStats?.nReturned || 'N/A'}`);
  console.log(`📄 Keys examined:             ${execStats?.totalKeysExamined || 'N/A'}`);

  // Find the winning stage
  function findStage(stage, targetStage) {
    if (!stage) return null;
    if (stage.stage === targetStage) return stage;
    if (stage.inputStage) return findStage(stage.inputStage, targetStage);
    if (stage.inputStages) {
      for (const s of stage.inputStages) {
        const found = findStage(s, targetStage);
        if (found) return found;
      }
    }
    return null;
  }

  const ixscanStage = findStage(winningPlan, 'IXSCAN');
  const collscanStage = findStage(winningPlan, 'COLLSCAN');
  const fetchStage = findStage(winningPlan, 'FETCH');
  const sortStage = findStage(winningPlan, 'SORT');

  if (ixscanStage) {
    console.log(`\n✅ USING INDEX: ${ixscanStage.indexName}`);
    console.log(`   Direction: ${ixscanStage.direction}`);
  } else if (collscanStage) {
    console.log(`\n❌ COLLECTION SCAN (no index used!) — THIS IS SLOW`);
    console.log(`   Filter: ${JSON.stringify(collscanStage.filter)}`);
  }

  if (fetchStage) {
    console.log(`\n📌 FETCH stage present: ${fetchStage.stage}`);
  }

  if (sortStage) {
    console.log(`\n⚠️  SORT stage present — sorting in memory (slow)`);
  } else {
    console.log(`\n✅ No SORT stage — index covers the sort (fast)`);
  }

  // ===== STEP 6: Actual query with timing =====
  console.log('\n' + '═'.repeat(60));
  console.log('⚡ ACTUAL QUERY TIMING:\n');

  // Query 1: Just the find
  const findStart = Date.now();
  const products = await collection.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(12)
  .toArray();
  const findTime = Date.now() - findStart;
  console.log(`🔍 MongoDB find() only:       ${findTime}ms`);
  console.log(`   Results returned:           ${products.length}`);

  // Query 2: find + countDocuments (parallel - like your API does)
  const parallelStart = Date.now();
  const [parallelProducts, parallelCount] = await Promise.all([
    collection.find({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
    .project({ name: 1, images: 1, price: 1, unit: 1, minimumOrderQuantity: 1, category: 1, subcategory: 1, averageRating: 1, sellerId: 1 })
    .sort({ createdAt: -1 })
    .skip(0)
    .limit(12)
    .toArray(),
    collection.countDocuments({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
  ]);
  const parallelTime = Date.now() - parallelStart;
  console.log(`\n🔍 find + count (parallel):    ${parallelTime}ms`);
  console.log(`   Results:                    ${parallelProducts.length}`);
  console.log(`   Total count:                ${parallelCount}`);

  // Query 3: Same query 3 times to check consistency
  console.log('\n📊 CONSISTENCY CHECK (3 runs):');
  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    await collection.find({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
    .sort({ createdAt: -1 })
    .skip(0)
    .limit(12)
    .toArray();
    const time = Date.now() - start;
    console.log(`   Run ${i}: ${time}ms`);
  }

  // ===== STEP 7: Check indexes =====
  console.log('\n' + '═'.repeat(60));
  console.log('📑 EXISTING INDEXES on products:\n');

  const indexes = await collection.indexes();
  const relevantIndexes = indexes.filter(idx => 
    idx.name?.includes('verified') || 
    idx.name?.includes('public') ||
    idx.name?.includes('seller') ||
    idx.key?.isVerifiedSeller !== undefined
  );

  if (relevantIndexes.length > 0) {
    relevantIndexes.forEach(idx => {
      console.log(`   ✅ ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
  } else {
    console.log('   ❌ No isVerifiedSeller or public listing indexes found!');
    console.log('   Run the index creation commands from the optimization plan.');
  }

  // ===== SUMMARY =====
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY:');
  console.log('═'.repeat(60));
  console.log(`Total products in DB:         ${totalProducts}`);
  console.log(`Public (verified) products:   ${publicCount}`);
  console.log(`MongoDB execution time:       ${execStats?.executionTimeMillis || 'N/A'}ms`);
  console.log(`Documents examined:           ${execStats?.totalDocsExamined || 'N/A'}`);
  console.log(`Index used:                   ${ixscanStage ? '✅ ' + ixscanStage.indexName : '❌ NONE (COLLSCAN)'}`);
  console.log(`Sort in memory:               ${sortStage ? '⚠️ YES (slow)' : '✅ NO (fast)'}`);
  console.log(`Actual find() time:           ${findTime}ms`);
  console.log(`Parallel find+count time:     ${parallelTime}ms`);

  if (!ixscanStage || execStats?.totalDocsExamined > execStats?.nReturned * 2) {
    console.log('\n⚠️  RECOMMENDATIONS:');
    if (!ixscanStage) {
      console.log('   1. Run index creation commands (see optimization plan)');
    }
    if (execStats?.totalDocsExamined > execStats?.nReturned * 2) {
      console.log('   2. MongoDB is scanning more docs than needed — index may be wrong');
    }
    if (sortStage) {
      console.log('   3. Add sort field to compound index to avoid in-memory sorting');
    }
  } else {
    console.log('\n✅ Query looks optimized at MongoDB level!');
    console.log('   If API is still slow, check:');
    console.log('   - Network latency between app server and MongoDB');
    console.log('   - Express middleware overhead');
    console.log('   - Response serialization time');
  }

  console.log('\n' + '═'.repeat(60));
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

debugProductQuery().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});