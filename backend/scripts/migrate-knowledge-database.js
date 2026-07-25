import mongoose from 'mongoose';
import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import {
  closeAIKnowledgeDatabase,
  connectToAIKnowledgeDatabase,
} from '../src/config/knowledge-database.js';
import KnowledgeBaseService from '../src/services/knowledge-base.service.js';

const apply = process.argv.includes('--apply');

async function run() {
  await Promise.all([connectToDatabase(), connectToAIKnowledgeDatabase()]);
  const sourceCollectionName = process.env.LEGACY_KNOWLEDGE_COLLECTION || 'knowledgedocuments';
  const source = mongoose.connection.db.collection(sourceCollectionName);
  const documents = await source.find({}).toArray();

  console.log(`Found ${documents.length} legacy knowledge documents in ${sourceCollectionName}.`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to copy them to the isolated AI knowledge database.');
    return;
  }

  let migrated = 0;
  let skipped = 0;
  for (const document of documents) {
    const content = document.content || document.overview || document.summary;
    if (!content) {
      skipped += 1;
      continue;
    }
    await KnowledgeBaseService.ingest({
      payload: {
        ...document,
        _id: undefined,
        status: document.status || 'published',
        force: false,
      },
      content,
      source: {
        type: 'migration',
        fileName: sourceCollectionName,
        uri: `marketplace-db://${sourceCollectionName}/${document._id}`,
      },
    }, document.updatedBy);
    migrated += 1;
  }
  console.log(`Migration complete: ${migrated} copied, ${skipped} skipped.`);
}

run()
  .catch(error => {
    console.error('Knowledge migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([closeDatabase(), closeAIKnowledgeDatabase()]);
  });
