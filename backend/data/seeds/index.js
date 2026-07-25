import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { marked } from 'marked';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { dirname } from 'path';

// ES Module equivalents
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MONGODB_URI: process.env.AI_KNOWLEDGE_MONGODB_URI || 'mongodb://localhost:27017/esyglob_knowledge',
  KNOWLEDGE_BASE_PATH: path.join(__dirname, '../knowledge-base'),
  BATCH_SIZE: parseInt(process.env.SEED_BATCH_SIZE) || 50,
  EMBEDDING_MODEL: 'text-embedding-ada-002',
  CHUNK_SIZE: parseInt(process.env.SEED_CHUNK_SIZE) || 500,
  CHUNK_OVERLAP: parseInt(process.env.SEED_CHUNK_OVERLAP) || 100,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ENV: process.env.SEED_ENV || 'development',
  DRY_RUN: process.env.DRY_RUN === 'true',
  MAX_CONTENT_LENGTH: 8000,
  EMBEDDING_DIMENSION: 1536
};

// ============================================================
// OPENAI CLIENT (optional)
// ============================================================

let openai = null;
if (CONFIG.OPENAI_API_KEY) {
  try {
    const { OpenAI } = await import('openai');
    openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
    console.log('✅ OpenAI client initialized');
  } catch (error) {
    console.warn('⚠️ OpenAI not initialized, embeddings will use fallback');
    console.warn(`   Error: ${error.message}`);
  }
}

// ============================================================
// MONGODB SCHEMA DEFINITION
// ============================================================

const KnowledgeSchema = new mongoose.Schema({
  // Core Fields
  title: { type: String, required: true, index: true },
  slug: { type: String, required: true, unique: true, index: true },
  category: { type: String, required: true, index: true },
  subcategory: { type: String, index: true },
  
  // Content Fields
  content: { type: String, required: true },
  summary: { type: String },
  contentHtml: { type: String },
  
  // Metadata
  frontmatter: { type: mongoose.Schema.Types.Mixed, default: {} },
  tags: { type: [String], index: true },
  language: { type: String, default: 'en', index: true },
  version: { type: String, default: '1.0' },
  lastUpdated: { type: Date, default: Date.now },
  
  // Keywords and Search
  keywords: { type: [String], index: true },
  entities: { type: [String] },
  
  // Embeddings
  embedding: { type: [Number], index: 'vector', sparse: true },
  
  // Chunking Information
  chunks: [{
    content: String,
    embedding: [Number],
    startIndex: Number,
    endIndex: Number
  }],
  
  // Relationships
  relatedDocuments: [{ type: String, ref: 'Knowledge' }],
  references: [{
    title: String,
    slug: String,
    type: String,
    url: String
  }],
  
  // Status and Workflow
  status: { 
    type: String, 
    enum: ['draft', 'published', 'archived', 'generated'], 
    default: 'published',
    index: true 
  },
  
  // Audit Fields
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  seededBy: { type: String, default: 'seed-script' },
  
  // Analytics
  views: { type: Number, default: 0 },
  helpful: { type: Number, default: 0 },
  notHelpful: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
KnowledgeSchema.index({ slug: 1 });
KnowledgeSchema.index({ category: 1 });
KnowledgeSchema.index({ tags: 1 });
KnowledgeSchema.index({ status: 1 });
KnowledgeSchema.index({ lastUpdated: -1 });

const Knowledge = mongoose.model('Knowledge', KnowledgeSchema);

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Read all markdown files recursively
 */
async function readMarkdownFiles(dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await readMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relativePath = path.relative(CONFIG.KNOWLEDGE_BASE_PATH, fullPath);
        const pathParts = relativePath.split(path.sep);
        const category = pathParts[0] || 'uncategorized';
        const subcategory = pathParts.length > 1 ? pathParts.slice(1, -1).join('/') : '';
        
        files.push({
          filePath: fullPath,
          fileName: entry.name,
          category,
          subcategory,
          relativePath
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

/**
 * Parse markdown file with frontmatter
 */
function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: markdownContent } = matter(content);
  
  const fileName = path.basename(filePath, '.md');
  const title = frontmatter.title || fileName.replace(/-/g, ' ').replace(/_/g, ' ');
  const slug = frontmatter.slug || fileName;
  
  // Generate summary
  let summary = frontmatter.summary || '';
  if (!summary) {
    const plainText = markdownContent.replace(/[#*_`]/g, '').trim();
    summary = plainText.substring(0, 200) + (plainText.length > 200 ? '...' : '');
  }
  
  // Extract keywords from content
  const keywords = extractKeywords(markdownContent);
  
  // Determine status from folder path
  let status = frontmatter.status || 'published';
  if (filePath.includes('/drafts/') || filePath.includes('/draft/')) {
    status = 'draft';
  } else if (filePath.includes('/archived/')) {
    status = 'archived';
  } else if (filePath.includes('/generated/')) {
    status = 'generated';
  }
  
  return {
    title,
    slug,
    category: frontmatter.category || 'uncategorized',
    content: markdownContent,
    summary,
    frontmatter,
    tags: frontmatter.tags || [],
    keywords,
    language: frontmatter.language || 'en',
    version: frontmatter.version || '1.0',
    lastUpdated: frontmatter.lastUpdated ? new Date(frontmatter.lastUpdated) : new Date(),
    status,
    references: frontmatter.references || []
  };
}

/**
 * Extract keywords from content
 */
function extractKeywords(content) {
  const plainText = content.replace(/[#*_`\[\]()]/g, '').toLowerCase();
  const words = plainText.match(/\b[A-Za-z]{3,}\b/g) || [];
  
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 
    'her', 'was', 'one', 'our', 'out', 'use', 'will', 'what', 'when', 
    'which', 'with', 'your', 'from', 'have', 'this', 'that', 'they', 
    'then', 'there', 'about', 'also', 'more', 'than', 'been', 'into', 
    'only', 'other', 'some', 'such', 'then', 'them', 'these', 'their',
    'thing', 'would', 'could', 'should', 'does', 'did', 'has', 'were'
  ]);
  
  const wordCount = {};
  for (const word of words) {
    if (word.length > 2 && !stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  }
  
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * Generate embedding for text using OpenAI or fallback
 */
async function generateEmbedding(text) {
  if (!openai) {
    // Fallback: generate deterministic hash-based vector
    const hash = crypto.createHash('sha256').update(text.slice(0, 500)).digest('hex');
    const seed = parseInt(hash.slice(0, 8), 16);
    const rng = createSeededRandom(seed);
    return Array(CONFIG.EMBEDDING_DIMENSION).fill(0).map(() => rng() * 2 - 1);
  }
  
  try {
    const response = await openai.embeddings.create({
      model: CONFIG.EMBEDDING_MODEL,
      input: text.slice(0, CONFIG.MAX_CONTENT_LENGTH)
    });
    return response.data[0].embedding;
  } catch (error) {
    console.warn(`⚠️ Embedding generation failed: ${error.message}`);
    // Fallback to deterministic vector
    const hash = crypto.createHash('sha256').update(text.slice(0, 500)).digest('hex');
    const seed = parseInt(hash.slice(0, 8), 16);
    const rng = createSeededRandom(seed);
    return Array(CONFIG.EMBEDDING_DIMENSION).fill(0).map(() => rng() * 2 - 1);
  }
}

/**
 * Create a seeded random number generator
 */
function createSeededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/**
 * Chunk content for better retrieval
 */
function chunkContent(content, maxSize = CONFIG.CHUNK_SIZE, overlap = CONFIG.CHUNK_OVERLAP) {
  // Split by paragraphs
  const paragraphs = content.split(/\n\n+/);
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphSize = paragraph.length;
    
    if (currentSize + paragraphSize > maxSize && currentChunk.length > 0) {
      // Save current chunk
      const chunkContent = currentChunk.join('\n\n');
      chunks.push({
        content: chunkContent,
        startIndex: chunks.reduce((sum, c) => sum + c.content.length + 2, 0),
        endIndex: chunks.reduce((sum, c) => sum + c.content.length + 2, 0) + chunkContent.length
      });
      
      // Start new chunk with overlap
      const overlapAmount = Math.floor(overlap / 100 * currentChunk.length);
      const overlapStart = Math.max(0, currentChunk.length - overlapAmount);
      currentChunk = currentChunk.slice(overlapStart);
      currentSize = currentChunk.join('\n\n').length;
    }
    
    currentChunk.push(paragraph);
    currentSize += paragraphSize + 2;
  }
  
  // Add last chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n\n');
    chunks.push({
      content: chunkContent,
      startIndex: chunks.reduce((sum, c) => sum + c.content.length + 2, 0),
      endIndex: chunks.reduce((sum, c) => sum + c.content.length + 2, 0) + chunkContent.length
    });
  }
  
  return chunks;
}

/**
 * Find related documents using keyword matching
 */
function findRelatedDocuments(document, allDocuments, maxResults = 5) {
  const keywords = document.keywords || [];
  const related = [];
  
  for (const doc of allDocuments) {
    if (doc.slug === document.slug) continue;
    
    let score = 0;
    for (const keyword of keywords) {
      if (doc.content?.toLowerCase().includes(keyword.toLowerCase())) score += 1;
      if (doc.title?.toLowerCase().includes(keyword.toLowerCase())) score += 2;
      if (doc.tags?.some(t => keyword.toLowerCase().includes(t.toLowerCase()) || 
                            t.toLowerCase().includes(keyword.toLowerCase()))) score += 3;
      if (doc.keywords?.some(k => keyword.toLowerCase().includes(k.toLowerCase()) || 
                                 k.toLowerCase().includes(keyword.toLowerCase()))) score += 2;
    }
    
    if (score > 0) {
      related.push({ slug: doc.slug, score });
    }
  }
  
  related.sort((a, b) => b.score - a.score);
  return related.slice(0, maxResults).map(r => r.slug);
}

/**
 * Process a batch of documents
 */
async function processBatch(batch, allDocuments, stats) {
  const results = [];
  const startTime = Date.now();
  
  for (const document of batch) {
    try {
      // Generate document embedding
      const searchText = `${document.title} ${document.content.slice(0, 2000)} ${document.tags?.join(' ')}`;
      const embedding = await generateEmbedding(searchText);
      
      // Chunk content
      const chunks = chunkContent(document.content);
      
      // Generate embeddings for chunks
      const chunksWithEmbeddings = [];
      for (const chunk of chunks) {
        const chunkEmbedding = await generateEmbedding(chunk.content);
        chunksWithEmbeddings.push({
          ...chunk,
          embedding: chunkEmbedding
        });
      }
      
      // Find related documents
      const relatedSlugs = findRelatedDocuments(document, allDocuments);
      
      // Prepare document for database
      const docData = {
        title: document.title,
        slug: document.slug,
        category: document.category,
        subcategory: document.subcategory || '',
        content: document.content,
        summary: document.summary,
        contentHtml: marked(document.content || ''),
        frontmatter: document.frontmatter || {},
        tags: document.tags || [],
        language: document.language || 'en',
        version: document.version || '1.0',
        lastUpdated: document.lastUpdated || new Date(),
        keywords: document.keywords || [],
        embedding: embedding,
        chunks: chunksWithEmbeddings,
        relatedDocuments: relatedSlugs,
        references: document.references || [],
        status: document.status || 'published',
        seededBy: 'seed-script',
        views: 0,
        helpful: 0,
        notHelpful: 0
      };

      if (CONFIG.DRY_RUN) {
        results.push({
          slug: document.slug,
          title: document.title,
          category: document.category,
          status: 'dry-run',
          chunks: chunks.length,
          relatedDocs: relatedSlugs.length
        });
        stats.dryRun++;
      } else {
        // Upsert document
        const result = await Knowledge.findOneAndUpdate(
          { slug: document.slug },
          docData,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        results.push({
          slug: result.slug,
          title: result.title,
          category: result.category,
          status: 'success',
          id: result._id,
          chunks: chunksWithEmbeddings.length,
          relatedDocs: relatedSlugs.length
        });
        stats.success++;
      }

      stats.total++;
      
      if (stats.total % 10 === 0) {
        console.log(`  📊 Processed ${stats.total} documents...`);
      }

    } catch (error) {
      console.error(`  ❌ Error seeding ${document.title}:`, error.message);
      results.push({
        slug: document.slug,
        title: document.title,
        status: 'error',
        error: error.message
      });
      stats.errors++;
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  ⏱️ Batch completed in ${elapsed}s (${batch.length} documents)`);
  
  return results;
}

// ============================================================
// MAIN SEEDING FUNCTION
// ============================================================

async function seedDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 EsyGlob Knowledge Base Seed Script');
  console.log('='.repeat(60));
  console.log(`📁 Knowledge Base: ${CONFIG.KNOWLEDGE_BASE_PATH}`);
  console.log(`🌐 Environment: ${CONFIG.ENV}`);
  console.log(`🔧 Dry Run: ${CONFIG.DRY_RUN ? '✅ YES' : '❌ NO'}`);
  console.log(`📦 MongoDB: ${CONFIG.MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
  console.log(`📊 Batch Size: ${CONFIG.BATCH_SIZE}`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  const stats = {
    total: 0,
    success: 0,
    errors: 0,
    dryRun: 0,
    chunksTotal: 0,
    relatedTotal: 0
  };

  try {
    // Connect to MongoDB - FIXED: Removed deprecated options
    console.log('\n📡 Connecting to MongoDB...');
    await mongoose.connect(CONFIG.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data if in development
    if (CONFIG.ENV === 'development' && !CONFIG.DRY_RUN) {
      console.log('\n🧹 Clearing existing knowledge documents (development mode)...');
      const deleteResult = await Knowledge.deleteMany({});
      console.log(`✅ Deleted ${deleteResult.deletedCount} documents`);
    }

    // Read all markdown files
    console.log('\n📖 Reading markdown files...');
    const markdownFiles = await readMarkdownFiles(CONFIG.KNOWLEDGE_BASE_PATH);
    console.log(`📄 Found ${markdownFiles.length} markdown files`);

    if (markdownFiles.length === 0) {
      console.log('⚠️ No markdown files found. Please check the knowledge-base path.');
      return;
    }

    // Parse all files
    console.log('\n🔍 Parsing markdown files...');
    const parsedDocuments = [];
    const parseErrors = [];
    
    for (const fileInfo of markdownFiles) {
      try {
        const parsed = parseMarkdownFile(fileInfo.filePath);
        parsed.fileInfo = fileInfo;
        parsedDocuments.push(parsed);
      } catch (error) {
        console.error(`  ❌ Error parsing ${fileInfo.filePath}:`, error.message);
        parseErrors.push({ file: fileInfo.filePath, error: error.message });
      }
    }
    
    console.log(`📝 Successfully parsed ${parsedDocuments.length} documents`);
    if (parseErrors.length > 0) {
      console.log(`⚠️ ${parseErrors.length} documents had parsing errors`);
    }

    // Show category breakdown
    const categoryBreakdown = {};
    for (const doc of parsedDocuments) {
      categoryBreakdown[doc.category] = (categoryBreakdown[doc.category] || 0) + 1;
    }
    console.log('\n📊 Category Breakdown:');
    for (const [category, count] of Object.entries(categoryBreakdown).sort()) {
      console.log(`  ${category}: ${count} documents`);
    }

    // Process documents in batches
    console.log(`\n🔄 Processing ${parsedDocuments.length} documents in batches of ${CONFIG.BATCH_SIZE}...`);
    
    let allResults = [];
    const totalBatches = Math.ceil(parsedDocuments.length / CONFIG.BATCH_SIZE);
    
    for (let i = 0; i < parsedDocuments.length; i += CONFIG.BATCH_SIZE) {
      const batch = parsedDocuments.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNum = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
      
      console.log(`\n📦 Processing Batch ${batchNum}/${totalBatches} (${batch.length} documents)`);
      console.log('-'.repeat(40));
      
      const batchResults = await processBatch(batch, parsedDocuments, stats);
      allResults.push(...batchResults);
    }

    // Create vector search index
    if (!CONFIG.DRY_RUN) {
      try {
        console.log('\n🔍 Creating vector search index...');
        const collection = mongoose.connection.collection('knowledges');
        await collection.createIndex({ embedding: 1 });
        console.log('✅ Vector index created');
      } catch (error) {
        console.warn('⚠️ Could not create vector index:', error.message);
      }
    }

    // ============================================================
    // SEED SUMMARY
    // ============================================================
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SEED SUMMARY');
    console.log('='.repeat(60));
    console.log(`⏱️ Total Time: ${elapsed}s`);
    console.log(`📄 Total Files: ${markdownFiles.length}`);
    console.log(`📝 Parsed Successfully: ${parsedDocuments.length}`);
    console.log(`✅ Successfully Seeded: ${stats.success}`);
    console.log(`❌ Errors: ${stats.errors}`);
    console.log(`🔧 Dry Run: ${stats.dryRun}`);
    
    if (stats.success > 0) {
      console.log(`\n📊 Success Rate: ${((stats.success / (stats.success + stats.errors)) * 100).toFixed(1)}%`);
    }
    
    if (parseErrors.length > 0) {
      console.log('\n⚠️ Parse Errors:');
      parseErrors.slice(0, 5).forEach(err => {
        console.log(`  - ${path.basename(err.file)}: ${err.error}`);
      });
      if (parseErrors.length > 5) {
        console.log(`  ... and ${parseErrors.length - 5} more`);
      }
    }

    // Show sample of seeded documents
    if (!CONFIG.DRY_RUN && stats.success > 0) {
      console.log('\n📄 Sample Seeded Documents:');
      const samples = await Knowledge.find()
        .limit(5)
        .select('title category slug status')
        .lean();
      samples.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. ${doc.title}`);
        console.log(`     Category: ${doc.category}`);
        console.log(`     Slug: ${doc.slug}`);
        console.log(`     Status: ${doc.status}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Seed completed successfully!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// ============================================================
// RUN THE SEED
// ============================================================

// Check if running directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export {
  seedDatabase,
  Knowledge,
  parseMarkdownFile,
  generateEmbedding,
  chunkContent,
  readMarkdownFiles,
  CONFIG
};