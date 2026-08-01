import mongoose from 'mongoose';
import { mediaIntegrityPlugin } from '../lib/media-integrity.js';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, trim: true, default: '' },
    image: { type: String, default: '' },
    icon: { type: String, default: '' },
    metadata: {
      title: String,
      keywords: [String],
      sortOrder: { type: Number, default: 0 },
      isFeatured: { type: Boolean, default: false },
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

categorySchema.index({ isActive: 1, 'metadata.sortOrder': 1, name: 1 });
categorySchema.index({ name: 'text', slug: 'text', description: 'text', 'metadata.keywords': 'text' });
categorySchema.plugin(mediaIntegrityPlugin, { entity: 'categories', paths: ['image'] });

export default mongoose.models.Category || mongoose.model('Category', categorySchema);
