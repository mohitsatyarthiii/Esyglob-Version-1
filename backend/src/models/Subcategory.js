import mongoose from 'mongoose';

const subcategorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
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

subcategorySchema.index({ categoryId: 1, slug: 1 }, { unique: true });
subcategorySchema.index({ categoryId: 1, isActive: 1, 'metadata.sortOrder': 1, name: 1 });
subcategorySchema.index({ name: 'text', slug: 'text', description: 'text', 'metadata.keywords': 'text' });

export default mongoose.models.Subcategory || mongoose.model('Subcategory', subcategorySchema);
