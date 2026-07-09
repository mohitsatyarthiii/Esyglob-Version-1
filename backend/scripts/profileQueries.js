// scripts/profileQueries.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function profile() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Enable profiling
  await mongoose.connection.db.setProfilingLevel(2); // Log all queries
  
  console.log('Profiling enabled. Run your API now...');
  console.log('Press Ctrl+C to stop and view results');
  
  // After some time, check slow queries
  setTimeout(async () => {
    const slowQueries = await mongoose.connection.db.collection('system.profile')
      .find({ millis: { $gt: 10 } }) // Queries taking >10ms
      .sort({ millis: -1 })
      .limit(10)
      .toArray();
    
    console.log('\n🔍 SLOW QUERIES (>10ms):');
    slowQueries.forEach(q => {
      console.log(`\n  Command: ${q.op}`);
      console.log(`  Collection: ${q.ns}`);
      console.log(`  Time: ${q.millis}ms`);
      console.log(`  Filter: ${JSON.stringify(q.query || q.command)}`);
    });
    
    await mongoose.connection.db.setProfilingLevel(0); // Disable profiling
    process.exit(0);
  }, 30000);
}

profile();