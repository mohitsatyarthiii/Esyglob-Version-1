import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  paymentNumber: {
    type: String,
    unique: true,
    required: true,
  },

  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  orderAmount: Number,
  platformFeeRate: Number,
  platformFee: { type: Number, default: 0 },
  gatewayFee: { type: Number, default: 0 },
  netAmount: Number,
  type: {
    type: String,
    enum: [
      'order_payment',
      'escrow_deposit',
      'escrow_release',
      'shipping_fee',
      'inspection_fee',
      'verification_fee',
      'financing_repayment',
      'customs_duty',
      'refund',
      'other',
    ],
    default: 'order_payment',
  },
  paymentFor: {
    type: String,
    enum: ['order', 'subscription', 'verification', 'service', 'other'],
    default: 'order',
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
  },

  entityType: {
    type: String,
    enum: ['order', 'escrow', 'shipping', 'inspection', 'verification', 'financing', 'customs'],
  },
  entityId: mongoose.Schema.Types.ObjectId,

  method: {
    type: String,
    enum: ['bank_transfer', 'credit_card', 'debit_card', 'wire_transfer', 'digital_wallet', 'upi', 'razorpay'],
    default: 'razorpay',
  },
  paymentMethod: {
    type: String,
    default: 'razorpay',
  },

  status: {
    type: String,
    enum: ['initiated', 'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'initiated',
  },

  gateway: { type: String, default: 'razorpay' },
  gatewayPaymentId: String,
  gatewayResponse: mongoose.Schema.Types.Mixed,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  transactionId: String,
  paidAt: Date,
  metadata: mongoose.Schema.Types.Mixed,

  bankDetails: {
    bankName: String,
    accountNumber: String,
    ifscCode: String,
    swiftCode: String,
    beneficiaryName: String,
  },

  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,

  invoiceUrl: String,
  description: String,

  paymentDate: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

paymentSchema.pre('validate', async function setPaymentNumber() {
  try {
    if (this.isNew && !this.paymentNumber) {
      const PaymentModel = mongoose.models.Payment;
      const count = PaymentModel ? await PaymentModel.countDocuments() : 0;
      this.paymentNumber = `PAY${String(count + 1).padStart(8, '0')}`;
    }
  } catch (error) {
    if (!this.paymentNumber) {
      this.paymentNumber = `PAY${Date.now().toString(36).toUpperCase()}`;
    }
  }
});

paymentSchema.pre('save', function setUpdatedAt() {
  this.updatedAt = new Date();
});

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1, paymentFor: 1, status: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ paymentFor: 1, status: 1, createdAt: -1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({
  paymentNumber: 'text',
  transactionId: 'text',
  razorpayOrderId: 'text',
  razorpayPaymentId: 'text',
  description: 'text',
  status: 'text',
  paymentMethod: 'text',
});

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

export default Payment;
