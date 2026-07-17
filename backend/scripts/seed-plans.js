import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubscriptionPlan from '../src/models/SubscriptionPlan.js';
import { DEFAULT_PLANS } from '../src/lib/subscription-plans.js'; // Ensure path points to where DEFAULT_PLANS is exported

dotenv.config();

async function seedPlans() {
  try {
    // 1. Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    // 2. Delete ALL existing plans
    console.log('🧹 Cleaning up old plans...');
    await SubscriptionPlan.deleteMany({});
    console.log('✅ Old plans deleted.');

    // 3. Insert the new DEFAULT_PLANS
    console.log(`📦 Inserting ${DEFAULT_PLANS.length} new plans...`);
    await SubscriptionPlan.insertMany(DEFAULT_PLANS);
    console.log('✅ New plans inserted successfully.');

    // 4. Verify insertion
    const count = await SubscriptionPlan.countDocuments();
    console.log(`📊 Total plans in database: ${count}`);

    // 5. Exit
    console.log('🎉 Seeding completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding plans:', error);
    process.exit(1);
  }
}

// Run the function
seedPlans();