import mongoose from 'mongoose';

const savedItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemType: { type: String, enum: ['product', 'supplier'], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
  },
  { timestamps: true }
);

savedItemSchema.index(
  { userId: 1, itemType: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      itemType: 'product',
      productId: { $type: 'objectId' },
    },
  }
);
savedItemSchema.index(
  { userId: 1, itemType: 1, sellerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      itemType: 'supplier',
      sellerId: { $type: 'objectId' },
    },
  }
);

export default mongoose.models.SavedItem || mongoose.model('SavedItem', savedItemSchema);
