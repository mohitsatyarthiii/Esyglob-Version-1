// debug-api.js
// Run: node debug-api.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple .env locations
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, 'src', '.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error && process.env.MONGODB_URI) {
    console.log(`✅ Loaded .env from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded || !process.env.MONGODB_URI) {
  console.error('❌ MONGO_URI not found!');
  console.error('   Tried these paths:');
  envPaths.forEach(p => console.error(`   - ${p}`));
  console.error('\n   Set it manually:');
  console.error('   export MONGO_URI="your-connection-string"');
  console.error('   Then run: node debug-api.js');
  process.exit(1);
}

async function fullDebug() {
  console.log('\n🔬 FULL API REQUEST BREAKDOWN\n');
  console.log('═'.repeat(65));

  // ===== STEP 1: Connect =====
  const t0 = Date.now();
  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`📡 Connect:                  ${Date.now() - t0}ms`);

  const db = mongoose.connection.db;
  const collection = db.collection('products');

  // Need to register model if not already
  let Product;
  try {
    Product = mongoose.model('Product');
  } catch {
    // Import model schema if not registered
    const { default: ProductModel } = await import('./models/Product.js');
    Product = ProductModel;
  }

  // ===== STEP 2: Raw MongoDB find (native driver) =====
  const t1 = Date.now();
  const rawProducts = await collection.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .project({ name: 1, images: 1, price: 1, unit: 1, minimumOrderQuantity: 1, category: 1, subcategory: 1, averageRating: 1, sellerId: 1 })
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(12)
  .toArray();
  const rawTime = Date.now() - t1;
  console.log(`🗄️  Raw MongoDB find():       ${rawTime}ms (${rawProducts.length} docs)`);

  // ===== STEP 3: Count =====
  const t2 = Date.now();
  const count = await collection.countDocuments({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  });
  const countTime = Date.now() - t2;
  console.log(`🔢 Raw countDocuments():     ${countTime}ms (${count} total)`);

  // ===== STEP 4: Mongoose find (with .lean()) =====
  const t3 = Date.now();
  const mongooseProducts = await Product.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .select('name images price unit minimumOrderQuantity category subcategory averageRating sellerId')
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(12)
  .lean();
  const mongooseTime = Date.now() - t3;
  console.log(`🦦 Mongoose find().lean():   ${mongooseTime}ms (${mongooseProducts.length} docs)`);

  // ===== STEP 5: Mongoose find WITHOUT .lean() =====
  const t4 = Date.now();
  const mongooseFull = await Product.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .select('name images price unit minimumOrderQuantity category subcategory averageRating sellerId')
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(12);
  const mongooseFullTime = Date.now() - t4;
  console.log(`🦦 Mongoose find() NO lean:  ${mongooseFullTime}ms (${mongooseFull.length} docs)`);

  // ===== STEP 6: Formatting (map) =====
  const t5 = Date.now();
  const formatted = mongooseProducts.map(p => ({
    _id: p._id,
    name: p.name,
    image: p.images?.[0] || null,
    price: p.price,
    unit: p.unit,
    moq: p.minimumOrderQuantity,
    category: p.category,
    subcategory: p.subcategory,
    rating: p.averageRating || 0,
    verified: true,
  }));
  const formatTime = Date.now() - t5;
  console.log(`📦 Formatting (map):         ${formatTime}ms`);

  // ===== STEP 7: JSON.stringify =====
  const t6 = Date.now();
  const jsonStr = JSON.stringify({ products: formatted, total: count });
  const jsonTime = Date.now() - t6;
  console.log(`📝 JSON.stringify():         ${jsonTime}ms (${(jsonStr.length / 1024).toFixed(1)} KB)`);

  // ===== STEP 8: Sequential find + count (like our fix) =====
  const t7 = Date.now();
  const seqProducts = await Product.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  })
  .select('name images price unit minimumOrderQuantity category subcategory averageRating sellerId')
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(12)
  .lean();
  const seqCount = await collection.countDocuments({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true
  });
  const seqTime = Date.now() - t7;
  console.log(`\n🔗 Sequential find+count:    ${seqTime}ms`);

  // ===== STEP 9: Parallel find + count (old way) =====
  const t8 = Date.now();
  const [parProducts, parCount] = await Promise.all([
    Product.find({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
    .select('name images price unit minimumOrderQuantity category subcategory averageRating sellerId')
    .sort({ createdAt: -1 })
    .skip(0)
    .limit(12)
    .lean(),
    collection.countDocuments({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
  ]);
  const parTime = Date.now() - t8;
  console.log(`🔗 Parallel find+count:      ${parTime}ms`);

  // ===== SUMMARY =====
  console.log('\n═'.repeat(65));
  console.log('📊 WHERE IS THE TIME GOING?\n');

  const dbTotal = mongooseTime + countTime + formatTime + jsonTime;

  console.log(`MongoDB find (lean):        ${mongooseTime}ms`);
  console.log(`Count query:                ${countTime}ms`);
  console.log(`Format + JSON:              ${formatTime + jsonTime}ms`);
  console.log(`─────────────────────────────────`);
  console.log(`DB + Processing TOTAL:      ${dbTotal}ms`);
  console.log(`Sequential (actual API):    ${seqTime}ms`);
  console.log(`Parallel (old slow way):    ${parTime}ms`);
  console.log();

  if (dbTotal < 50) {
    console.log('✅ Database layer is FAST (< 50ms)');
    console.log(`🔴 Missing ${130 - dbTotal}ms is in Express middleware / network`);
    console.log('\n   Check your Express app for:');
    console.log('   1. rate limiter storing data in DB?');
    console.log('   2. session middleware?');
    console.log('   3. Any app.use() that queries DB?');
    console.log('   4. CORS preflight / complex CORS config?');
    console.log('   5. Large cookie/header parsing?');
  } else {
    console.log('🔴 Database layer is taking most of the time');
  }

  await mongoose.disconnect();
  console.log('\n🔌 Done');
}

fullDebug().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});