import mongoose from 'mongoose';

const productCategoryMappingSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcategory',
      index: true,
    },
    isPrimary: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productCategoryMappingSchema.index({ productId: 1, categoryId: 1, subcategoryId: 1 }, { unique: true });
productCategoryMappingSchema.index({ categoryId: 1, subcategoryId: 1 });

export default mongoose.models.ProductCategoryMapping ||
  mongoose.model('ProductCategoryMapping', productCategoryMappingSchema);
