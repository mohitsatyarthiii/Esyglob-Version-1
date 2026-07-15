import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    currency: { type: String, default: 'INR' },
    subtotal: Number,
    taxAmount: Number,
    shippingAmount: Number,
    discountAmount: { type: Number, default: 0 },
    totalAmount: Number,
    status: { type: String, enum: ['draft', 'issued', 'paid', 'void'], default: 'draft' },
    paymentStatus: { type: String, enum: ['pending', 'partial', 'paid', 'refunded'], default: 'pending' },
    issuedAt: Date,
    dueAt: Date,
    documentUrl: String,
    lineItems: [{ description: String, quantity: Number, unit: String, unitPrice: Number, total: Number }],
    buyerSnapshot: mongoose.Schema.Types.Mixed,
    sellerSnapshot: mongoose.Schema.Types.Mixed,
    shipmentSnapshot: mongoose.Schema.Types.Mixed,
    serviceSnapshot: mongoose.Schema.Types.Mixed,
    transactionId: String,
    paymentMethod: String,
    paymentDate: Date,
    companySnapshot: mongoose.Schema.Types.Mixed,
    terms: [String],
    downloadToken: { type: String, unique: true, sparse: true, index: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ sellerUserId: 1, status: 1, createdAt: -1 });

export default mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
