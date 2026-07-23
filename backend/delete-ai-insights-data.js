// delete-ai-insights-data.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/esyglob';
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
const skipConfirmation = process.argv.includes('--yes') || process.argv.includes('-y');

// Colors for console
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
  dim: '\x1b[2m',
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
    rl.question(`${colors.yellow}${question}${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

// AI Usage related collections
const AI_USAGE_COLLECTIONS = {
  aiusage: {
    name: 'aiusage',
    displayName: 'AI Usage Logs',
    icon: '📊',
    category: 'AI Usage',
    description: 'Daily AI usage tracking and limits'
  },
  aiusagelogs: {
    name: 'aiusagelogs',
    displayName: 'AI Usage History',
    icon: '📜',
    category: 'AI Usage',
    description: 'Historical AI usage records'
  },
  aitokens: {
    name: 'aitokens',
    displayName: 'AI Token Usage',
    icon: '🎯',
    category: 'AI Usage',
    description: 'Token consumption tracking'
  },
  aiapicalls: {
    name: 'aiapicalls',
    displayName: 'AI API Calls',
    icon: '🔌',
    category: 'AI Usage',
    description: 'API call logs and metrics'
  },
  airatelimits: {
    name: 'airatelimits',
    displayName: 'AI Rate Limits',
    icon: '🚦',
    category: 'AI Usage',
    description: 'Rate limiting data'
  },
  aicredits: {
    name: 'aicredits',
    displayName: 'AI Credits',
    icon: '💎',
    category: 'AI Usage',
    description: 'AI credit balances and transactions'
  },
  aisessions: {
    name: 'aisessions',
    displayName: 'AI Sessions',
    icon: '🔐',
    category: 'AI Usage',
    description: 'Active and historical AI sessions'
  },
  aianalytics: {
    name: 'aianalytics',
    displayName: 'AI Analytics',
    icon: '📈',
    category: 'AI Usage',
    description: 'AI performance analytics'
  },
  aifeatures: {
    name: 'aifeatures',
    displayName: 'AI Feature Usage',
    icon: '⚡',
    category: 'AI Usage',
    description: 'Feature-wise AI usage breakdown'
  }
};

// Market Insights related collections
const MARKET_INSIGHTS_COLLECTIONS = {
  marketinsights: {
    name: 'marketinsights',
    displayName: 'Market Insights',
    icon: '🔍',
    category: 'Market Insights',
    description: 'Market analysis and insights'
  },
  markettrends: {
    name: 'markettrends',
    displayName: 'Market Trends',
    icon: '📈',
    category: 'Market Insights',
    description: 'Trend analysis data'
  },
  marketreports: {
    name: 'marketreports',
    displayName: 'Market Reports',
    icon: '📋',
    category: 'Market Insights',
    description: 'Generated market reports'
  },
  marketanalysis: {
    name: 'marketanalysis',
    displayName: 'Market Analysis',
    icon: '📊',
    category: 'Market Insights',
    description: 'Detailed market analysis'
  },
  marketdata: {
    name: 'marketdata',
    displayName: 'Market Data',
    icon: '💹',
    category: 'Market Insights',
    description: 'Raw market data'
  },
  priceanalysis: {
    name: 'priceanalysis',
    displayName: 'Price Analysis',
    icon: '💰',
    category: 'Market Insights',
    description: 'Price comparison and analysis'
  },
  pricetrends: {
    name: 'pricetrends',
    displayName: 'Price Trends',
    icon: '📉',
    category: 'Market Insights',
    description: 'Historical price trends'
  },
  demandanalysis: {
    name: 'demandanalysis',
    displayName: 'Demand Analysis',
    icon: '🎯',
    category: 'Market Insights',
    description: 'Product demand analysis'
  },
  competitoranalysis: {
    name: 'competitoranalysis',
    displayName: 'Competitor Analysis',
    icon: '🏢',
    category: 'Market Insights',
    description: 'Competitor tracking data'
  },
  supplierinsights: {
    name: 'supplierinsights',
    displayName: 'Supplier Insights',
    icon: '🏭',
    category: 'Market Insights',
    description: 'Supplier performance insights'
  },
  categoryinsights: {
    name: 'categoryinsights',
    displayName: 'Category Insights',
    icon: '📑',
    category: 'Market Insights',
    description: 'Product category insights'
  },
  regioninsights: {
    name: 'regioninsights',
    displayName: 'Regional Insights',
    icon: '🌍',
    category: 'Market Insights',
    description: 'Region-wise market insights'
  },
  buyerinsights: {
    name: 'buyerinsights',
    displayName: 'Buyer Insights',
    icon: '👥',
    category: 'Market Insights',
    description: 'Buyer behavior insights'
  },
  searchanalytics: {
    name: 'searchanalytics',
    displayName: 'Search Analytics',
    icon: '🔎',
    category: 'Market Insights',
    description: 'Search pattern analysis'
  }
};

// Combined collections
const ALL_TARGET_COLLECTIONS = {
  ...AI_USAGE_COLLECTIONS,
  ...MARKET_INSIGHTS_COLLECTIONS
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

async function countDocuments(collectionName) {
  try {
    return await mongoose.connection.db.collection(collectionName).countDocuments();
  } catch (error) {
    return 0;
  }
}

async function deleteCollection(collectionName) {
  try {
    const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
    return { success: true, deletedCount: result.deletedCount, collectionName };
  } catch (error) {
    return { success: false, deletedCount: 0, collectionName, error: error.message };
  }
}

function showProgress(current, total, message = '') {
  const percentage = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  process.stdout.write(`\r${colors.cyan}${bar}${colors.reset} ${percentage}% ${message}`);
}

async function main() {
  console.clear();
  
  log('╔══════════════════════════════════════════════════════╗', 'magenta');
  log('║      🧠 AI USAGE & MARKET INSIGHTS CLEANER 🧠      ║', 'magenta');
  log('║         Delete AI Usage + Market Insights           ║', 'magenta');
  log('╚══════════════════════════════════════════════════════╝', 'magenta');
  
  console.log('');
  
  if (isDryRun) {
    log('🔍 DRY RUN MODE - Preview only, no deletion', 'yellow');
    log('   Run without --dry-run to perform actual deletion\n', 'yellow');
  }

  try {
    // Connect to database
    log('🔌 Connecting to database...', 'blue');
    await mongoose.connect(MONGODB_URI);
    log(`✅ Connected successfully\n`, 'green');

    // Get all available collections
    const availableCollections = await listAllCollections();
    log(`📚 Database has ${availableCollections.length} total collections\n`, 'white');

    // Find matching collections
    const matchedCollections = [];
    const unmatchedRelated = [];

    // Check targeted collections
    for (const [key, config] of Object.entries(ALL_TARGET_COLLECTIONS)) {
      if (availableCollections.includes(config.name)) {
        const count = await countDocuments(config.name);
        matchedCollections.push({
          ...config,
          key,
          documentCount: count
        });
      }
    }

    // Find related collections not in our list
    const aiKeywords = ['ai', 'usage', 'token', 'credit', 'session', 'analytics', 'feature'];
    const marketKeywords = ['market', 'insight', 'trend', 'report', 'analysis', 'price', 
                           'demand', 'competitor', 'supplier', 'category', 'region', 
                           'buyer', 'search', 'tradelead'];
    
    const allKeywords = [...aiKeywords, ...marketKeywords];
    
    for (const collName of availableCollections) {
      if (!matchedCollections.find(c => c.name === collName)) {
        if (allKeywords.some(keyword => collName.toLowerCase().includes(keyword))) {
          const count = await countDocuments(collName);
          if (count > 0) {
            // Determine category
            const isAI = aiKeywords.some(k => collName.toLowerCase().includes(k));
            const isMarket = marketKeywords.some(k => collName.toLowerCase().includes(k));
            const category = isAI && isMarket ? 'Both' : isAI ? 'AI Usage' : 'Market Insights';
            
            unmatchedRelated.push({
              name: collName,
              displayName: collName,
              icon: '🔍',
              category,
              description: 'Auto-detected related collection',
              documentCount: count
            });
          }
        }
      }
    }

    // Sort by category and document count
    matchedCollections.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return b.documentCount - a.documentCount;
    });

    // Display Summary
    log('📊 DATA SUMMARY', 'bold');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');

    let totalDocs = 0;
    let aiUsageDocs = 0;
    let marketInsightsDocs = 0;
    let currentCategory = '';

    // Display matched collections by category
    for (const collection of matchedCollections) {
      if (collection.documentCount > 0) {
        if (collection.category !== currentCategory) {
          if (currentCategory) console.log('');
          log(`📂 ${collection.category}`, 'cyan');
          log('─'.repeat(54), 'dim');
          currentCategory = collection.category;
        }
        
        log(`${collection.icon} ${collection.displayName.padEnd(35)} ${String(collection.documentCount).padStart(8)} docs  ${collection.description}`, 'white');
        totalDocs += collection.documentCount;
        
        if (collection.category === 'AI Usage') {
          aiUsageDocs += collection.documentCount;
        } else {
          marketInsightsDocs += collection.documentCount;
        }
      }
    }

    // Display unmatched collections
    if (unmatchedRelated.length > 0) {
      console.log('');
      log(`📂 Additional Related Collections`, 'yellow');
      log('─'.repeat(54), 'dim');
      
      for (const collection of unmatchedRelated) {
        log(`${collection.icon} ${collection.name.padEnd(35)} ${String(collection.documentCount).padStart(8)} docs  ${collection.category}`, 'yellow');
        totalDocs += collection.documentCount;
      }
    }

    console.log('');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    log(`🧠 AI Usage Documents:      ${String(aiUsageDocs).padStart(8)}`, 'blue');
    log(`📊 Market Insights Docs:    ${String(marketInsightsDocs).padStart(8)}`, 'green');
    log(`📁 TOTAL Documents:         ${String(totalDocs).padStart(8)}`, 'bold');
    log(`📚 Collections Affected:    ${String(matchedCollections.filter(c => c.documentCount > 0).length + unmatchedRelated.length).padStart(8)}`, 'white');
    console.log('');

    if (totalDocs === 0) {
      log('✅ No AI usage or market insights data found!', 'green');
      log('   Database is already clean.\n', 'green');
      return;
    }

    // Dry run exit
    if (isDryRun) {
      log('🔍 Dry run completed successfully.', 'yellow');
      log('💡 Run without --dry-run to delete the data\n', 'yellow');
      
      // Show sample of what would be deleted
      log('📝 Sample of collections that would be deleted:', 'dim');
      matchedCollections
        .filter(c => c.documentCount > 0)
        .slice(0, 5)
        .forEach(c => log(`   • ${c.displayName} (${c.documentCount} documents)`, 'dim'));
      
      return;
    }

    // Warning
    log('⚠️  IMPORTANT WARNING:', 'red');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'red');
    log('• All AI usage statistics will be reset', 'red');
    log('• Market insights & analysis will be lost', 'red');
    log('• AI credit balances will be cleared', 'red');
    log('• Market reports will be deleted', 'red');
    log('• This action CANNOT be undone', 'red');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'red');

    // Environment check
    const env = process.env.NODE_ENV || 'development';
    log(`📍 Environment: ${env.toUpperCase()}`, 'yellow');
    
    if (env === 'production') {
      log('🚨 WARNING: You are connected to PRODUCTION!', 'red');
      const proceed = await askConfirmation('Type "PRODUCTION" to continue: ');
      if (proceed !== 'production') {
        log('\n❌ Operation cancelled.', 'green');
        return;
      }
    }

    // Final confirmation
    if (!skipConfirmation) {
      console.log('');
      log(`You are about to delete ${totalDocs} documents`, 'bold');
      
      const confirmation = await askConfirmation(
        'Type "DELETE AI AND INSIGHTS" to confirm: '
      );

      if (confirmation !== 'delete ai and insights') {
        log('\n❌ Deletion cancelled. No data was deleted.', 'green');
        return;
      }
    }

    // Start deletion
    console.log('');
    log('🗑️  STARTING DELETION...\n', 'red');

    const allToDelete = [
      ...matchedCollections.filter(c => c.documentCount > 0),
      ...unmatchedRelated
    ];

    const results = [];
    let totalDeleted = 0;
    const failedDeletions = [];
    
    // Delete with progress
    for (let i = 0; i < allToDelete.length; i++) {
      const collection = allToDelete[i];
      
      showProgress(i + 1, allToDelete.length, 
        `Deleting ${collection.displayName}...`);
      
      const result = await deleteCollection(collection.name);
      
      if (result.success) {
        results.push(result);
        totalDeleted += result.deletedCount;
      } else {
        failedDeletions.push({ ...collection, error: result.error });
      }
    }

    console.log('\n');
    
    // Results summary
    log('✅ DELETION COMPLETED', 'green');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    
    // Show by category
    log('\n📊 Deleted by Category:', 'bold');
    
    const aiCollections = results.filter(r => 
      matchedCollections.find(c => c.name === r.collectionName && c.category === 'AI Usage')
    );
    const marketCollections = results.filter(r => 
      matchedCollections.find(c => c.name === r.collectionName && c.category === 'Market Insights')
    );
    const otherCollections = results.filter(r => 
      !aiCollections.includes(r) && !marketCollections.includes(r)
    );

    if (aiCollections.length > 0) {
      const aiTotal = aiCollections.reduce((sum, r) => sum + r.deletedCount, 0);
      log(`🧠 AI Usage: ${aiCollections.length} collections, ${aiTotal} documents`, 'blue');
    }

    if (marketCollections.length > 0) {
      const marketTotal = marketCollections.reduce((sum, r) => sum + r.deletedCount, 0);
      log(`📊 Market Insights: ${marketCollections.length} collections, ${marketTotal} documents`, 'green');
    }

    if (otherCollections.length > 0) {
      const otherTotal = otherCollections.reduce((sum, r) => sum + r.deletedCount, 0);
      log(`🔍 Other Related: ${otherCollections.length} collections, ${otherTotal} documents`, 'yellow');
    }

    // Detailed list
    log('\n📋 Detailed Deletion Log:', 'dim');
    for (const result of results) {
      const collection = matchedCollections.find(c => c.name === result.collectionName);
      const icon = collection?.icon || '🔍';
      log(`${icon} ${result.collectionName.padEnd(35)} ${String(result.deletedCount).padStart(8)} deleted`, 'dim');
    }

    // Failed deletions
    if (failedDeletions.length > 0) {
      log('\n⚠️  FAILED DELETIONS:', 'red');
      for (const failed of failedDeletions) {
        log(`❌ ${failed.displayName}: ${failed.error}`, 'red');
      }
    }

    console.log('');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'white');
    log(`📊 TOTAL DELETED: ${totalDeleted} documents`, 'bold');
    log(`✅ SUCCESS: ${results.length} collections`, 'green');
    
    if (failedDeletions.length > 0) {
      log(`❌ FAILED: ${failedDeletions.length} collections`, 'red');
    }
    console.log('');

    // Verification
    log('🔍 Verifying deletion...', 'blue');
    let remainingDocs = 0;
    
    for (const collection of allToDelete) {
      const count = await countDocuments(collection.name);
      if (count > 0) {
        log(`⚠️  ${collection.displayName}: ${count} documents still remain`, 'yellow');
        remainingDocs += count;
      }
    }

    if (remainingDocs === 0) {
      log('\n✅ VERIFICATION PASSED - All data deleted successfully!', 'green');
    } else {
      log(`\n⚠️  VERIFICATION FAILED - ${remainingDocs} documents still exist`, 'yellow');
      log('💡 Try running the script again with elevated permissions', 'yellow');
    }

    // Post-deletion info
    log('\n📝 POST-DELETION NOTES:', 'cyan');
    log('• AI usage counters will reset for all users', 'white');
    log('• Users will see fresh market insights', 'white');
    log('• AI credit systems will need re-initialization', 'white');
    log('• Market trend data will rebuild over time', 'white');
    log('• Cache may need to be cleared separately', 'white');

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

// Run
main();