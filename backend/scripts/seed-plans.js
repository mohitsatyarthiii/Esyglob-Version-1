import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import SubscriptionPlan from '../src/models/SubscriptionPlan.js';
import { DEFAULT_PLANS } from '../src/lib/subscription-plans.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

class PlanSeeder {
  constructor() {
    this.stats = {
      total: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      startTime: null,
      endTime: null
    };
  }

  log(message, color = 'reset') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
  }

  logSuccess(message) {
    this.log(`✅ ${message}`, 'green');
  }

  logError(message) {
    this.log(`❌ ${message}`, 'red');
  }

  logWarning(message) {
    this.log(`⚠️ ${message}`, 'yellow');
  }

  logInfo(message) {
    this.log(`📌 ${message}`, 'blue');
  }

  async validateConnection() {
    try {
      // Check if MONGODB_URI exists
      if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in environment variables');
      }

      this.logInfo(`Connecting to MongoDB...`);
      
      // Connection options
      const options = {
        serverSelectionTimeoutMS: 5000, // Timeout after 5s
        heartbeatFrequencyMS: 2000,
      };

      await mongoose.connect(process.env.MONGODB_URI, options);
      
      // Test connection
      await mongoose.connection.db.admin().ping();
      this.logSuccess('Connected to MongoDB successfully');
      
      // Log connection info (without sensitive data)
      const dbName = mongoose.connection.db.databaseName;
      const host = mongoose.connection.host;
      this.logInfo(`Database: ${dbName} @ ${host}`);

      return true;
    } catch (error) {
      this.logError(`Connection failed: ${error.message}`);
      throw error;
    }
  }

  async validatePlans(plans) {
    this.logInfo('Validating plans data...');
    
    if (!Array.isArray(plans) || plans.length === 0) {
      throw new Error('DEFAULT_PLANS is empty or not an array');
    }

    const validRoles = ['buyer', 'seller'];
    const validTiers = ['starter', 'growth', 'verified', 'business', 'gold', 'enterprise'];
    const issues = [];

    plans.forEach((plan, index) => {
      // Check required fields
      if (!plan.key) issues.push(`Plan ${index}: Missing 'key'`);
      if (!plan.role || !validRoles.includes(plan.role)) {
        issues.push(`Plan ${index}: Invalid or missing 'role'`);
      }
      if (!plan.tier || !validTiers.includes(plan.tier)) {
        issues.push(`Plan ${index}: Invalid or missing 'tier'`);
      }
      if (!plan.name) issues.push(`Plan ${index}: Missing 'name'`);
      if (!plan.prices) issues.push(`Plan ${index}: Missing 'prices'`);
      if (!plan.features) issues.push(`Plan ${index}: Missing 'features'`);
    });

    if (issues.length > 0) {
      this.logWarning(`Found ${issues.length} validation issues:`);
      issues.slice(0, 5).forEach(issue => this.logWarning(`  - ${issue}`));
      if (issues.length > 5) {
        this.logWarning(`  ... and ${issues.length - 5} more issues`);
      }
    }

    // Check for duplicate keys
    const keys = plans.map(p => p.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      this.logError(`Found duplicate plan keys: ${duplicates.join(', ')}`);
      return false;
    }

    // Check buyer/seller distribution
    const buyerPlans = plans.filter(p => p.role === 'buyer');
    const sellerPlans = plans.filter(p => p.role === 'seller');
    this.logInfo(`Buyer plans: ${buyerPlans.length}, Seller plans: ${sellerPlans.length}`);

    return issues.length === 0;
  }

  async cleanupExistingPlans() {
    try {
      const existingCount = await SubscriptionPlan.countDocuments();
      
      if (existingCount === 0) {
        this.logInfo('No existing plans to clean up');
        return 0;
      }

      this.logWarning(`Found ${existingCount} existing plans`);
      
      // Create backup before deletion (optional)
      if (process.env.BACKUP_BEFORE_SEED === 'true') {
        await this.backupExistingPlans();
      }

      const result = await SubscriptionPlan.deleteMany({});
      this.logSuccess(`Deleted ${result.deletedCount} existing plans`);
      return result.deletedCount;
    } catch (error) {
      this.logError(`Cleanup failed: ${error.message}`);
      throw error;
    }
  }

  async backupExistingPlans() {
    try {
      const backupDir = join(__dirname, '..', 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      
      const plans = await SubscriptionPlan.find({}).lean();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = join(backupDir, `plans_backup_${timestamp}.json`);
      
      await fs.writeFile(backupFile, JSON.stringify(plans, null, 2));
      this.logSuccess(`Backup created: ${backupFile}`);
    } catch (error) {
      this.logWarning(`Backup failed (continuing anyway): ${error.message}`);
    }
  }

  async insertPlans(plans) {
    try {
      this.logInfo(`Inserting ${plans.length} plans...`);
      
      // Insert with ordered: false to continue even if some fail
      const result = await SubscriptionPlan.insertMany(plans, { 
        ordered: false,
        rawResult: true 
      });

      this.stats.inserted = result.insertedCount || result.length;
      this.logSuccess(`Successfully inserted ${this.stats.inserted} plans`);

      // Log plan summary
      plans.forEach(plan => {
        const price = plan.prices?.monthly?.amount === 0 ? 'FREE' : `₹${plan.prices?.monthly?.amount}`;
        this.logInfo(`  • ${plan.role.toUpperCase()} | ${plan.name} (${plan.tier}) - ${price}`, 'cyan');
      });

      return result;
    } catch (error) {
      // Handle duplicate key errors
      if (error.code === 11000) {
        this.logWarning('Some plans already exist (duplicate keys)');
        this.stats.skipped = error.writeErrors?.length || 0;
        this.stats.inserted = error.insertedDocs?.length || 0;
      } else {
        throw error;
      }
    }
  }

  async verifyInsertion(expectedCount) {
    this.logInfo('Verifying insertion...');
    
    const count = await SubscriptionPlan.countDocuments();
    
    const verification = {
      total: count,
      expected: expectedCount,
      matched: count === expectedCount,
      byRole: {}
    };

    // Check by role
    const buyerCount = await SubscriptionPlan.countDocuments({ role: 'buyer' });
    const sellerCount = await SubscriptionPlan.countDocuments({ role: 'seller' });
    verification.byRole = { buyer: buyerCount, seller: sellerCount };

    // Check all tiers present
    const tiers = await SubscriptionPlan.distinct('tier');
    verification.tiers = tiers;

    // Verify indexes
    const indexes = await SubscriptionPlan.collection.indexes();
    verification.indexCount = indexes.length;

    return verification;
  }

  async logVerificationResults(verification) {
    this.log('\n📊 VERIFICATION RESULTS', 'bright');
    this.log('━━━━━━━━━━━━━━━━━━━━━━━━', 'bright');
    this.logInfo(`Total Plans: ${verification.total}/${verification.expected}`);
    this.logInfo(`Buyer Plans: ${verification.byRole.buyer}`);
    this.logInfo(`Seller Plans: ${verification.byRole.seller}`);
    this.logInfo(`Tiers: ${verification.tiers.join(', ')}`);
    this.logInfo(`Indexes: ${verification.indexCount}`);

    if (verification.matched) {
      this.logSuccess('All plans inserted and verified successfully!');
    } else {
      this.logWarning(`Count mismatch! Expected ${verification.expected}, got ${verification.total}`);
    }
  }

  async seed() {
    this.stats.startTime = Date.now();
    
    try {
      this.log('\n🚀 SUBSCRIPTION PLAN SEEDER', 'bright');
      this.log('━━━━━━━━━━━━━━━━━━━━━━━━', 'bright');
      this.logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
      this.logInfo(`Database URI: ${process.env.MONGODB_URI?.split('@')[1] || 'local'}`);
      this.log('');

      // Step 1: Connect to database
      await this.validateConnection();

      // Step 2: Validate plans data
      const isValid = await this.validatePlans(DEFAULT_PLANS);
      if (!isValid) {
        const proceed = process.env.FORCE_SEED === 'true';
        if (!proceed) {
          throw new Error('Plan validation failed. Set FORCE_SEED=true to override');
        }
        this.logWarning('FORCE_SEED=true - Proceeding despite validation issues');
      }

      // Step 3: Cleanup existing plans
      if (process.env.SKIP_CLEANUP !== 'true') {
        await this.cleanupExistingPlans();
      } else {
        this.logWarning('SKIP_CLEANUP=true - Skipping cleanup');
      }

      // Step 4: Insert new plans
      await this.insertPlans(DEFAULT_PLANS);

      // Step 5: Verify insertion
      const verification = await this.verifyInsertion(DEFAULT_PLANS.length);
      await this.logVerificationResults(verification);

      // Step 6: Summary
      this.stats.endTime = Date.now();
      const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2);
      
      this.log('\n✨ SEEDING SUMMARY', 'bright');
      this.log('━━━━━━━━━━━━━━━━━━━━━━━━', 'bright');
      this.logSuccess(`Time taken: ${duration}s`);
      this.logSuccess(`Plans inserted: ${this.stats.inserted}`);
      if (this.stats.skipped > 0) {
        this.logWarning(`Plans skipped: ${this.stats.skipped}`);
      }
      if (this.stats.errors.length > 0) {
        this.logError(`Errors: ${this.stats.errors.length}`);
      }

      return true;
    } catch (error) {
      this.logError(`Seeding failed: ${error.message}`);
      if (process.env.DEBUG === 'true') {
        console.error(error);
      }
      return false;
    }
  }

  async cleanup() {
    try {
      await mongoose.connection.close();
      this.logInfo('Database connection closed');
    } catch (error) {
      this.logWarning(`Error closing connection: ${error.message}`);
    }
  }
}

// Main execution
async function main() {
  const seeder = new PlanSeeder();
  
  try {
    const success = await seeder.seed();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await seeder.cleanup();
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n⚠️ Process interrupted');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { PlanSeeder, main };