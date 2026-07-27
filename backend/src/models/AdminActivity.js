import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorRole: { type: String, default: 'super_admin', index: true },
  action: { type: String, required: true, index: true },
  resource: { type: String, required: true, index: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId, index: true },
  summary: { type: String, required: true },
  reason: String,
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: String,
  userAgent: String,
}, { timestamps: true });

schema.index({ resource: 1, resourceId: 1, createdAt: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ action: 'text', resource: 'text', summary: 'text', reason: 'text' });

export default mongoose.models.AdminActivity || mongoose.model('AdminActivity', schema);
