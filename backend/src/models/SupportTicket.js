import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roleContext: {
      type: String,
      enum: ['buyer', 'seller', 'admin', 'general'],
      default: 'general',
      index: true,
    },
    issueType: {
      type: String,
      enum: ['account', 'login', 'verification', 'seller_onboarding', 'product', 'supplier', 'order', 'payment', 'shipping', 'service', 'complaint', 'other'],
      default: 'other',
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    relatedModel: String,
    relatedId: mongoose.Schema.Types.ObjectId,
    aiChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIChat',
    },
    status: {
      type: String,
      enum: ['open', 'triaged', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    source: {
      type: String,
      enum: ['ai_support', 'manual'],
      default: 'ai_support',
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
supportTicketSchema.index({
  subject: 'text',
  description: 'text',
  issueType: 'text',
  status: 'text',
  priority: 'text',
  roleContext: 'text',
});

export default mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);
