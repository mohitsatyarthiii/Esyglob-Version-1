import mongoose from 'mongoose';

const feeSlabSchema = new mongoose.Schema(
  {
    minAmount: { type: Number, required: true, min: 0 },
    maxAmount: { type: Number, default: null },
    rate: { type: Number, required: true, min: 0 },
    label: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const providerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['logistics', 'tracking', 'insurance', 'escrow', 'trade_assurance', 'gst', 'invoice', 'payment', 'email', 'sms', 'whatsapp', 'push'],
      required: true,
    },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'inactive', 'sandbox'], default: 'inactive' },
    priority: { type: Number, default: 100 },
    timeoutMs: { type: Number, default: 15000 },
    retryCount: { type: Number, default: 2 },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true }
);

const logisticsRuleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    mode: {
      type: String,
      enum: ['standard', 'premium', 'sea_freight', 'air_freight', 'express', 'road', 'rail', 'fob', 'cif', 'ddp', 'dap', 'supplier'],
      required: true,
    },
    incoterm: { type: String, trim: true, default: '' },
    eta: { type: String, trim: true, default: '' },
    countries: [{ type: String, trim: true }],
    minWeightKg: { type: Number, default: 0 },
    maxWeightKg: { type: Number, default: null },
    baseCharge: { type: Number, default: 0 },
    variableRate: { type: Number, default: 0 },
    providerKey: { type: String, trim: true, default: 'manual' },
    internalBreakdown: {
      freight: { type: Number, default: 0 },
      insurance: { type: Number, default: 0 },
      handling: { type: Number, default: 0 },
      packaging: { type: Number, default: 0 },
      documentation: { type: Number, default: 0 },
      fuel: { type: Number, default: 0 },
      loading: { type: Number, default: 0 },
      portCharges: { type: Number, default: 0 },
      exportCharges: { type: Number, default: 0 },
      importCharges: { type: Number, default: 0 },
      taxes: { type: Number, default: 0 },
      serviceCharges: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const commerceSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    platformFeeSlabs: [feeSlabSchema],
    providers: [providerSchema],
    logisticsRules: [logisticsRuleSchema],
    gstRate: { type: Number, default: 0.18 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

commerceSettingsSchema.index({ 'providers.type': 1, 'providers.status': 1 });
commerceSettingsSchema.index({ 'logisticsRules.mode': 1, 'logisticsRules.isActive': 1 });

export default mongoose.models.CommerceSettings || mongoose.model('CommerceSettings', commerceSettingsSchema);
