import mongoose from 'mongoose';

const aiChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    
    // Conversation
    title: {
      type: String,
      trim: true,
    },
    roleContext: {
      type: String,
      enum: ['buyer', 'seller', 'admin', 'general'],
      default: 'general',
      index: true,
    },
    conversationType: {
      type: String,
      enum: ['assistant', 'search', 'product', 'rfq', 'quotation', 'support'],
      default: 'assistant',
      index: true,
    },
    provider: {
      type: String,
      default: 'ollama',
    },
    model: String,
    messages: [
      {
        role: {
          type: String,
          enum: ['user', 'assistant'],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        tokens: Number,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],
    
    // Context
    context: {
      searchType: String,
      searchFilters: mongoose.Schema.Types.Mixed,
      lastQuery: String,
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      rfqId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RFQ',
      },
      quotationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quotation',
      },
      supportMode: Boolean,
      sourcePath: String,
      feature: String,
      marketplaceSnapshot: mongoose.Schema.Types.Mixed,
    },
    
    // Status
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    
    // Analytics
    totalTokensUsed: {
      type: Number,
      default: 0,
    },
    totalMessages: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      { userId: 1, createdAt: -1 },
      { userId: 1, status: 1 },
      { subscriptionId: 1 },
    ],
  }
);

export default mongoose.models.AIChat || mongoose.model('AIChat', aiChatSchema);
