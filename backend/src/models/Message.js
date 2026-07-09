import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'voice', 'product', 'order', 'quotation', 'rfq', 'action', 'system'],
      default: 'text',
    },
    attachments: [
      {
        url: String,
        type: String,
        name: String,
        size: Number,
        mimeType: String,
      },
    ],
    // Context References
    productDetails: {
      productId: mongoose.Schema.Types.ObjectId,
      productName: String,
      price: Number,
      image: String,
      productLink: String,
      supplierName: String,
      supplierId: mongoose.Schema.Types.ObjectId,
      specifications: mongoose.Schema.Types.Mixed,
    },
    orderDetails: {
      orderId: mongoose.Schema.Types.ObjectId,
      orderNumber: String,
      productId: mongoose.Schema.Types.ObjectId,
      quantity: Number,
      price: Number,
      orderStatus: String,
      actionUrl: String,
    },
    // RFQ & Quotation sharing
    rfqDetails: {
      rfqId: mongoose.Schema.Types.ObjectId,
      title: String,
      product: String,
      quantity: Number,
      unit: String,
      targetPrice: Number,
      status: String,
      date: Date,
      actionUrl: String,
    },
    quotationDetails: {
      quotationId: mongoose.Schema.Types.ObjectId,
      rfqId: mongoose.Schema.Types.ObjectId,
      product: String,
      unitPrice: Number,
      currency: String,
      minimumOrderQuantity: Number,
      leadTime: Number,
      leadTimeUnit: String,
      status: String,
      actionUrl: String,
    },
    // Action buttons in chat
    actionType: {
      type: String,
      enum: ['request_sample', 'start_order', 'proceed_to_order', 'request_revision'],
    },
    // Read Status
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    deliveryStatus: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'seen'],
      default: 'sent',
      index: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, createdAt: 1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, isRead: 1 });
messageSchema.index({ receiverId: 1, isRead: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, receiverId: 1, deliveredAt: 1 });

export default mongoose.models.Message || mongoose.model('Message', messageSchema);
