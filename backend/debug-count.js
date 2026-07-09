// debug-count.js
// Run: node debug-count.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function checkCount() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Native driver collection use karo
  const db = mongoose.connection.db;
  const collection = db.collection('products');

  console.log('📊 COUNT EXPLAIN:\n');

  // ===== 1: countDocuments explain =====
  const countExplainStart = Date.now();
  const countExplain = await db.command({
    explain: {
      count: 'products',
      query: {
        status: { $in: ['active', 'published'] },
        isVerifiedSeller: true
      }
    },
    verbosity: 'executionStats'
  });
  const countExplainTime = Date.now() - countExplainStart;
  
  console.log('1️⃣ countDocuments Explain:');
  console.log(`   Time to explain:          ${countExplainTime}ms`);
  console.log(`   Execution time:           ${countExplain?.executionStats?.executionTimeMillis || 'N/A'}ms`);
  console.log(`   Documents examined:       ${countExplain?.executionStats?.totalDocsExamined || 'N/A'}`);
  console.log(`   Stage:                    ${countExplain?.queryPlanner?.winningPlan?.stage || 'N/A'}`);
  
  const countIxscan = countExplain?.queryPlanner?.winningPlan?.inputStage;
  if (countIxscan?.stage === 'IXSCAN') {
    console.log(`   ✅ Index used:             ${countIxscan.indexName}`);
  } else {
    console.log(`   ❌ No index used for count!`);
  }

  // ===== 2: Actual countDocuments timing =====
  console.log('\n2️⃣ Actual countDocuments timing (3 runs):');
  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    const count = await collection.countDocuments({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    });
    const time = Date.now() - start;
    console.log(`   Run ${i}: ${count} documents, ${time}ms`);
  }

  // ===== 3: estimatedDocumentCount (fast alternative) =====
  console.log('\n3️⃣ estimatedDocumentCount (approximate):');
  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    const estCount = await collection.estimatedDocumentCount();
    const time = Date.now() - start;
    console.log(`   Run ${i}: ${estCount} documents, ${time}ms`);
  }

  // ===== 4: find() + count separately vs parallel =====
  console.log('\n4️⃣ Parallel find + count vs Sequential:');
  
  // Sequential
  const seqStart = Date.now();
  const seqProducts = await collection.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .sort({ createdAt: -1 })
  .limit(12)
  .toArray();
  const seqCount = await collection.countDocuments({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  });
  const seqTime = Date.now() - seqStart;
  console.log(`   Sequential:               ${seqTime}ms (find: ${seqProducts.length} results, count: ${seqCount})`);

  // Parallel
  const parStart = Date.now();
  const [parProducts, parCount] = await Promise.all([
    collection.find({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray(),
    collection.countDocuments({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
  ]);
  const parTime = Date.now() - parStart;
  console.log(`   Parallel:                 ${parTime}ms (find: ${parProducts.length} results, count: ${parCount})`);

  // ===== SUMMARY =====
  console.log('\n' + '═'.repeat(60));
  console.log('📊 DIAGNOSIS:');
  console.log('═'.repeat(60));

  const countExecutionTime = countExplain?.executionStats?.executionTimeMillis || 999;
  
  if (countExecutionTime > 50) {
    console.log('🔴 countDocuments is SLOW (MongoDB execution > 50ms)');
    console.log('   → Replace with estimatedDocumentCount() for pagination');
    console.log('   → Or add compound index: { isVerifiedSeller: 1, status: 1 }');
  } else {
    console.log('🟢 countDocuments MongoDB execution is fast');
    console.log('   → Slowness is network latency, not query');
  }

  if (parTime - seqTime > 20) {
    console.log('🔴 Parallel find+count is SLOWER than sequential');
    console.log('   → Possible connection pool exhaustion');
  }

  console.log('\n💡 RECOMMENDATION:');
  console.log('   Use estimatedDocumentCount() for pagination total');
  console.log('   Exact count matters less than speed for UX');

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected');
}

checkCount().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});