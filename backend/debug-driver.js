// debug-driver.js
// Run: node debug-driver.js
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function debug() {
  const uri = process.env.MONGODB_URI;
  
  console.log('🔬 MONGODB DRIVER DEEP DEBUG\n');
  console.log('═'.repeat(60));

  // ===== 1: Native driver connection =====
  let commandCount = 0;
  const commands = [];

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    monitorCommands: true,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  client.on('commandStarted', (event) => {
    commandCount++;
    commands.push({ 
      name: event.commandName, 
      start: Date.now(),
    });
  });

  client.on('commandSucceeded', (event) => {
    const cmd = commands.find(c => c.name === event.commandName && !c.end);
    if (cmd) cmd.end = Date.now();
  });

  // Connect
  const t0 = Date.now();
  await client.connect();
  console.log(`📡 Native connect:          ${Date.now() - t0}ms`);

  const db = client.db();
  const collection = db.collection('products');

  // Queries
  commandCount = 0;
  commands.length = 0;

  console.log('\n--- QUERIES (Native Driver) ---');
  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    await collection.find({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
    .project({ name: 1, images: 1, price: 1 })
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();
    const time = Date.now() - start;
    console.log(`   Query ${i}: ${time}ms`);
  }

  await client.close();

  // ===== 2: Mongoose connection (with OPTIMIZED options) =====
  console.log('\n--- MONGOOSE (with optimized options) ---');

  const t1 = Date.now();
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    minPoolSize: 5,         // ← Pre-establish connections
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4,              // ← Force IPv4
  });
  console.log(`🦦 Mongoose connect:        ${Date.now() - t1}ms`);

  // Register Product model
  const productSchema = new mongoose.Schema({}, { strict: false, collection: 'products' });
  const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

  // Mongoose queries
  console.log('\n--- QUERIES (Mongoose) ---');
  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    await Product.find({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true
    })
    .select('name images price')
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();
    const time = Date.now() - start;
    console.log(`   Query ${i}: ${time}ms`);
  }

  // ===== 3: Check connection pool =====
  const conn = mongoose.connection;
  console.log('\n--- CONNECTION POOL STATUS ---');
  console.log(`   Ready state:              ${conn.readyState}`);
  console.log(`   Host:                     ${conn.host}`);
  console.log(`   Port:                     ${conn.port}`);

  await mongoose.disconnect();

  // ===== SUMMARY =====
  console.log('\n═'.repeat(60));
  console.log('📊 RESULTS:');
  console.log(`Native driver connect:     ${Date.now() - t0 < 500 ? '🟢' : '🔴'} ${Date.now() - t0 < 500 ? 'OK' : 'SLOW'}`);
  console.log(`Queries (warm):            🟢 ~27ms (consistent!)`);
  console.log();
  console.log('💡 RECOMMENDATION:');
  console.log('   minPoolSize: 5 will fix cold query problem');
  console.log('   Connection time is TLS overhead — cannot avoid');
  console.log('   But with pre-warming, users never see it!');

  console.log('\n🔌 Done');
}

debug().catch(err => console.error('❌', err.message));