// scripts/deleteSellers.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';




const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// ============================================
// CONFIGURATION - IDs of sellers to delete
// ============================================
const SELLERS_TO_DELETE = [
  {
    name: "Lendor Trades LLC",
    sellerId: "6a12ee74153e10fcba0e649a",
    userId: "6a12ee731a7ca1175f9706c0",
    email: "lendor@gmail.com"
  },
  {
    name: "Adani traders",
    sellerId: "6a149888153e10fcba0e7500",
    userId: "6a149888ebea5af6896857a4",
    email: "adani@gmail.com"
  }
];

// ============================================
// COLOR CONSOLE LOGS
// ============================================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  delete: (msg) => console.log(`${colors.red}[DELETE]${colors.reset} ${msg}`),
  count: (msg) => console.log(`${colors.magenta}[COUNT]${colors.reset} ${msg}`),
};

// ============================================
// DELETE OPERATIONS
// ============================================
class SellerDeleter {
  constructor() {
    this.stats = {
      sellers: 0,
      users: 0,
      products: 0,
      orders: 0,
      messages: 0,
      reviews: 0,
      savedItems: 0,
      totalDeleted: 0,
      errors: []
    };
    
    this.backupData = {};
  }

  async connect() {
    try {
      log.info('🔌 Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
      });
      log.success(`✅ Connected to: ${mongoose.connection.db.databaseName}`);
      
      // Test connection
      await mongoose.connection.db.admin().ping();
      log.success('✅ Database ping successful');
    } catch (error) {
      log.error(`❌ Connection failed: ${error.message}`);
      throw error;
    }
  }

  async getCollections() {
    const collections = await mongoose.connection.db.listCollections().toArray();
    return collections.map(c => c.name);
  }

  async countSellerData(sellerId, userId) {
    log.info(`\n📊 Counting data for seller: ${sellerId}`);
    
    const counts = {};
    
    try {
      // Count products
      const productCollection = mongoose.connection.db.collection('products');
      counts.products = await productCollection.countDocuments({ 
        sellerId: new mongoose.Types.ObjectId(sellerId) 
      });
      log.count(`Products: ${counts.products}`);
      
      // Count by status
      const productStatuses = await productCollection.aggregate([
        { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).toArray();
      
      productStatuses.forEach(s => {
        log.info(`  - ${s._id}: ${s.count} products`);
      });
      
    } catch (error) {
      log.warning(`Could not count some data: ${error.message}`);
    }
    
    return counts;
  }

  async backupSellerData(sellerId, userId) {
    log.info('💾 Creating backup...');
    
    const backupDir = join(__dirname, '..', 'backups', `seller_backup_${Date.now()}`);
    const fs = await import('fs/promises');
    
    try {
      await fs.mkdir(backupDir, { recursive: true });
      
      // Backup seller profile
      const sellerCollection = mongoose.connection.db.collection('sellers');
      const seller = await sellerCollection.findOne({ 
        _id: new mongoose.Types.ObjectId(sellerId) 
      });
      
      if (seller) {
        await fs.writeFile(
          join(backupDir, `seller_${sellerId}.json`),
          JSON.stringify(seller, null, 2)
        );
        log.success(`Seller backup saved`);
      }
      
      // Backup user account
      const userCollection = mongoose.connection.db.collection('users');
      const user = await userCollection.findOne({ 
        _id: new mongoose.Types.ObjectId(userId) 
      });
      
      if (user) {
        // Remove sensitive data from backup
        delete user.password;
        delete user.passwordResetToken;
        delete user.passwordResetExpires;
        
        await fs.writeFile(
          join(backupDir, `user_${userId}.json`),
          JSON.stringify(user, null, 2)
        );
        log.success(`User backup saved`);
      }
      
      // Backup products count & sample
      const productCollection = mongoose.connection.db.collection('products');
      const products = await productCollection.find({ 
        sellerId: new mongoose.Types.ObjectId(sellerId) 
      }).limit(10).toArray();
      
      await fs.writeFile(
        join(backupDir, `products_sample_${sellerId}.json`),
        JSON.stringify({ totalCount: await productCollection.countDocuments({ sellerId: new mongoose.Types.ObjectId(sellerId) }), sample: products }, null, 2)
      );
      
      log.success(`Backup created at: ${backupDir}`);
      return backupDir;
      
    } catch (error) {
      log.warning(`Backup partially failed: ${error.message}`);
      return null;
    }
  }

  async deleteSellerData(sellerInfo) {
    const { name, sellerId, userId, email } = sellerInfo;
    
    log.info(`\n${'='.repeat(60)}`);
    log.warning(`🗑️  DELETING: ${name} (${email})`);
    log.info(`${'='.repeat(60)}`);
    
    try {
      const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
      const userObjectId = new mongoose.Types.ObjectId(userId);
      
      // 1. Delete Products
      log.delete('Deleting products...');
      const productResult = await mongoose.connection.db
        .collection('products')
        .deleteMany({ sellerId: sellerObjectId });
      this.stats.products += productResult.deletedCount;
      log.success(`✅ ${productResult.deletedCount} products deleted`);
      
      // 2. Delete Product Reviews
      log.delete('Deleting product reviews...');
      try {
        const reviewResult = await mongoose.connection.db
          .collection('reviews')
          .deleteMany({ sellerId: sellerObjectId });
        this.stats.reviews += reviewResult.deletedCount;
        log.success(`✅ ${reviewResult.deletedCount} reviews deleted`);
      } catch (e) {
        log.warning('Reviews collection might not exist');
      }
      
      // 3. Delete Saved/Favorite Products
      log.delete('Deleting saved items...');
      try {
        // Products saved by others from this seller
        const savedResult = await mongoose.connection.db
          .collection('savedproducts')
          .deleteMany({ sellerId: sellerObjectId });
        this.stats.savedItems += savedResult.deletedCount;
        log.success(`✅ ${savedResult.deletedCount} saved items deleted`);
      } catch (e) {
        log.warning('SavedProducts collection might not exist');
      }
      
      // 4. Delete Messages/Chats
      log.delete('Deleting messages...');
      try {
        const messageResult = await mongoose.connection.db
          .collection('messages')
          .deleteMany({ 
            $or: [
              { senderId: userObjectId },
              { receiverId: userObjectId }
            ]
          });
        this.stats.messages += messageResult.deletedCount;
        log.success(`✅ ${messageResult.deletedCount} messages deleted`);
      } catch (e) {
        log.warning('Messages collection might not exist');
      }
      
      // 5. Delete RFQs/Inquiries
      log.delete('Deleting RFQs...');
      try {
        const rfqResult = await mongoose.connection.db
          .collection('rfqs')
          .deleteMany({ 
            $or: [
              { sellerId: sellerObjectId },
              { 'quotes.sellerId': sellerObjectId }
            ]
          });
        log.success(`✅ ${rfqResult.deletedCount} RFQs deleted`);
      } catch (e) {
        log.warning('RFQs collection might not exist');
      }
      
      // 6. Delete Orders
      log.delete('Deleting orders...');
      try {
        const orderResult = await mongoose.connection.db
          .collection('orders')
          .deleteMany({ sellerId: sellerObjectId });
        this.stats.orders += orderResult.deletedCount;
        log.success(`✅ ${orderResult.deletedCount} orders deleted`);
      } catch (e) {
        log.warning('Orders collection might not exist');
      }
      
      // 7. Delete Notifications
      log.delete('Deleting notifications...');
      try {
        const notifResult = await mongoose.connection.db
          .collection('notifications')
          .deleteMany({ 
            $or: [
              { userId: userObjectId },
              { 'data.sellerId': sellerId }
            ]
          });
        log.success(`✅ ${notifResult.deletedCount} notifications deleted`);
      } catch (e) {
        log.warning('Notifications collection might not exist');
      }
      
      // 8. Delete Seller Profile
      log.delete('Deleting seller profile...');
      const sellerResult = await mongoose.connection.db
        .collection('sellers')
        .deleteOne({ _id: sellerObjectId });
      
      if (sellerResult.deletedCount > 0) {
        this.stats.sellers++;
        log.success(`✅ Seller profile deleted`);
      } else {
        log.warning('⚠️ Seller profile not found');
      }
      
      // 9. Delete User Account
      log.delete('Deleting user account...');
      const userResult = await mongoose.connection.db
        .collection('users')
        .deleteOne({ _id: userObjectId });
      
      if (userResult.deletedCount > 0) {
        this.stats.users++;
        log.success(`✅ User account deleted`);
      } else {
        log.warning('⚠️ User account not found');
      }
      
      // 10. Delete Wishlists
      log.delete('Cleaning up wishlists...');
      try {
        const wishlistResult = await mongoose.connection.db
          .collection('wishlists')
          .deleteMany({ userId: userObjectId });
        log.success(`✅ ${wishlistResult.deletedCount} wishlist items deleted`);
      } catch (e) {
        log.warning('Wishlists collection might not exist');
      }
      
      this.stats.totalDeleted += 
        productResult.deletedCount + 
        sellerResult.deletedCount + 
        userResult.deletedCount;
      
      log.success(`\n✅ COMPLETED: ${name} - All data deleted`);
      
    } catch (error) {
      log.error(`❌ Error deleting ${name}: ${error.message}`);
      this.stats.errors.push({ seller: name, error: error.message });
    }
  }

  async verifyDeletion(sellerInfo) {
    const { name, sellerId, userId } = sellerInfo;
    
    log.info(`\n🔍 Verifying deletion for: ${name}`);
    
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Check seller
    const seller = await mongoose.connection.db
      .collection('sellers')
      .findOne({ _id: sellerObjectId });
    
    // Check user
    const user = await mongoose.connection.db
      .collection('users')
      .findOne({ _id: userObjectId });
    
    // Check products
    const productCount = await mongoose.connection.db
      .collection('products')
      .countDocuments({ sellerId: sellerObjectId });
    
    if (!seller && !user && productCount === 0) {
      log.success(`✅ VERIFIED: ${name} completely deleted`);
      return true;
    } else {
      log.error(`❌ VERIFICATION FAILED for ${name}:`);
      if (seller) log.error(`  - Seller still exists`);
      if (user) log.error(`  - User still exists`);
      if (productCount > 0) log.error(`  - ${productCount} products still exist`);
      return false;
    }
  }

  async run() {
    log.info(`\n${'🚀'.repeat(30)}`);
    log.warning(`SELLER DELETION SCRIPT`);
    log.info(`${'🚀'.repeat(30)}\n`);
    
    // Print summary
    log.info('SELLERS TO DELETE:');
    SELLERS_TO_DELETE.forEach((s, i) => {
      log.info(`${i + 1}. ${s.name} (${s.email})`);
      log.info(`   Seller ID: ${s.sellerId}`);
      log.info(`   User ID: ${s.userId}`);
    });
    
    // Confirmation prompt
    const shouldProceed = await this.askConfirmation();
    
    if (!shouldProceed) {
      log.warning('\n❌ Operation cancelled by user');
      process.exit(0);
    }
    
    log.warning('\n⚠️  Starting deletion in 3 seconds...');
    await this.sleep(3000);
    
    // Connect to database
    await this.connect();
    
    // Process each seller
    for (const sellerInfo of SELLERS_TO_DELETE) {
      try {
        // Count existing data
        await this.countSellerData(sellerInfo.sellerId, sellerInfo.userId);
        
        // Create backup
        await this.backupSellerData(sellerInfo.sellerId, sellerInfo.userId);
        
        // Delete all data
        await this.deleteSellerData(sellerInfo);
        
        // Verify deletion
        await this.verifyDeletion(sellerInfo);
        
        // Small delay between deletions
        await this.sleep(1000);
        
      } catch (error) {
        log.error(`Failed to process ${sellerInfo.name}: ${error.message}`);
      }
    }
    
    // Print final stats
    this.printFinalStats();
  }

  async askConfirmation() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question(`\n${colors.red}${colors.bright}ARE YOU SURE? Type "DELETE" to confirm: ${colors.reset}`, (answer) => {
        rl.close();
        resolve(answer === 'DELETE');
      });
    });
  }

  printFinalStats() {
    log.info(`\n${'='.repeat(60)}`);
    log.info(`${colors.bright}📊 FINAL STATISTICS${colors.reset}`);
    log.info(`${'='.repeat(60)}`);
    log.success(`Sellers deleted: ${this.stats.sellers}`);
    log.success(`Users deleted: ${this.stats.users}`);
    log.success(`Products deleted: ${this.stats.products}`);
    log.success(`Orders deleted: ${this.stats.orders}`);
    log.success(`Messages deleted: ${this.stats.messages}`);
    log.success(`Reviews deleted: ${this.stats.reviews}`);
    log.success(`Saved items cleaned: ${this.stats.savedItems}`);
    log.info(`${'='.repeat(60)}`);
    log.warning(`TOTAL ITEMS DELETED: ${this.stats.totalDeleted}`);
    log.info(`${'='.repeat(60)}\n`);
    
    if (this.stats.errors.length > 0) {
      log.error(`Errors encountered: ${this.stats.errors.length}`);
      this.stats.errors.forEach(e => log.error(`  - ${e.seller}: ${e.error}`));
    }
    
    log.success('✅ Script completed!');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    try {
      await mongoose.connection.close();
      log.info('Database connection closed');
    } catch (error) {
      // ignore
    }
  }
}

// ============================================
// MAIN EXECUTION
// ============================================
async function main() {
  const deleter = new SellerDeleter();
  
  try {
    await deleter.run();
    process.exit(0);
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await deleter.cleanup();
  }
}

// Handle interruptions
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Process interrupted');
  await mongoose.connection.close();
  process.exit(0);
});

// Run
main();