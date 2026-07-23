// delete-all-business-data.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/esyglob';
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${colors.yellow}${question}${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

// All collections that might contain business data
const COLLECTIONS_TO_DELETE = {
  // AI Chat
  aichats: {
    name: 'aichats',
    displayName: 'AI Chats & Conversations',
    icon: '🤖',
    priority: 1,
    description: 'All AI chat history and conversations'
  },
  aimessages: {
    name: 'aimessages',
    displayName: 'AI Messages',
    icon: '💬',
    priority: 2,
    description: 'Individual AI chat messages'
  },

  // Market Insights
  marketinsights: {
    name: 'marketinsights',
    displayName: 'Market Insights',
    icon: '📊',
    priority: 3,
    description: 'Market analysis and insights data'
  },
  markettrends: {
    name: 'markettrends',
    displayName: 'Market Trends',
    icon: '📈',
    priority: 4,
    description: 'Market trend analysis'
  },
  marketreports: {
    name: 'marketreports',
    displayName: 'Market Reports',
    icon: '📋',
    priority: 5,
    description: 'Generated market reports'
  },
  priceanalysis: {
    name: 'priceanalysis',
    displayName: 'Price Analysis',
    icon: '💰',
    priority: 6,
    description: 'Price comparison and analysis'
  },

  // Orders
  orders: {
    name: 'orders',
    displayName: 'Orders',
    icon: '📦',
    priority: 7,
    description: 'All order records'
  },
  orderitems: {
    name: 'orderitems',
    displayName: 'Order Items',
    icon: '📋',
    priority: 8,
    description: 'Individual items within orders'
  },
  orderhistory: {
    name: 'orderhistory',
    displayName: 'Order History',
    icon: '🕒',
    priority: 9,
    description: 'Order status history and tracking'
  },
  ordertransactions: {
    name: 'ordertransactions',
    displayName: 'Order Transactions',
    icon: '💳',
    priority: 10,
    description: 'Financial transactions for orders'
  },
  shipments: {
    name: 'shipments',
    displayName: 'Shipments',
    icon: '🚚',
    priority: 11,
    description: 'Shipping and tracking information'
  },
  invoices: {
    name: 'invoices',
    displayName: 'Invoices',
    icon: '📄',
    priority: 12,
    description: 'Order invoices'
  },

  // Payments
  payments: {
    name: 'payments',
    displayName: 'Payments',
    icon: '💵',
    priority: 13,
    description: 'All payment records'
  },
  paymenttransactions: {
    name: 'paymenttransactions',
    displayName: 'Payment Transactions',
    icon: '🔄',
    priority: 14,
    description: 'Payment transaction logs'
  },
  paymentmethods: {
    name: 'paymentmethods',
    displayName: 'Payment Methods',
    icon: '🏦',
    priority: 15,
    description: 'Saved payment methods'
  },
  refunds: {
    name: 'refunds',
    displayName: 'Refunds',
    icon: '↩️',
    priority: 16,
    description: 'Refund records'
  },
  escrow: {
    name: 'escrow',
    displayName: 'Escrow Accounts',
    icon: '🔒',
    priority: 17,
    description: 'Escrow payment records'
  },

  // Related Collections
  rfqs: {
    name: 'rfqs',
    displayName: 'RFQs',
    icon: '📝',
    priority: 18,
    description: 'Request for Quotations'
  },
  quotations: {
    name: 'quotations',
    displayName: 'Quotations',
    icon: '📨',
    priority: 19,
    description: 'Quotation records'
  },
  rfqmessages: {
    name: 'rfqmessages',
    displayName: 'RFQ Messages',
    icon: '💭',
    priority: 20,
    description: 'RFQ conversation messages'
  },
  negotiations: {
    name: 'negotiations',
    displayName: 'Negotiations',
    icon: '🤝',
    priority: 21,
    description: 'Price negotiations'
  },
  tradeleads: {
    name: 'tradeleads',
    displayName: 'Trade Leads',
    icon: '🎯',
    priority: 22,
    description: 'Trade lead records'
  }
};

async function listAllCollections() {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    return collections.map(col => col.name);
  } catch (error) {
    log(`Error listing collections: ${error.message}`, 'red');
    return [];
  }
}

async function countDocumentsInCollection(collectionName) {
  try {
    const count = await mongoose.connection.db.collection(collectionName).countDocuments();
    return count;
  } catch (error) {
    return 0;
  }
}

async function deleteCollection(collectionName) {
  try {
    const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
    return {
      success: true,
      deletedCount: result.deletedCount,
      collectionName
    };
  } catch (error) {
    return {
      success: false,
      deletedCount: 0,
      collectionName,
      error: error.message
    };
  }
}

async function getBackupSuggestion() {
  log('\n💡 Backup Commands:', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('mongodump --uri="mongodb://localhost:27017/esyglob" --out=./backup/$(date +%Y%m%d_%H%M%S)', 'white');
  log('mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/esyglob" --out=./backup/', 'white');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');
}

async function main() {
  console.clear();
  
  log('╔══════════════════════════════════════════════════════╗', 'magenta');
  log('║     🗑️  BUSINESS DATA DELETION TOOL v2.0  🗑️       ║', 'magenta');
  log('║     AI Chats • Insights • Orders • Payments         ║', 'magenta');
  log('╚══════════════════════════════════════════════════════╝', 'magenta');
  
  console.log('');
  
  if (isDryRun) {
    log('🔍 DRY RUN MODE - No data will be deleted', 'yellow');
    log('   Run without --dry-run flag to perform actual deletion\n', 'yellow');
  }

  try {
    // Connect to database
    log('🔌 Connecting to database...', 'blue');
    await mongoose.connect(MONGODB_URI);
    log(`✅ Connected to: ${MONGODB_URI.split('@').pop() || MONGODB_URI}\n`, 'green');

    // Get all available collections
    const availableCollections = await listAllCollections();
    log(`📚 Found ${availableCollections.length} collections in database\n`, 'white');

    // Match collections to delete
    const collectionsToProcess = [];
    const unmatchedCollections = [];

    for (const [key, config] of Object.entries(COLLECTIONS_TO_DELETE)) {
      if (availableCollections.includes(config.name)) {
        const count = await countDocumentsInCollection(config.name);
        collectionsToProcess.push({
          ...config,
          key,
          documentCount: count
        });
      }
    }

    // Find any extra collections that might contain related data
    const matchedNames = collectionsToProcess.map(c => c.name);
    for (const collName of availableCollections) {
      if (!matchedNames.includes(collName)) {
        // Check if collection name contains relevant keywords
        const keywords = ['ai', 'chat', 'market', 'insight', 'order', 'payment', 
                         'rfq', 'quote', 'negotiation', 'invoice', 'ship', 
                         'transaction', 'refund', 'escrow', 'trade', 'lead'];
        
        if (keywords.some(keyword => collName.toLowerCase().includes(keyword))) {
          const count = await countDocumentsInCollection(collName);
          unmatchedCollections.push({
            name: collName,
            displayName: collName,
            icon: '❓',
            priority: 99,
            description: 'Auto-detected related collection',
            documentCount: count
          });
        }
      }
    }

    // Sort by priority
    collectionsToProcess.sort((a, b) => a.priority - b.priority);

    // Display summary
    log('📊 Collections to be deleted:', 'bold');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    
    let totalDocuments = 0;
    let totalCollections = 0;

    // Display matched collections
    for (const collection of collectionsToProcess) {
      if (collection.documentCount > 0) {
        log(`${collection.icon} ${collection.displayName.padEnd(30)} ${String(collection.documentCount).padStart(8)} documents`, 'white');
        totalDocuments += collection.documentCount;
        totalCollections++;
      }
    }

    // Display unmatched but related collections
    if (unmatchedCollections.length > 0) {
      log('\n🔍 Additional related collections found:', 'yellow');
      for (const collection of unmatchedCollections) {
        if (collection.documentCount > 0) {
          log(`${collection.icon} ${collection.name.padEnd(30)} ${String(collection.documentCount).padStart(8)} documents`, 'yellow');
          totalDocuments += collection.documentCount;
          totalCollections++;
        }
      }
    }

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    log(`${'📊 TOTAL:'.padEnd(32)} ${String(totalDocuments).padStart(8)} documents in ${totalCollections} collections`, 'bold');
    console.log('');

    if (totalDocuments === 0) {
      log('✅ No business data found to delete!', 'green');
      return;
    }

    // Dry run - exit here
    if (isDryRun) {
      log('🔍 Dry run completed. No data was deleted.', 'yellow');
      log('💡 Run without --dry-run to perform actual deletion', 'yellow');
      return;
    }

    // Show backup suggestion
    await getBackupSuggestion();

    // Warning
    log('⚠️  CRITICAL WARNING:', 'red');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'red');
    log('• This will PERMANENTLY delete ALL business data', 'red');
    log('• AI Chat history will be lost', 'red');
    log('• Market insights will be lost', 'red');
    log('• Orders and order history will be lost', 'red');
    log('• Payment records will be lost', 'red');
    log('• RFQs and Quotations will be lost', 'red');
    log('• This action CANNOT be undone', 'red');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'red');

    // Additional safety checks
    const env = process.env.NODE_ENV || 'development';
    log(`📍 Current Environment: ${env.toUpperCase()}`, 'yellow');
    
    if (env === 'production') {
      log('🚨 PRODUCTION DATABASE DETECTED!', 'red');
      const proceedProd = await askConfirmation(
        '⚠️  Are you ABSOLUTELY sure? Type "PRODUCTION" to proceed: '
      );
      if (proceedProd !== 'production') {
        log('\n❌ Deletion cancelled. Good choice!', 'green');
        return;
      }
    }

    // Final confirmation
    if (!skipConfirmation) {
      console.log('');
      log(`📋 Total documents to delete: ${totalDocuments}`, 'bold');
      log(`📚 Collections affected: ${totalCollections}`, 'bold');
      console.log('');
      
      const confirmation = await askConfirmation(
        'Type "DELETE ALL" to confirm permanent deletion: '
      );

      if (confirmation !== 'delete all') {
        log('\n❌ Deletion cancelled. No data was deleted.', 'green');
        return;
      }
    }

    // Start deletion
    console.log('');
    log('🗑️  STARTING DELETION PROCESS...', 'red');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'red');

    const results = [];
    let totalDeleted = 0;
    let failedCollections = [];

    // Delete matched collections
    for (const collection of collectionsToProcess) {
      if (collection.documentCount > 0) {
        process.stdout.write(`${collection.icon} Deleting ${collection.displayName}... `);
        
        const result = await deleteCollection(collection.name);
        
        if (result.success) {
          log(`✅ ${result.deletedCount} deleted`, 'green');
          results.push(result);
          totalDeleted += result.deletedCount;
        } else {
          log(`❌ Failed: ${result.error}`, 'red');
          failedCollections.push(collection);
        }
      }
    }

    // Delete unmatched collections
    for (const collection of unmatchedCollections) {
      if (collection.documentCount > 0) {
        process.stdout.write(`${collection.icon} Deleting ${collection.name}... `);
        
        const result = await deleteCollection(collection.name);
        
        if (result.success) {
          log(`✅ ${result.deletedCount} deleted`, 'green');
          results.push(result);
          totalDeleted += result.deletedCount;
        } else {
          log(`❌ Failed: ${result.error}`, 'red');
          failedCollections.push(collection);
        }
      }
    }

    // Summary
    console.log('');
    log('📊 DELETION SUMMARY', 'bold');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    
    for (const result of results) {
      log(`${'✅'.padEnd(4)} ${result.collectionName.padEnd(30)} ${String(result.deletedCount).padStart(8)} documents`, 'green');
    }

    if (failedCollections.length > 0) {
      log('\n⚠️  Failed Collections:', 'yellow');
      for (const failed of failedCollections) {
        log(`❌ ${failed.displayName}`, 'red');
      }
    }

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    log(`${'📊 TOTAL DELETED:'.padEnd(32)} ${String(totalDeleted).padStart(8)} documents`, 'bold');
    log(`${'📚 COLLECTIONS:'.padEnd(32)} ${String(results.length).padStart(8)} processed`, 'bold');
    console.log('');

    // Verify deletion
    log('🔍 Verifying deletion...', 'blue');
    let remainingDocs = 0;
    
    for (const collection of collectionsToProcess) {
      if (collection.documentCount > 0) {
        const count = await countDocumentsInCollection(collection.name);
        if (count > 0) {
          log(`⚠️  ${collection.displayName}: ${count} documents remaining`, 'yellow');
          remainingDocs += count;
        }
      }
    }

    if (remainingDocs === 0) {
      log('\n✅ All business data successfully deleted!', 'green');
      log('✅ Database is clean.', 'green');
    } else {
      log(`\n⚠️  ${remainingDocs} documents could not be deleted.`, 'yellow');
      log('💡 Try running the script again or check permissions.', 'yellow');
    }

    log('\n📝 Next Steps:', 'cyan');
    log('1. Verify the application is working correctly', 'white');
    log('2. Check if any related data needs manual cleanup', 'white');
    log('3. Update any external integrations if needed', 'white');

  } catch (error) {
    log(`\n❌ Fatal Error: ${error.message}`, 'red');
    console.error(error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      log('\n👋 Database connection closed', 'blue');
    }
    process.exit(0);
  }
}

// Run the script
main();