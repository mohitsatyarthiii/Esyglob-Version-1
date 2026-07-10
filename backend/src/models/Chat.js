import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    pairKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Chat Context
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    // RFQ-linked negotiation support
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    // Chat purpose
    chatType: {
      type: String,
      enum: ['general', 'product_enquiry', 'rfq_negotiation', 'order_support', 'group'],
      default: 'general',
    },
    groupName: {
      type: String,
      trim: true,
    },
    groupMembers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    groupCreatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastMessage: {
      type: String,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    buyerUnreadCount: {
      type: Number,
      default: 0,
    },
    sellerUnreadCount: {
      type: Number,
      default: 0,
    },
    buyerArchivedAt: {
      type: Date,
      default: null,
    },
    sellerArchivedAt: {
      type: Date,
      default: null,
    },
    buyerPinnedAt: {
      type: Date,
      default: null,
    },
    sellerPinnedAt: {
      type: Date,
      default: null,
    },
    buyerMutedAt: {
      type: Date,
      default: null,
    },
    sellerMutedAt: {
      type: Date,
      default: null,
    },
    buyerFavoriteAt: {
      type: Date,
      default: null,
    },
    sellerFavoriteAt: {
      type: Date,
      default: null,
    },
    buyerSavedSupplierAt: {
      type: Date,
      default: null,
    },
    sellerSavedBuyerAt: {
      type: Date,
      default: null,
    },
    buyerLabel: {
      type: String,
      default: '',
      trim: true,
    },
    sellerLabel: {
      type: String,
      default: '',
      trim: true,
    },
    buyerBlockedAt: {
      type: Date,
      default: null,
    },
    sellerBlockedAt: {
      type: Date,
      default: null,
    },
    buyerDeletedAt: {
      type: Date,
      default: null,
    },
    sellerDeletedAt: {
      type: Date,
      default: null,
    },
    orderEligibility: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        enabledBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        enabledAt: {
          type: Date,
          default: Date.now,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
  },
  { timestamps: true }
);

chatSchema.index({ buyerId: 1, sellerId: 1 });
chatSchema.index({ buyerId: 1, lastMessageAt: -1 });
chatSchema.index({ sellerId: 1, lastMessageAt: -1 });
chatSchema.index({ buyerId: 1, isActive: 1, lastMessageAt: -1 });
chatSchema.index({ sellerId: 1, isActive: 1, lastMessageAt: -1 });
chatSchema.index({ buyerId: 1, buyerDeletedAt: 1, lastMessageAt: -1 });
chatSchema.index({ sellerId: 1, sellerDeletedAt: 1, lastMessageAt: -1 });
chatSchema.index({ buyerId: 1, buyerArchivedAt: 1, buyerBlockedAt: 1, buyerPinnedAt: -1, lastMessageAt: -1 });
chatSchema.index({ sellerId: 1, sellerArchivedAt: 1, sellerBlockedAt: 1, sellerPinnedAt: -1, lastMessageAt: -1 });
chatSchema.index({ rfqId: 1 });
chatSchema.index({ quotationId: 1 });
chatSchema.index({ 'orderEligibility.productId': 1 });
chatSchema.index({ isActive: 1 });
chatSchema.index({ groupMembers: 1, updatedAt: -1 });

export default mongoose.models.Chat || mongoose.model('Chat', chatSchema);
