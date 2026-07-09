import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    notificationType: {
      type: String,
      enum: [
        'message',
        'order_placed',
        'order_pending',
        'order_pending_approval',
        'order_awaiting_payment',
        'order_pending_payment',
        'order_payment_confirmed',
        'order_confirmed',
        'order_processing',
        'order_production',
        'order_ready_to_ship',
        'order_shipped',
        'order_delivered',
        'order_completed',
        'order_cancelled',
        'order_refunded',
        'order_rejected',
        'order_disputed',
        'new_inquiry',
        'rfq_created',
        'quotation_received',
        'quotation_accepted',
        'quotation_rejected',
        'quotation_counter_offer',
        'quotation_revised',
        'rfq_converted_to_order',
        'quotation_revision_requested',
        'trade_order_created',
        'payment_received',
        'verification_approved',
        'subscription_expiring',
        'subscription_renewed',
        'product_viewed',
        'product_update',
        'review_received',
        'review_response',
        'rating_received',
        'supplier_response',
        'sample_order_update',
        'account_update',
        'trade_order_created',
        'payment_released',
        'payment_refunded',
        'escrow_created',
        'escrow_funded',
        'escrow_released',
        'shipment_created',
        'shipment_in_transit',
        'shipment_delivered',
        'inspection_scheduled',
        'inspection_completed',
        'dispute_filed',
        'dispute_resolved',
        'financing_applied',
        'financing_approved',
        'financing_funded',
        'customs_submitted',
        'customs_cleared',
        'customs_held',
        'document_shared',
        'document_signed',
        'message_received',
        'system_alert',
        'service_request_created',
        'service_request_updated',
        'document_generated',
        'trade_assurance_active',
        'consulting_inquiry',
        'financing_applied',
        'shipment_booked',
        'shipment_cancelled',
        'inventory_added',
        'warehouse_order_created',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    data: {
      relatedId: mongoose.Schema.Types.ObjectId,
      relatedModel: String, // 'Chat', 'Order', 'Message', etc.
      actionUrl: String,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
notificationSchema.index({
  title: 'text',
  description: 'text',
  notificationType: 'text',
  priority: 'text',
  'data.relatedModel': 'text',
});

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
