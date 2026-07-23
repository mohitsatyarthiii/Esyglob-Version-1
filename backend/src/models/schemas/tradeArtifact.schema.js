import mongoose from 'mongoose';

export const tradeNoteSchema = new mongoose.Schema({
  noteType: { type: String, enum: ['internal', 'shared', 'negotiation', 'commercial', 'technical'], default: 'shared' },
  text: { type: String, required: true, trim: true, maxlength: 5000 },
  visibility: { type: String, enum: ['private', 'participants'], default: 'participants' },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['buyer', 'seller', 'admin'], required: true },
  attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  documentId: mongoose.Schema.Types.ObjectId,
  editedAt: Date,
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

export const signatureSchema = new mongoose.Schema({
  signerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  signerRole: { type: String, enum: ['buyer', 'seller'], required: true },
  signerName: { type: String, trim: true, required: true },
  signatureType: { type: String, enum: ['typed', 'drawn', 'uploaded'], default: 'typed' },
  signatureValue: { type: String, required: true },
  signedAt: { type: Date, default: Date.now },
  termsAccepted: { type: Boolean, required: true, default: false },
  termsVersion: { type: String, trim: true },
  termsAcceptedAt: Date,
  ipAddress: String,
  userAgent: String,
}, { _id: true });

export const tradeDocumentSchema = new mongoose.Schema({
  documentType: { type: String, enum: ['commercial_proposal', 'quotation', 'proforma_invoice', 'purchase_agreement', 'commercial_agreement', 'technical_specification', 'terms_document', 'drawing', 'certificate', 'invoice', 'packing_list', 'inspection_report', 'shipping_document', 'other'], default: 'other' },
  title: { type: String, required: true, trim: true, maxlength: 250 },
  url: String,
  previewUrl: String,
  filename: String,
  source: { type: String, enum: ['uploaded', 'generated', 'system'], default: 'uploaded' },
  status: { type: String, enum: ['draft', 'awaiting_seller_signature', 'awaiting_buyer_signature', 'completed', 'void'], default: 'draft' },
  version: { type: Number, min: 1, default: 1 },
  requiresBuyerSignature: { type: Boolean, default: false },
  requiresSellerSignature: { type: Boolean, default: false },
  signatures: { type: [signatureSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: true });

export const activitySchema = new mongoose.Schema({
  action: { type: String, required: true },
  status: String,
  message: String,
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });
