import mongoose from 'mongoose';
import { getAIKnowledgeConnection } from '../config/knowledge-database.js';

export const knowledgeChunkSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  chunkIndex: {
    type: Number,
    required: true,
  },
  heading: {
    type: String,
    default: '',
  },
  content: {
    type: String,
    required: true,
  },
  searchableText: {
    type: String,
    required: true,
  },
  keywords: {
    type: [String],
    default: [],
  },
  language: {
    type: String,
    default: 'en',
    index: true,
  },
  intentTags: {
    type: [String],
    default: [],
    index: true,
  },
  embedding: {
    type: [Number],
    select: false,
  },
  embeddingModel: {
    type: String,
    select: false,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

knowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
knowledgeChunkSchema.index(
  { content: 'text', heading: 'text', searchableText: 'text', keywords: 'text' },
  {
    name: 'knowledge_chunk_text',
    weights: { heading: 10, keywords: 8, content: 5, searchableText: 2 },
  },
);

export function getKnowledgeChunkModel() {
  const connection = getAIKnowledgeConnection();
  return connection.models.KnowledgeChunk
    || connection.model('KnowledgeChunk', knowledgeChunkSchema, 'knowledge_chunks');
}

export default getKnowledgeChunkModel;
